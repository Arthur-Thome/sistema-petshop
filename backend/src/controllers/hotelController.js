const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");


/*
 * Converte uma data recebida pelo frontend e verifica
 * se ela representa uma data/hora válida.
 */
function dataValida(valor) {
  if (!valor) {
    return false;
  }

  return !Number.isNaN(
    new Date(valor).getTime()
  );
}


/*
 * Cria uma nova reserva de Hotel.
 *
 * Neste momento a reserva nasce como AGENDADO.
 * O status HOSPEDADO será utilizado somente depois
 * que o check-in realmente acontecer.
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

    /*
     * Validamos os dados antes de abrir uma transação.
     * Isso evita reservar uma conexão do PostgreSQL
     * desnecessariamente para requisições inválidas.
     */
    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um pet válido.",
      });
    }

    if (
      !dataValida(entrada_prevista) ||
      !dataValida(saida_prevista)
    ) {
      return res.status(400).json({
        mensagem:
          "Informe datas válidas para entrada e saída.",
      });
    }

    const entrada = new Date(
      entrada_prevista
    );

    const saida = new Date(
      saida_prevista
    );

    if (saida <= entrada) {
      return res.status(400).json({
        mensagem:
          "A saída prevista deve ser posterior à entrada prevista.",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transacaoIniciada = true;

    /*
     * Lock transacional por pet.
     *
     * Se dois funcionários tentarem criar reservas para
     * o mesmo pet simultaneamente, somente uma transação
     * poderá continuar por vez.
     *
     * O lock é liberado automaticamente no COMMIT ou
     * ROLLBACK.
     *
     * Reservas de pets diferentes não se bloqueiam.
     */
    await client.query(
      "SELECT pg_advisory_xact_lock($1)",
      [petId]
    );

    /*
     * O pet é consultado dentro da mesma transação.
     * Não permitimos novas reservas para pets inativos.
     */
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
     * Dessa forma, períodos que apenas encostam são
     * permitidos:
     *
     * Reserva A: 08:00 até 10:00
     * Reserva B: 10:00 até 12:00
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

    /*
     * Somente após adquirir o lock e verificar conflitos
     * a nova reserva é inserida.
     */
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
          observacoes?.trim() || null,
          req.usuario.id,
        ]
      );

    const reserva =
      resultado.rows[0];

    await client.query("COMMIT");
    transacaoIniciada = false;

    /*
     * O log é registrado somente depois que a reserva
     * foi confirmada no banco. Assim não criamos um
     * histórico de uma operação que sofreu rollback.
     */
    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_RESERVA_HOTEL",
      entidade: "hotel",
      entidadeId: reserva.id,
      dadosAnteriores: null,
      dadosNovos: reserva,
      ip: req.ip,
    });

    return res.status(201).json({
      mensagem:
        "Reserva do Hotel criada com sucesso.",
      reserva,
    });
  } catch (error) {
    /*
     * Só tentamos rollback se a transação realmente
     * chegou a ser iniciada.
     */
    if (
      client &&
      transacaoIniciada
    ) {
      try {
        await client.query(
          "ROLLBACK"
        );
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
    /*
     * Toda conexão retirada do Pool precisa ser
     * devolvida, inclusive quando ocorrer erro.
     */
    if (client) {
      client.release();
    }
  }
}

/*
 * Lista as reservas e hospedagens que ainda fazem
 * parte da operação atual do Hotel.
 *
 * FINALIZADO e CANCELADO ficarão no histórico,
 * que criaremos posteriormente.
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
 * Realiza o check-in de uma reserva do Hotel.
 *
 * Somente uma reserva AGENDADO pode receber check-in.
 * O horário real é registrado separadamente da
 * entrada prevista para preservar o histórico.
 */
async function realizarCheckin(req, res) {
  let client;

  try {
    client = await pool.connect();

    const reservaId = Number(req.params.id);
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

    await client.query("BEGIN");

    /*
     * Bloqueamos a reserva enquanto o check-in
     * é processado para impedir duas alterações
     * simultâneas no mesmo registro.
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

      return res.status(404).json({
        mensagem:
          "Reserva do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];


    /*
     * Uma reserva finalizada, cancelada ou que já
     * recebeu check-in não pode ser utilizada novamente.
     */
    if (
      reservaAnterior.status !== "AGENDADO"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem:
          "Somente reservas agendadas podem receber check-in.",
      });
    }


    if (!reservaAnterior.pet_ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Não é possível realizar check-in de um pet inativo.",
      });
    }


    /*
     * Também verificamos se o pet já possui outra
     * hospedagem aberta.
     *
     * O índice parcial criado no PostgreSQL funciona
     * como uma segunda camada de proteção.
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
          observacoes?.trim() || null,
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");


    /*
     * O check-in também faz parte da auditoria.
     */
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
    /*
     * 23505 também protege contra duas hospedagens
     * abertas para o mesmo pet através do índice
     * parcial do PostgreSQL.
     */
    if (client) {
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
 * Mantemos reserva, check-in e check-out no mesmo registro
 * para preservar todo o histórico da hospedagem.
 */
async function realizarCheckout(req, res) {
  let client;

  try {
    client = await pool.connect();

    const reservaId = Number(req.params.id);
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

    await client.query("BEGIN");

    /*
     * Bloqueamos o registro durante a operação para
     * impedir dois check-outs simultâneos.
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

      return res.status(404).json({
        mensagem:
          "Hospedagem do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];

    /*
     * Uma reserva AGENDADO ainda não recebeu check-in.
     * FINALIZADO e CANCELADO também não podem receber
     * um novo check-out.
     */
    if (
      reservaAnterior.status !==
      "HOSPEDADO"
    ) {
      await client.query("ROLLBACK");

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
          observacoes?.trim() || null,
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");

    /*
     * Registramos quem realizou a operação e os valores
     * anteriores e posteriores para auditoria.
     */
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
    if (client) {
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
 * Não excluímos a reserva porque o cancelamento também
 * faz parte do histórico operacional do Hotel.
 */
async function cancelarReserva(req, res) {
  let client;

  try {
    client = await pool.connect();

    const reservaId = Number(req.params.id);
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

    /*
     * Exigimos um motivo para que futuramente seja
     * possível entender por que a reserva foi cancelada.
     */
    if (
      !motivo ||
      !motivo.trim()
    ) {
      return res.status(400).json({
        mensagem:
          "Informe o motivo do cancelamento.",
      });
    }

    await client.query("BEGIN");

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

      return res.status(404).json({
        mensagem:
          "Reserva do Hotel não encontrada.",
      });
    }

    const reservaAnterior =
      resultadoReserva.rows[0];

    /*
     * Uma hospedagem que já recebeu check-in deve seguir
     * o fluxo de check-out, não o de cancelamento.
     */
    if (
      reservaAnterior.status !==
      "AGENDADO"
    ) {
      await client.query("ROLLBACK");

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
          motivo.trim(),
          req.usuario.id,
          reservaId,
        ]
      );

    const reservaAtualizada =
      resultadoAtualizacao.rows[0];

    await client.query("COMMIT");

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
    if (client) {
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
 * Diferentemente da rota /ativos, esta consulta também
 * retorna hospedagens FINALIZADO e reservas CANCELADO.
 *
 * A busca pode ser feita pelo nome do pet ou do tutor.
 */
async function listarHistorico(req, res) {
  try {
    const busca =
      req.query.busca?.trim() || "";

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
 * Retorna todos os dados de uma reserva/hospedagem.
 *
 * Esta consulta é usada na tela de detalhes e inclui
 * os funcionários responsáveis por cada operação,
 * além das observações registradas durante o fluxo.
 */
async function buscarHotelPorId(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
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

    if (resultado.rows.length === 0) {
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