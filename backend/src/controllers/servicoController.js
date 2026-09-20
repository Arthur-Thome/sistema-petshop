const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

/*
 * Cadastra um serviço oferecido no Banho e Tosa.
 *
 * Os serviços não ficam fixos no código para permitir que
 * novos tipos de atendimento sejam adicionados futuramente
 * sem necessidade de alterar a aplicação.
 */
async function cadastrarServico(req, res) {
  try {
    const {
      nome,
      descricao,
      valor,
      duracao_minutos,
    } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        mensagem:
          "Informe o nome do serviço.",
      });
    }

    /*
     * Valor é opcional, porém, quando informado,
     * não pode ser negativo.
     */
    if (
      valor !== null &&
      valor !== undefined &&
      valor !== ""
    ) {
      const valorNumerico = Number(valor);

      if (
        !Number.isFinite(valorNumerico) ||
        valorNumerico < 0
      ) {
        return res.status(400).json({
          mensagem:
            "O valor deve ser um número válido maior ou igual a zero.",
        });
      }
    }

    /*
     * A duração também é opcional, mas precisa representar
     * uma quantidade inteira e positiva de minutos.
     */
    if (
      duracao_minutos !== null &&
      duracao_minutos !== undefined &&
      duracao_minutos !== ""
    ) {
      const duracaoNumerica =
        Number(duracao_minutos);

      if (
        !Number.isInteger(duracaoNumerica) ||
        duracaoNumerica <= 0
      ) {
        return res.status(400).json({
          mensagem:
            "A duração deve ser informada em minutos inteiros maiores que zero.",
        });
      }
    }

    const resultado = await pool.query(
      `
        INSERT INTO servicos
        (
          nome,
          descricao,
          valor,
          duracao_minutos
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        nome.trim(),
        descricao?.trim() || null,
        valor === "" ||
        valor === null ||
        valor === undefined
          ? null
          : Number(valor),
        duracao_minutos === "" ||
        duracao_minutos === null ||
        duracao_minutos === undefined
          ? null
          : Number(duracao_minutos),
      ]
    );

    const servico = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_SERVICO",
      entidade: "servicos",
      registroId: servico.id,
      valorNovo: servico,
      ip: req.ip,
    });

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
 * Lista todos os serviços cadastrados.
 *
 * O parâmetro busca permite localizar pelo nome
 * ou pela descrição.
 */
async function listarServicos(req, res) {
  try {
    const { busca } = req.query;

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

      parametros.push(`%${busca}%`);
    }

    consulta += `
      ORDER BY
        ativo DESC,
        nome ASC
    `;

    const resultado = await pool.query(
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
 * Recupera um serviço específico para visualização
 * ou preenchimento do formulário de edição.
 */
async function buscarServicoPorId(req, res) {
  try {
    const servicoId = Number(req.params.id);

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

    if (resultado.rows.length === 0) {
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
 * Atualiza os dados do serviço e mantém os estados
 * anterior e posterior registrados na auditoria.
 */
async function atualizarServico(req, res) {
  try {
    const servicoId = Number(req.params.id);

    const {
      nome,
      descricao,
      valor,
      duracao_minutos,
    } = req.body;

    if (
      !Number.isInteger(servicoId) ||
      servicoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um serviço válido.",
      });
    }

    if (!nome || !nome.trim()) {
      return res.status(400).json({
        mensagem:
          "Informe o nome do serviço.",
      });
    }

    if (
      valor !== null &&
      valor !== undefined &&
      valor !== ""
    ) {
      const valorNumerico = Number(valor);

      if (
        !Number.isFinite(valorNumerico) ||
        valorNumerico < 0
      ) {
        return res.status(400).json({
          mensagem:
            "O valor deve ser um número válido maior ou igual a zero.",
        });
      }
    }

    if (
      duracao_minutos !== null &&
      duracao_minutos !== undefined &&
      duracao_minutos !== ""
    ) {
      const duracaoNumerica =
        Number(duracao_minutos);

      if (
        !Number.isInteger(duracaoNumerica) ||
        duracaoNumerica <= 0
      ) {
        return res.status(400).json({
          mensagem:
            "A duração deve ser informada em minutos inteiros maiores que zero.",
        });
      }
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

    const resultado = await pool.query(
      `
        UPDATE servicos
        SET
          nome = $1,
          descricao = $2,
          valor = $3,
          duracao_minutos = $4,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `,
      [
        nome.trim(),
        descricao?.trim() || null,
        valor === "" ||
        valor === null ||
        valor === undefined
          ? null
          : Number(valor),
        duracao_minutos === "" ||
        duracao_minutos === null ||
        duracao_minutos === undefined
          ? null
          : Number(duracao_minutos),
        servicoId,
      ]
    );

    const atualizado =
      resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "ALTERAR_SERVICO",
      entidade: "servicos",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });

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
 * Serviços não são apagados fisicamente.
 * A inativação preserva atendimentos antigos e auditoria.
 */
async function alterarStatusServico(req, res) {
  try {
    const servicoId = Number(req.params.id);
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
      return res.status(400).json({
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
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `,
      [ativo, servicoId]
    );

    const atualizado =
      resultado.rows[0];

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