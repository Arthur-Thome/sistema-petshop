const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

const LIMITE_OBSERVACOES = 2000;
const LIMITE_MOTIVO_CANCELAMENTO = 1000;
const LIMITE_BUSCA = 100;


/*
 * Normaliza textos opcionais utilizados pelo Hotel.
 *
 * Valores vazios ou contendo apenas espaços são armazenados
 * como null, mantendo o banco mais consistente.
 */
function normalizarTextoOpcional(valor) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }

  if (typeof valor !== "string") {
    return null;
  }

  const texto = valor.trim();

  return texto || null;
}


/*
 * Valida campos de texto opcionais antes de acessar o banco.
 *
 * Os campos correspondentes são TEXT no PostgreSQL e não possuem
 * limite próprio. A API aplica limites para evitar requisições
 * excessivamente grandes.
 */
function validarTextoOpcional(
  valor,
  nomeCampo,
  limite
) {
  if (
    valor !== undefined &&
    valor !== null &&
    typeof valor !== "string"
  ) {
    return `${nomeCampo} deve ser um texto.`;
  }

  const texto =
    normalizarTextoOpcional(valor);

  if (
    texto &&
    texto.length > limite
  ) {
    return `${nomeCampo} deve possuir no máximo ${limite} caracteres.`;
  }

  return null;
}


/*
 * Converte e valida datas recebidas pelo frontend.
 *
 * O valor precisa existir, ser string e representar
 * uma data/hora válida para ser aceito pela API.
 */
function converterData(valor) {
  if (
    typeof valor !== "string" ||
    !valor.trim()
  ) {
    return null;
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return null;
  }

  return data;
}


/*
 * Cria uma nova reserva do Hotel.
 *
 * A reserva nasce com status AGENDADO. O pet somente passa
 * para HOSPEDADO quando o check-in for efetivamente realizado.
 */
async function criarReserva(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const {
      pet_id,
      entrada_prevista,
      saida_prevista,
      observacoes,
    } = req.body;

    const petId = Number(pet_id);

    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um pet válido.",
      });
    }

    const entrada =
      converterData(entrada_prevista);

    const saida =
      converterData(saida_prevista);

    if (!entrada || !saida) {
      return res.status(400).json({
        mensagem:
          "Informe datas válidas para entrada e saída.",
      });
    }

    if (saida <= entrada) {
      return res.status(400).json({
        mensagem:
          "A saída prevista deve ser posterior à entrada prevista.",
      });
    }

    const erroObservacoes =
      validarTextoOpcional(
        observacoes,
        "As observações",
        LIMITE_OBSERVACOES
      );

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarTextoOpcional(observacoes);

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * O advisory lock serializa operações de reserva para
     * o mesmo pet durante esta transação.
     *
     * Assim, duas requisições simultâneas não conseguem
     * passar juntas pela verificação de conflito.
     */
    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [petId]
    );

    const petResult =
      await client.query(
        `
          SELECT
            id,
            nome,
            ativo
          FROM pets
          WHERE id = $1
        `,
        [petId]
      );

    if (petResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }

    const pet = petResult.rows[0];

    if (!pet.ativo) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Não é possível criar uma reserva para um pet inativo.",
      });
    }

    /*
     * Dois períodos entram em conflito quando:
     *
     * nova entrada < saída existente
     * E
     * nova saída > entrada existente
     *
     * Períodos que apenas se encontram no mesmo horário
     * continuam permitidos.
     */
    const conflitoResult =
      await client.query(
        `
          SELECT
            id,
            entrada_prevista,
            saida_prevista,
            status
          FROM hotel
          WHERE pet_id = $1
            AND status IN (
              'AGENDADO',
              'HOSPEDADO'
            )
            AND $2::timestamp <
                saida_prevista
            AND $3::timestamp >
                entrada_prevista
          LIMIT 1
        `,
        [
          petId,
          entrada_prevista,
          saida_prevista,
        ]
      );

    if (
      conflitoResult.rows.length > 0
    ) {
      const conflito =
        conflitoResult.rows[0];

      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Este pet já possui uma reserva ou hospedagem que entra em conflito com o período informado.",

        conflito: {
          id: conflito.id,
          entrada_prevista:
            conflito.entrada_prevista,
          saida_prevista:
            conflito.saida_prevista,
          status: conflito.status,
        },
      });
    }

    const resultado =
      await client.query(
        `
          INSERT INTO hotel (
            pet_id,
            entrada_prevista,
            saida_prevista,
            observacoes_reserva,
            usuario_criacao_id,
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'AGENDADO'
          )
          RETURNING *
        `,
        [
          petId,
          entrada_prevista,
          saida_prevista,
          observacoesNormalizadas,
          req.usuario.id,
        ]
      );

    const reserva =
      resultado.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    /*
     * O log é criado somente depois que a reserva foi
     * confirmada no banco.
     *
     * Utilizamos os mesmos nomes de propriedades adotados
     * pelo restante do sistema.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "CRIAR_RESERVA_HOTEL",
        entidade: "hotel",
        registroId: reserva.id,
        valorAnterior: null,
        valorNovo: reserva,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Reserva criada, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(201).json({
      mensagem:
        "Reserva do Hotel criada com sucesso.",
      reserva,
    });
  } catch (error) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Erro ao desfazer transação da reserva:",
          rollbackError
        );
      }
    }

    console.error(
      "Erro ao criar reserva do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao criar a reserva do Hotel.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Lista reservas e hospedagens que ainda fazem parte
 * da operação atual do Hotel.
 */
