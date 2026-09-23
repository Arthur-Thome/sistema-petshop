const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

const LIMITE_NOME = 150;
const LIMITE_DESCRICAO = 2000;
const LIMITE_BUSCA = 100;

// NUMERIC(10,2): 8 dígitos antes da vírgula e 2 depois.
const VALOR_MAXIMO = 99999999.99;

// Limite operacional para impedir durações absurdas.
// 43.200 minutos equivalem a aproximadamente 30 dias.
const DURACAO_MAXIMA_MINUTOS = 43200;


/*
 * Normaliza os textos utilizados no cadastro.
 *
 * Campos opcionais vazios são convertidos para null para
 * manter o banco consistente.
 */
function normalizarTexto(valor) {
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
 * Valida e normaliza os dados principais de um serviço.
 *
 * Esta função é compartilhada entre cadastro e edição para
 * impedir que as duas operações adotem regras diferentes.
 */
function validarDadosServico({
  nome,
  descricao,
  valor,
  duracao_minutos,
}) {
  if (
    typeof nome !== "string" ||
    !nome.trim()
  ) {
    return {
      erro: "Informe o nome do serviço.",
    };
  }

  const nomeNormalizado = nome.trim();

  if (
    nomeNormalizado.length >
    LIMITE_NOME
  ) {
    return {
      erro:
        `O nome do serviço deve possuir no máximo ${LIMITE_NOME} caracteres.`,
    };
  }

  if (
    descricao !== undefined &&
    descricao !== null &&
    typeof descricao !== "string"
  ) {
    return {
      erro:
        "A descrição deve ser um texto.",
    };
  }

  const descricaoNormalizada =
    normalizarTexto(descricao);

  if (
    descricaoNormalizada &&
    descricaoNormalizada.length >
      LIMITE_DESCRICAO
  ) {
    return {
      erro:
        `A descrição deve possuir no máximo ${LIMITE_DESCRICAO} caracteres.`,
    };
  }

  let valorNormalizado = null;

  if (
    valor !== undefined &&
    valor !== null &&
    valor !== ""
  ) {
    valorNormalizado = Number(valor);

    if (
      !Number.isFinite(valorNormalizado) ||
      valorNormalizado < 0
    ) {
      return {
        erro:
          "O valor deve ser um número válido maior ou igual a zero.",
      };
    }

    if (
      valorNormalizado >
      VALOR_MAXIMO
    ) {
      return {
        erro:
          "O valor informado ultrapassa o limite permitido.",
      };
    }

    /*
     * O banco utiliza NUMERIC(10,2). Impedimos valores
     * com mais de duas casas decimais para não depender
     * de arredondamentos implícitos do PostgreSQL.
     */
    if (
      Math.round(valorNormalizado * 100) !==
      valorNormalizado * 100
    ) {
      return {
        erro:
          "O valor deve possuir no máximo duas casas decimais.",
      };
    }
  }

  let duracaoNormalizada = null;

  if (
    duracao_minutos !== undefined &&
    duracao_minutos !== null &&
    duracao_minutos !== ""
  ) {
    duracaoNormalizada =
      Number(duracao_minutos);

    if (
      !Number.isInteger(
        duracaoNormalizada
      ) ||
      duracaoNormalizada <= 0
    ) {
      return {
        erro:
          "A duração deve ser informada em minutos inteiros maiores que zero.",
      };
    }

    if (
      duracaoNormalizada >
      DURACAO_MAXIMA_MINUTOS
    ) {
      return {
        erro:
          "A duração informada ultrapassa o limite permitido.",
      };
    }
  }

  return {
    dados: {
      nome: nomeNormalizado,
      descricao:
        descricaoNormalizada,
      valor: valorNormalizado,
      duracao_minutos:
        duracaoNormalizada,
    },
  };
}


/*
 * Cadastra um serviço.
 *
 * Os serviços permanecem configuráveis no banco para permitir
 * novos tipos de atendimento sem alterar o código da aplicação.
 */
async function cadastrarServico(req, res) {
  try {
    const validacao =
      validarDadosServico(req.body);

    if (validacao.erro) {
      return res.status(400).json({
        mensagem: validacao.erro,
      });
    }

    const {
      nome,
      descricao,
      valor,
      duracao_minutos,
    } = validacao.dados;

    const resultado = await pool.query(
      `
        INSERT INTO servicos (
          nome,
          descricao,
          valor,
          duracao_minutos
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        nome,
        descricao,
        valor,
        duracao_minutos,
      ]
    );

    const servico = resultado.rows[0];

    /*
     * A falha de auditoria não deve transformar um cadastro
     * já confirmado no banco em erro para o operador.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "CRIAR_SERVICO",
        entidade: "servicos",
        registroId: servico.id,
        valorAnterior: null,
        valorNovo: servico,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Serviço criado, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(201).json({
      mensagem:
        "Serviço cadastrado com sucesso.",
      servico,
    });
  } catch (erro) {
    console.error(
      "Erro ao cadastrar serviço:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Lista os serviços cadastrados.
 *
 * A busca pode localizar pelo nome ou descrição.
 */
async function listarServicos(req, res) {
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

    let consulta = `
      SELECT *
      FROM servicos
    `;

    const parametros = [];

    if (busca) {
      consulta += `
        WHERE
          nome ILIKE $1
          OR descricao ILIKE $1
      `;

      parametros.push(
        `%${busca}%`
      );
    }

    consulta += `
      ORDER BY
        ativo DESC,
        nome ASC
    `;

    const resultado =
      await pool.query(
        consulta,
        parametros
      );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar serviços:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Recupera um serviço específico.
 */
async function buscarServicoPorId(
  req,
  res
) {
  try {
    const servicoId =
      Number(req.params.id);

    if (
      !Number.isInteger(servicoId) ||
      servicoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um serviço válido.",
      });
    }

    const resultado = await pool.query(
      `
        SELECT *
        FROM servicos
        WHERE id = $1
      `,
      [servicoId]
    );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Serviço não encontrado.",
      });
    }

    return res.status(200).json({
      servico: resultado.rows[0],
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar serviço:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Atualiza um serviço existente.
 *
 * O estado anterior e o novo estado são mantidos na
 * auditoria para permitir rastreabilidade da alteração.
 */
async function atualizarServico(req, res) {
  try {
    const servicoId =
      Number(req.params.id);

    if (
      !Number.isInteger(servicoId) ||
      servicoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um serviço válido.",
      });
    }

    const validacao =
      validarDadosServico(req.body);

    if (validacao.erro) {
      return res.status(400).json({
        mensagem: validacao.erro,
      });
    }

    const {
      nome,
      descricao,
      valor,
      duracao_minutos,
    } = validacao.dados;

    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM servicos
          WHERE id = $1
        `,
        [servicoId]
      );

    if (
      resultadoAnterior.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Serviço não encontrado.",
      });
    }

    const anterior =
      resultadoAnterior.rows[0];

    const resultado = await pool.query(
      `
        UPDATE servicos
        SET
          nome = $1,
          descricao = $2,
          valor = $3,
          duracao_minutos = $4,
          atualizado_em =
            CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `,
      [
        nome,
        descricao,
        valor,
        duracao_minutos,
        servicoId,
      ]
    );

    const atualizado =
      resultado.rows[0];

    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "ALTERAR_SERVICO",
        entidade: "servicos",
        registroId: atualizado.id,
        valorAnterior: anterior,
        valorNovo: atualizado,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Serviço atualizado, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Serviço atualizado com sucesso.",
      servico: atualizado,
    });
  } catch (erro) {
    console.error(
      "Erro ao atualizar serviço:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Ativa ou inativa um serviço.
 *
 * O registro não é excluído fisicamente para preservar
 * atendimentos antigos e o histórico de auditoria.
 */
async function alterarStatusServico(
  req,
  res
) {
  try {
    const servicoId =
      Number(req.params.id);

    const { ativo } = req.body;

    if (
      !Number.isInteger(servicoId) ||
      servicoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um serviço válido.",
      });
    }

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem:
          "O campo ativo deve ser true ou false.",
      });
    }

    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM servicos
          WHERE id = $1
        `,
        [servicoId]
      );

    if (
      resultadoAnterior.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Serviço não encontrado.",
      });
    }

    const anterior =
      resultadoAnterior.rows[0];

    if (anterior.ativo === ativo) {
      return res.status(409).json({
        mensagem: ativo
          ? "Este serviço já está ativo."
          : "Este serviço já está inativo.",
      });
    }

    const resultado = await pool.query(
      `
        UPDATE servicos
        SET
          ativo = $1,
          atualizado_em =
            CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `,
      [ativo, servicoId]
    );

    const atualizado =
      resultado.rows[0];

    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: ativo
          ? "ATIVAR_SERVICO"
          : "DESATIVAR_SERVICO",
        entidade: "servicos",
        registroId: atualizado.id,
        valorAnterior: {
          ativo: anterior.ativo,
        },
        valorNovo: {
          ativo: atualizado.ativo,
        },
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Status alterado, mas houve erro ao gerar o log:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem: ativo
        ? "Serviço ativado com sucesso."
        : "Serviço inativado com sucesso.",
      servico: atualizado,
    });
  } catch (erro) {
    console.error(
      "Erro ao alterar status do serviço:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


module.exports = {
  cadastrarServico,
  listarServicos,
  buscarServicoPorId,
  atualizarServico,
  alterarStatusServico,
};