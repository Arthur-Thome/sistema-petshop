const pool = require("../database/connection");

// Serviço central utilizado para registrar ações importantes na auditoria.
const { registrarLog } = require("../services/logService");

const LIMITE_OBSERVACOES = 2000;
const LIMITE_BUSCA = 100;


/*
 * Normaliza um campo de observações.
 *
 * Strings contendo somente espaços são transformadas em null,
 * evitando armazenar valores vazios desnecessariamente no banco.
 */
function normalizarObservacoes(valor) {
  if (valor === undefined || valor === null) {
    return null;
  }

  if (typeof valor !== "string") {
    return null;
  }

  const texto = valor.trim();

  return texto || null;
}


/*
 * Valida as observações recebidas nas operações da Creche.
 *
 * O banco utiliza TEXT e, portanto, não possui limite próprio.
 * Aplicamos um limite na API para impedir entradas excessivamente
 * grandes e manter o campo adequado ao seu objetivo operacional.
 */
function validarObservacoes(valor) {
  if (
    valor !== undefined &&
    valor !== null &&
    typeof valor !== "string"
  ) {
    return "As observações devem ser um texto.";
  }

  const texto = normalizarObservacoes(valor);

  if (
    texto &&
    texto.length > LIMITE_OBSERVACOES
  ) {
    return `As observações devem possuir no máximo ${LIMITE_OBSERVACOES} caracteres.`;
  }

  return null;
}


/*
 * Registra a entrada de um pet na Creche.
 *
 * A operação utiliza uma transação para manter a consulta do pet
 * e o cadastro da permanência dentro da mesma unidade de trabalho.
 *
 * O índice UNIQUE parcial existente no PostgreSQL continua sendo
 * a proteção definitiva contra duas permanências abertas para
 * o mesmo pet.
 */
async function registrarEntrada(req, res) {
  let client;

  try {
    const { pet_id, observacoes } = req.body;

    const petId = Number(pet_id);

    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem: "Informe um pet válido.",
      });
    }

    const erroObservacoes =
      validarObservacoes(observacoes);

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarObservacoes(observacoes);

    client = await pool.connect();

    await client.query("BEGIN");

    /*
     * Bloqueamos o registro do pet durante esta operação.
     * Isso evita que alterações concorrentes no cadastro
     * ocorram enquanto a entrada está sendo processada.
     */
    const resultadoPet = await client.query(
      `
        SELECT
          id,
          nome,
          tutor_id,
          ativo
        FROM pets
        WHERE id = $1
        FOR UPDATE
      `,
      [petId]
    );

    if (resultadoPet.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }

    const pet = resultadoPet.rows[0];

    if (!pet.ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Não é possível registrar a entrada de um pet inativo.",
      });
    }

    /*
     * Esta consulta fornece uma mensagem amigável quando já
     * existe uma permanência aberta.
     *
     * A restrição UNIQUE do banco continua necessária porque
     * somente ela garante a regra contra concorrência.
     */
    const resultadoAberto = await client.query(
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
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem: "Este pet já está na creche.",
      });
    }

    const resultado = await client.query(
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
        observacoesNormalizadas,
        req.usuario.id,
      ]
    );

    const registro = resultado.rows[0];

    await client.query("COMMIT");

    /*
     * A operação principal já foi confirmada no banco.
     * Uma falha eventual no log não desfaz a entrada.
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

    /*
     * 23505 representa violação de UNIQUE no PostgreSQL.
     * Essa proteção cobre inclusive duas requisições
     * simultâneas tentando registrar o mesmo pet.
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
  } finally {
    if (client) {
      client.release();
    }
  }
}


/*
 * Retorna somente as permanências atualmente abertas.
 *
 * Pet, tutor e funcionário são retornados na mesma consulta
 * para simplificar a tela operacional da Creche.
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

        /*
        * O tutor exibido nas operações da Creche vem da
        * relação oficial pet_tutores.
        *
        * pets.tutor_id permanece apenas como compatibilidade
        * temporária com partes antigas do sistema.
        */
        INNER JOIN pet_tutores pt
          ON pt.pet_id = p.id
          AND pt.principal = TRUE

        INNER JOIN tutores t
          ON t.id = pt.tutor_id

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
 * O registro não é excluído. A permanência é finalizada para
 * preservar entrada, saída, observações e responsáveis.
 */
async function registrarSaida(req, res) {
  let client;

  try {
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

    const erroObservacoes =
      validarObservacoes(observacoes);

    if (erroObservacoes) {
      return res.status(400).json({
        mensagem: erroObservacoes,
      });
    }

    const observacoesNormalizadas =
      normalizarObservacoes(observacoes);

    /*
     * A conexão somente é obtida depois das validações básicas,
     * evitando ocupar uma conexão do pool para requisições
     * que já sabemos serem inválidas.
     */
    client = await pool.connect();

    await client.query("BEGIN");

    /*
     * FOR UPDATE impede dois usuários de registrarem a saída
     * da mesma permanência simultaneamente.
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
        observacoesNormalizadas,
        req.usuario.id,
        registroId,
      ]
    );

    const registroAtualizado =
      resultado.rows[0];

    await client.query("COMMIT");

    /*
     * O log é criado depois da confirmação da transação.
     * Falha de auditoria não deve desfazer uma saída válida.
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
    if (client) {
      client.release();
    }
  }
}


/*
 * Lista o histórico da Creche.
 *
 * A busca é limitada para evitar consultas com parâmetros
 * excessivamente grandes. A pesquisa continua permitindo
 * localizar pelo nome do pet ou do tutor.
 */
async function listarHistorico(req, res) {
  try {
    const buscaRecebida = req.query.busca ?? "";

    if (typeof buscaRecebida !== "string") {
      return res.status(400).json({
        mensagem: "A busca informada é inválida.",
      });
    }

    const busca = buscaRecebida.trim();

    if (busca.length > LIMITE_BUSCA) {
      return res.status(400).json({
        mensagem:
          `A busca deve possuir no máximo ${LIMITE_BUSCA} caracteres.`,
      });
    }

    const termo = `%${busca}%`;

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

        /*
        * O tutor exibido nas operações da Creche vem da
        * relação oficial pet_tutores.
        *
        * pets.tutor_id permanece apenas como compatibilidade
        * temporária com partes antigas do sistema.
        */
        INNER JOIN pet_tutores pt
          ON pt.pet_id = p.id
          AND pt.principal = TRUE

        INNER JOIN tutores t
          ON t.id = pt.tutor_id

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