async function listarReservasAtivas(req, res) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          h.id,
          h.pet_id,
          h.entrada_prevista,
          h.saida_prevista,
          h.checkin_em,
          h.observacoes_reserva,
          h.observacoes_checkin,
          h.status,
          h.criado_em,

          p.nome AS pet_nome,
          p.especie,
          p.raca,
          p.foto,

          t.id AS tutor_id,
          t.nome AS tutor_nome,
          t.telefone AS tutor_telefone,

          u.nome AS usuario_criacao_nome,
          uc.nome AS usuario_checkin_nome

        FROM hotel h

        INNER JOIN pets p
          ON p.id = h.pet_id

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        INNER JOIN usuarios u
          ON u.id = h.usuario_criacao_id

        LEFT JOIN usuarios uc
          ON uc.id = h.usuario_checkin_id

        WHERE h.status IN (
          'AGENDADO',
          'HOSPEDADO'
        )

        ORDER BY
          CASE
            WHEN h.status = 'HOSPEDADO'
              THEN 0
            ELSE 1
          END,
          h.entrada_prevista ASC
      `
    );

    return res.status(200).json({
      reservas: resultado.rows,
    });
  } catch (error) {
    console.error(
      "Erro ao listar reservas do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar as reservas do Hotel.",
    });
  }
}


/*
 * Realiza o check-in de uma reserva.
 *
 * Somente registros AGENDADO podem receber check-in.
 */
async function realizarCheckin(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const reservaId =
      Number(req.params.id);

    const { observacoes } = req.body;

    if (
      !Number.isInteger(reservaId) ||
      reservaId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe uma reserva válida.",
      });
    }

    const erroObservacoes =
      validarTextoOpcional(
        observacoes,
        "As observações",
        LIMITE_OBSERVACOES
      );

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarTextoOpcional(observacoes);

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * FOR UPDATE impede que duas alterações concorrentes
     * sejam realizadas sobre a mesma reserva.
     */
    const resultadoReserva =
      await client.query(
        `
          SELECT
            h.*,
            p.nome AS pet_nome,
            p.ativo AS pet_ativo
          FROM hotel h

          INNER JOIN pets p
            ON p.id = h.pet_id

          WHERE h.id = $1

          FOR UPDATE
        `,
        [reservaId]
      );

    if (
      resultadoReserva.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Reserva do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];

    if (
      reservaAnterior.status !==
      "AGENDADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente reservas agendadas podem receber check-in.",
      });
    }

    if (!reservaAnterior.pet_ativo) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(400).json({
        mensagem:
          "Não é possível realizar check-in de um pet inativo.",
      });
    }

    /*
     * Também verificamos se existe outra hospedagem aberta
     * para o mesmo pet.
     *
     * O índice parcial do PostgreSQL continua sendo a camada
     * definitiva de proteção contra duplicidade.
     */
    const resultadoHospedagem =
      await client.query(
        `
          SELECT id
          FROM hotel
          WHERE pet_id = $1
            AND status = 'HOSPEDADO'
            AND id <> $2
          LIMIT 1
        `,
        [
          reservaAnterior.pet_id,
          reservaId,
        ]
      );

    if (
      resultadoHospedagem.rows.length > 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Este pet já está hospedado no Hotel.",
      });
    }

    const resultadoAtualizacao =
      await client.query(
        `
          UPDATE hotel
          SET
            checkin_em = CURRENT_TIMESTAMP,
            observacoes_checkin = $1,
            usuario_checkin_id = $2,
            status = 'HOSPEDADO',
            atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `,
        [
          observacoesNormalizadas,
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "CHECKIN_HOTEL",
        entidade: "hotel",
        registroId: reservaId,
        valorAnterior: reservaAnterior,
        valorNovo: reservaAtualizada,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Check-in realizado, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Check-in realizado com sucesso.",
      reserva: reservaAtualizada,
    });
  } catch (error) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer transação do check-in:",
          erroRollback
        );
      }
    }

    if (error.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Este pet já está hospedado no Hotel.",
      });
    }

    console.error(
      "Erro ao realizar check-in do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao realizar o check-in.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Realiza o check-out de um pet atualmente hospedado.
 *
 * Somente registros HOSPEDADO podem ser finalizados.
 */
async function realizarCheckout(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const reservaId =
      Number(req.params.id);

    const { observacoes } = req.body;

    if (
      !Number.isInteger(reservaId) ||
      reservaId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe uma hospedagem válida.",
      });
    }

    const erroObservacoes =
      validarTextoOpcional(
        observacoes,
        "As observações",
        LIMITE_OBSERVACOES
      );

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarTextoOpcional(observacoes);

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * O registro permanece bloqueado até COMMIT/ROLLBACK,
     * impedindo dois check-outs simultâneos.
     */
    const resultadoReserva =
      await client.query(
        `
          SELECT
            h.*,
            p.nome AS pet_nome
          FROM hotel h

          INNER JOIN pets p
            ON p.id = h.pet_id

          WHERE h.id = $1

          FOR UPDATE
        `,
        [reservaId]
      );

    if (
      resultadoReserva.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Hospedagem do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];

    if (
      reservaAnterior.status !==
      "HOSPEDADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente pets atualmente hospedados podem receber check-out.",
      });
    }

    const resultadoAtualizacao =
      await client.query(
        `
          UPDATE hotel
          SET
            checkout_em = CURRENT_TIMESTAMP,
            observacoes_checkout = $1,
            usuario_checkout_id = $2,
            status = 'FINALIZADO',
            atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `,
        [
          observacoesNormalizadas,
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "CHECKOUT_HOTEL",
        entidade: "hotel",
        registroId: reservaId,
        valorAnterior: reservaAnterior,
        valorNovo: reservaAtualizada,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Check-out realizado, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Check-out realizado com sucesso.",
      reserva: reservaAtualizada,
    });
  } catch (error) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer transação do check-out:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao realizar check-out do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao realizar o check-out.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Cancela uma reserva que ainda não recebeu check-in.
 *
 * Reservas canceladas permanecem no banco para preservar
 * o histórico operacional.
 */
async function cancelarReserva(req, res) {
  let client;
  let transacaoIniciada = false;

  try {
    const reservaId =
      Number(req.params.id);

    const { motivo } = req.body;

    if (
      !Number.isInteger(reservaId) ||
      reservaId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe uma reserva válida.",
      });
    }

    if (
      typeof motivo !== "string" ||
      !motivo.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe o motivo do cancelamento.",
      });
    }

    const motivoNormalizado =
      motivo.trim();

    if (
      motivoNormalizado.length >
      LIMITE_MOTIVO_CANCELAMENTO
    ) {
      return res.status(400).json({
        mensagem:
          `O motivo do cancelamento deve possuir no máximo ${LIMITE_MOTIVO_CANCELAMENTO} caracteres.`,
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    const resultadoReserva =
      await client.query(
        `
          SELECT
            h.*,
            p.nome AS pet_nome
          FROM hotel h

          INNER JOIN pets p
            ON p.id = h.pet_id

          WHERE h.id = $1

          FOR UPDATE
        `,
        [reservaId]
      );

    if (
      resultadoReserva.rows.length === 0
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(404).json({
        mensagem:
          "Reserva do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];

    /*
     * Uma hospedagem que já recebeu check-in deve seguir
     * o fluxo de check-out e não pode ser cancelada.
     */
    if (
      reservaAnterior.status !==
      "AGENDADO"
    ) {
      await client.query("ROLLBACK");
      transacaoIniciada = false;

      return res.status(409).json({
        mensagem:
          "Somente reservas agendadas podem ser canceladas.",
      });
    }

    const resultadoAtualizacao =
      await client.query(
        `
          UPDATE hotel
          SET
            motivo_cancelamento = $1,
            usuario_cancelamento_id = $2,
            status = 'CANCELADO',
            atualizado_em = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `,
        [
          motivoNormalizado,
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "CANCELAR_RESERVA_HOTEL",
        entidade: "hotel",
        registroId: reservaId,
        valorAnterior: reservaAnterior,
        valorNovo: reservaAtualizada,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Reserva cancelada, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Reserva cancelada com sucesso.",
      reserva: reservaAtualizada,
    });
  } catch (error) {
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer cancelamento do Hotel:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao cancelar reserva do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao cancelar a reserva.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Lista o histórico completo do Hotel.
 *
 * A busca permite localizar pelo nome do pet ou tutor.
 * Limitamos o parâmetro para evitar entradas excessivamente
 * grandes em uma consulta operacional.
 */
async function listarHistorico(req, res) {
  try {
    const buscaRecebida =
      req.query.busca ?? "";

    if (
      typeof buscaRecebida !== "string"
    ) {
      return res.status(400).json({
        mensagem:
          "A busca informada é inválida.",
      });
    }

    const busca =
      buscaRecebida.trim();

    if (
      busca.length > LIMITE_BUSCA
    ) {
      return res.status(400).json({
        mensagem:
          `A busca deve possuir no máximo ${LIMITE_BUSCA} caracteres.`,
      });
    }

    const resultado = await pool.query(
      `
        SELECT
          h.id,
          h.pet_id,

          h.entrada_prevista,
          h.saida_prevista,

          h.checkin_em,
          h.checkout_em,

          h.observacoes_reserva,
          h.observacoes_checkin,
          h.observacoes_checkout,

          h.motivo_cancelamento,

          h.status,

          h.criado_em,
          h.atualizado_em,

          p.nome AS pet_nome,
          p.especie,
          p.raca,
          p.foto,

          t.id AS tutor_id,
          t.nome AS tutor_nome,
          t.telefone AS tutor_telefone,

          ucriacao.nome
            AS usuario_criacao_nome,

          ucheckin.nome
            AS usuario_checkin_nome,

          ucheckout.nome
            AS usuario_checkout_nome,

          ucancelamento.nome
            AS usuario_cancelamento_nome

        FROM hotel h

        INNER JOIN pets p
          ON p.id = h.pet_id

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        INNER JOIN usuarios ucriacao
          ON ucriacao.id =
             h.usuario_criacao_id

        LEFT JOIN usuarios ucheckin
          ON ucheckin.id =
             h.usuario_checkin_id

        LEFT JOIN usuarios ucheckout
          ON ucheckout.id =
             h.usuario_checkout_id

        LEFT JOIN usuarios ucancelamento
          ON ucancelamento.id =
             h.usuario_cancelamento_id

        WHERE (
          $1 = ''
          OR p.nome ILIKE '%' || $1 || '%'
          OR t.nome ILIKE '%' || $1 || '%'
        )

        ORDER BY
          h.entrada_prevista DESC,
          h.id DESC
      `,
      [busca]
    );

    return res.status(200).json({
      registros: resultado.rows,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar histórico do Hotel:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar o histórico do Hotel.",
    });
  }
}


/*
 * Retorna os detalhes completos de uma reserva/hospedagem.
 */
async function buscarHotelPorId(req, res) {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID da hospedagem inválido.",
      });
    }

    const resultado = await pool.query(
      `
        SELECT
          h.id,
          h.pet_id,

          h.entrada_prevista,
          h.saida_prevista,

          h.checkin_em,
          h.checkout_em,

          h.observacoes_reserva,
          h.observacoes_checkin,
          h.observacoes_checkout,

          h.motivo_cancelamento,

          h.status,

          h.criado_em,
          h.atualizado_em,

          p.nome AS pet_nome,
          p.especie,
          p.raca,
          p.sexo,
          p.foto,

          t.id AS tutor_id,
          t.nome AS tutor_nome,
          t.telefone AS tutor_telefone,
          t.email AS tutor_email,

          ucriacao.nome
            AS usuario_criacao_nome,

          ucheckin.nome
            AS usuario_checkin_nome,

          ucheckout.nome
            AS usuario_checkout_nome,

          ucancelamento.nome
            AS usuario_cancelamento_nome

        FROM hotel h

        INNER JOIN pets p
          ON p.id = h.pet_id

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        INNER JOIN usuarios ucriacao
          ON ucriacao.id =
             h.usuario_criacao_id

        LEFT JOIN usuarios ucheckin
          ON ucheckin.id =
             h.usuario_checkin_id

        LEFT JOIN usuarios ucheckout
          ON ucheckout.id =
             h.usuario_checkout_id

        LEFT JOIN usuarios ucancelamento
          ON ucancelamento.id =
             h.usuario_cancelamento_id

        WHERE h.id = $1
      `,
      [id]
    );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Reserva ou hospedagem não encontrada.",
      });
    }

    return res.status(200).json({
      hospedagem: resultado.rows[0],
    });
  } catch (error) {
    console.error(
      "Erro ao buscar hospedagem:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao buscar a hospedagem.",
    });
  }
}


module.exports = {
  criarReserva,
  listarReservasAtivas,
  listarHistorico,
  cancelarReserva,
  realizarCheckin,
  realizarCheckout,
  buscarHotelPorId,
};