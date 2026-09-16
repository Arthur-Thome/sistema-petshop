const pool = require("../database/connection");

// padrão utilizado para log
const { registrarLog } = require("../services/logService");

/*
 * Registra a entrada de um pet na creche.
 *
 * Somente pets existentes e ativos podem entrar.
 * A proteção contra uma segunda permanência aberta
 * também existe no PostgreSQL.
 */
async function registrarEntrada(req, res) {
  try {
    const { pet_id, observacoes } = req.body;

    const petId = Number(pet_id);

    if (!Number.isInteger(petId) || petId <= 0) {
      return res.status(400).json({
        mensagem: "Informe um pet válido.",
      });
    }

    /*
     * Verificamos o cadastro diretamente no banco.
     * Pets inativos permanecem no histórico, mas não
     * podem iniciar um novo atendimento.
     */
    const resultadoPet = await pool.query(
      `
        SELECT
          id,
          nome,
          tutor_id,
          ativo
        FROM pets
        WHERE id = $1
      `,
      [petId]
    );

    if (resultadoPet.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }

    const pet = resultadoPet.rows[0];

    if (!pet.ativo) {
      return res.status(400).json({
        mensagem:
          "Não é possível registrar a entrada de um pet inativo.",
      });
    }

    /*
     * Essa verificação permite devolver uma mensagem
     * amigável ao funcionário antes do INSERT.
     *
     * O índice UNIQUE parcial existente no PostgreSQL
     * continua sendo a proteção definitiva.
     */
    const resultadoAberto = await pool.query(
      `
        SELECT id
        FROM creche
        WHERE pet_id = $1
          AND status = 'NA_CRECHE'
        LIMIT 1
      `,
      [petId]
    );

    if (resultadoAberto.rows.length > 0) {
      return res.status(409).json({
        mensagem: "Este pet já está na creche.",
      });
    }

    const resultado = await pool.query(
      `
        INSERT INTO creche (
          pet_id,
          observacoes_entrada,
          usuario_entrada_id
        )
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [
        petId,
        observacoes?.trim() || null,
        req.usuario.id,
      ]
    );

    const registro = resultado.rows[0];

    /*
     * A tabela creche guarda o histórico operacional.
     * O log geral registra a ação para auditoria.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "ENTRADA_CRECHE",
        entidade: "creche",
        registroId: registro.id,
        valorAnterior: null,
        valorNovo: registro,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Entrada registrada, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(201).json({
      mensagem: "Entrada registrada com sucesso.",
      registro,
    });
  } catch (error) {
    /*
     * 23505 é a violação de UNIQUE do PostgreSQL.
     * Isso cobre inclusive duas requisições simultâneas
     * tentando registrar o mesmo pet.
     */
    if (error.code === "23505") {
      return res.status(409).json({
        mensagem: "Este pet já está na creche.",
      });
    }

    console.error(
      "Erro ao registrar entrada na creche:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao registrar entrada na creche.",
    });
  }
}


/*
 * Retorna somente as permanências atualmente abertas.
 *
 * Pet, tutor e funcionário são retornados na mesma
 * consulta para simplificar a futura tela da Creche.
 */
async function listarPetsNaCreche(req, res) {
  try {
    const resultado = await pool.query(
      `
        SELECT
          c.id,
          c.pet_id,
          c.entrada_em,
          c.observacoes_entrada,
          c.status,

          p.nome AS pet_nome,
          p.especie,
          p.raca,
          p.foto,

          t.id AS tutor_id,
          t.nome AS tutor_nome,
          t.telefone AS tutor_telefone,

          u.nome AS usuario_entrada_nome

        FROM creche c

        INNER JOIN pets p
          ON p.id = c.pet_id

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        INNER JOIN usuarios u
          ON u.id = c.usuario_entrada_id

        WHERE c.status = 'NA_CRECHE'

        ORDER BY c.entrada_em ASC
      `
    );

    return res.status(200).json({
      registros: resultado.rows,
    });
  } catch (error) {
    console.error(
      "Erro ao listar pets na creche:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar os pets da creche.",
    });
  }
}

/*
 * Registra a saída de um pet da Creche.
 *
 * O registro original não é excluído. Ele é finalizado,
 * preservando entrada, saída, observações e responsáveis.
 */
/*
 * Registra a saída de um pet da Creche.
 *
 * A permanência não é excluída. O registro é finalizado
 * para preservar todo o histórico de entrada e saída.
 */
async function registrarSaida(req, res) {
  let client;

  try {
    /*
     * A conexão é obtida dentro do try para que uma
     * eventual falha do PostgreSQL também seja tratada.
     */
    client = await pool.connect();

    const registroId = Number(req.params.id);
    const { observacoes } = req.body;

    if (
      !Number.isInteger(registroId) ||
      registroId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um registro válido da creche.",
      });
    }

    await client.query("BEGIN");

    /*
     * O FOR UPDATE impede que dois usuários registrem
     * a saída da mesma permanência simultaneamente.
     */
    const resultadoAtual = await client.query(
      `
        SELECT
          c.*,
          p.nome AS pet_nome
        FROM creche c
        INNER JOIN pets p
          ON p.id = c.pet_id
        WHERE c.id = $1
        FOR UPDATE
      `,
      [registroId]
    );

    if (resultadoAtual.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem:
          "Registro da creche não encontrado.",
      });
    }

    const registroAnterior =
      resultadoAtual.rows[0];

    if (
      registroAnterior.status !==
      "NA_CRECHE"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem:
          "A saída deste pet já foi registrada.",
      });
    }

    const resultado = await client.query(
      `
        UPDATE creche
        SET
          saida_em = CURRENT_TIMESTAMP,
          observacoes_saida = $1,
          usuario_saida_id = $2,
          status = 'FINALIZADO',
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `,
      [
        observacoes?.trim() || null,
        req.usuario.id,
        registroId,
      ]
    );

    const registroAtualizado =
      resultado.rows[0];

    await client.query("COMMIT");

    /*
     * O log é registrado depois da transação principal.
     * Uma eventual falha na auditoria não desfaz uma
     * saída que já foi confirmada no banco.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "SAIDA_CRECHE",
        entidade: "creche",
        registroId,
        valorAnterior: registroAnterior,
        valorNovo: registroAtualizado,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Saída registrada, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Saída registrada com sucesso.",
      registro: registroAtualizado,
    });
  } catch (error) {
    /*
     * Se a transação tiver sido iniciada e ocorrer algum
     * erro, tentamos desfazer as alterações.
     */
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (erroRollback) {
        console.error(
          "Erro ao desfazer transação da Creche:",
          erroRollback
        );
      }
    }

    console.error(
      "Erro ao registrar saída da creche:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao registrar saída da creche.",
    });
  } finally {
    /*
     * A conexão só é devolvida ao pool caso tenha
     * sido obtida com sucesso.
     */
    if (client) {
      client.release();
    }
  }
}


/*
 * Lista o histórico completo da Creche.
 *
 * Permite pesquisar pelo nome do pet ou do tutor.
 * Mantemos tanto permanências abertas quanto finalizadas
 * porque essa tela também servirá para consultas futuras.
 */
async function listarHistorico(req, res) {
  try {
    const { busca = "" } = req.query;

    const termo = `%${busca.trim()}%`;

    const resultado = await pool.query(
      `
        SELECT
          c.id,
          c.pet_id,
          c.entrada_em,
          c.saida_em,
          c.observacoes_entrada,
          c.observacoes_saida,
          c.status,

          p.nome AS pet_nome,
          p.especie,
          p.raca,
          p.foto,

          t.id AS tutor_id,
          t.nome AS tutor_nome,
          t.telefone AS tutor_telefone,

          ue.nome AS usuario_entrada_nome,
          us.nome AS usuario_saida_nome

        FROM creche c

        INNER JOIN pets p
          ON p.id = c.pet_id

        INNER JOIN tutores t
          ON t.id = p.tutor_id

        INNER JOIN usuarios ue
          ON ue.id = c.usuario_entrada_id

        LEFT JOIN usuarios us
          ON us.id = c.usuario_saida_id

        WHERE
          p.nome ILIKE $1
          OR t.nome ILIKE $1

        ORDER BY c.entrada_em DESC
      `,
      [termo]
    );

    return res.status(200).json({
      registros: resultado.rows,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar histórico da creche:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar o histórico da creche.",
    });
  }
}

module.exports = {
    registrarEntrada,
    listarPetsNaCreche,
    registrarSaida,
    listarHistorico,
};