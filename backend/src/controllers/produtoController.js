const pool = require("../database/connection");

const {
  registrarLog,
} = require("../services/logService");


/*
 * Converte os valores numéricos recebidos pela API.
 *
 * Campos opcionais vazios são transformados em null.
 * Valores preenchidos que não sejam números válidos
 * retornam NaN para que possam ser rejeitados.
 */
function converterNumero(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return null;
  }

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : NaN;
}


/*
 * Cadastra um produto/insumo utilizado pelo pet shop.
 *
 * Não existe uma lista fixa de produtos. O usuário poderá
 * cadastrar qualquer novo material diretamente pelo sistema.
 *
 * O valor unitário é opcional.
 */
async function cadastrarProduto(req, res) {
  try {
    const {
      nome,
      categoria,
      descricao,
      unidade = "un",
      valor_unitario,
      quantidade_atual = 0,
      quantidade_minima = 0,
      observacoes,
    } = req.body;


    if (!nome?.trim()) {
      return res.status(400).json({
        mensagem:
          "O nome do produto é obrigatório.",
      });
    }


    if (!unidade?.trim()) {
      return res.status(400).json({
        mensagem:
          "A unidade de medida é obrigatória.",
      });
    }


    const valorUnitario =
      converterNumero(valor_unitario);

    const quantidadeAtual =
      converterNumero(quantidade_atual);

    const quantidadeMinima =
      converterNumero(quantidade_minima);


    /*
     * O valor não precisa ser informado.
     * Entretanto, quando informado, deve ser um número
     * válido maior ou igual a zero.
     */
    if (
      valorUnitario !== null &&
      (
        !Number.isFinite(valorUnitario) ||
        valorUnitario < 0
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um valor unitário válido.",
      });
    }


    /*
    * O estoque é controlado por embalagens/unidades inteiras.
    * Não aceitamos quantidades fracionadas.
    */
    if (
    !Number.isInteger(quantidadeAtual) ||
    quantidadeAtual < 0
    ) {
    return res.status(400).json({
        mensagem:
        "A quantidade inicial deve ser um número inteiro maior ou igual a zero.",
    });
    }


    if (
    !Number.isInteger(quantidadeMinima) ||
    quantidadeMinima < 0
    ) {
    return res.status(400).json({
        mensagem:
        "A quantidade mínima deve ser um número inteiro maior ou igual a zero.",
    });
    }


    const resultado = await pool.query(
      `
        INSERT INTO produtos (
          nome,
          categoria,
          descricao,
          unidade,
          valor_unitario,
          quantidade_atual,
          quantidade_minima,
          observacoes
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8
        )
        RETURNING *
      `,
      [
        nome.trim(),
        categoria?.trim() || null,
        descricao?.trim() || null,
        unidade.trim(),
        valorUnitario,
        quantidadeAtual,
        quantidadeMinima,
        observacoes?.trim() || null,
      ]
    );


    const produto = resultado.rows[0];


    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_PRODUTO",
      entidade: "produtos",
      registroId: produto.id,
      valorAnterior: null,
      valorNovo: produto,
      ip: req.ip,
    });


    return res.status(201).json({
      mensagem:
        "Produto cadastrado com sucesso.",
      produto,
    });
  } catch (error) {
    console.error(
      "Erro ao cadastrar produto:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao cadastrar produto.",
    });
  }
}


/*
 * Lista todos os produtos.
 *
 * A pesquisa pode encontrar resultados pelo nome,
 * categoria, descrição ou observações.
 */
async function listarProdutos(req, res) {
  try {
    const busca =
      req.query.busca?.trim() || "";


    const resultado = await pool.query(
      `
        SELECT
          id,
          nome,
          categoria,
          descricao,
          unidade,
          valor_unitario,
          quantidade_atual,
          quantidade_minima,
          observacoes,
          ativo,
          criado_em,
          atualizado_em,

          CASE
            WHEN quantidade_atual <= quantidade_minima
            THEN TRUE
            ELSE FALSE
          END AS estoque_baixo

        FROM produtos

        WHERE
          $1 = ''
          OR nome ILIKE '%' || $1 || '%'
          OR categoria ILIKE '%' || $1 || '%'
          OR descricao ILIKE '%' || $1 || '%'
          OR observacoes ILIKE '%' || $1 || '%'

        ORDER BY nome
      `,
      [busca]
    );


    return res.status(200).json(
      resultado.rows
    );
  } catch (error) {
    console.error(
      "Erro ao listar produtos:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao listar produtos.",
    });
  }
}


/*
 * Retorna todas as informações de um produto específico.
 */
async function buscarProdutoPorId(req, res) {
  try {
    const { id } = req.params;


    const resultado = await pool.query(
      `
        SELECT
          *,

          CASE
            WHEN quantidade_atual <= quantidade_minima
            THEN TRUE
            ELSE FALSE
          END AS estoque_baixo

        FROM produtos
        WHERE id = $1
      `,
      [id]
    );


    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    return res.status(200).json({
      produto: resultado.rows[0],
    });
  } catch (error) {
    console.error(
      "Erro ao buscar produto:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao buscar produto.",
    });
  }
}

/*
 * Edita os dados cadastrais do produto.
 *
 * A quantidade_atual NÃO pode ser modificada aqui.
 * Toda alteração de estoque deve passar pelas
 * movimentações para preservar o histórico.
 */
async function atualizarProduto(req, res) {
  try {
    const { id } = req.params;

    const {
      nome,
      categoria,
      descricao,
      unidade,
      valor_unitario,
      quantidade_minima,
      observacoes,
    } = req.body;


    const resultadoAnterior = await pool.query(
      `
        SELECT *
        FROM produtos
        WHERE id = $1
      `,
      [id]
    );


    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Produto não encontrado.",
      });
    }


    const produtoAnterior =
      resultadoAnterior.rows[0];


    if (!nome?.trim()) {
      return res.status(400).json({
        mensagem: "Informe o nome do produto.",
      });
    }


    if (!unidade?.trim()) {
      return res.status(400).json({
        mensagem: "Informe a unidade de controle.",
      });
    }


    const minimoNumerico =
      Number(quantidade_minima);


    if (
      !Number.isInteger(minimoNumerico) ||
      minimoNumerico < 0
    ) {
      return res.status(400).json({
        mensagem:
          "A quantidade mínima deve ser um número inteiro maior ou igual a zero.",
      });
    }


    let valorNumerico = null;

    if (
      valor_unitario !== null &&
      valor_unitario !== undefined &&
      valor_unitario !== ""
    ) {
      valorNumerico =
        Number(valor_unitario);

      if (
        !Number.isFinite(valorNumerico) ||
        valorNumerico < 0
      ) {
        return res.status(400).json({
          mensagem:
            "Informe um valor unitário válido.",
        });
      }
    }


    const resultado = await pool.query(
      `
        UPDATE produtos

        SET
          nome = $1,
          categoria = $2,
          descricao = $3,
          unidade = $4,
          valor_unitario = $5,
          quantidade_minima = $6,
          observacoes = $7,
          atualizado_em = CURRENT_TIMESTAMP

        WHERE id = $8

        RETURNING *
      `,
      [
        nome.trim(),
        categoria?.trim() || null,
        descricao?.trim() || null,
        unidade.trim(),
        valorNumerico,
        minimoNumerico,
        observacoes?.trim() || null,
        id,
      ]
    );


    const produtoAtualizado =
      resultado.rows[0];


    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "ALTERAR_PRODUTO",
        entidade: "produtos",
        registroId: Number(id),
        valorAnterior: produtoAnterior,
        valorNovo: produtoAtualizado,
        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Produto alterado, mas houve erro no log:",
        erroLog
      );
    }


    return res.status(200).json({
      mensagem:
        "Produto atualizado com sucesso.",

      produto: produtoAtualizado,
    });

  } catch (error) {
    console.error(
      "Erro ao atualizar produto:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao atualizar produto.",
    });
  }
}

/*
 * Produtos não são excluídos definitivamente.
 *
 * A inativação preserva o histórico de estoque
 * e os registros de auditoria.
 */
async function alterarStatusProduto(req, res) {
  try {
    const { id } = req.params;
    const { ativo } = req.body;


    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem:
          "O campo ativo deve ser verdadeiro ou falso.",
      });
    }


    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM produtos
          WHERE id = $1
        `,
        [id]
      );


    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    const produtoAnterior =
      resultadoAnterior.rows[0];


    const resultado = await pool.query(
      `
        UPDATE produtos

        SET
          ativo = $1,
          atualizado_em = CURRENT_TIMESTAMP

        WHERE id = $2

        RETURNING *
      `,
      [ativo, id]
    );


    const produtoAtualizado =
      resultado.rows[0];


    try {
      await registrarLog({
        usuarioId: req.usuario.id,

        acao:
          ativo
            ? "ATIVAR_PRODUTO"
            : "DESATIVAR_PRODUTO",

        entidade: "produtos",
        registroId: Number(id),

        valorAnterior: {
          ativo: produtoAnterior.ativo,
        },

        valorNovo: {
          ativo: produtoAtualizado.ativo,
        },

        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Status alterado, mas houve erro no log:",
        erroLog
      );
    }


    return res.status(200).json({
      mensagem:
        ativo
          ? "Produto ativado com sucesso."
          : "Produto inativado com sucesso.",

      produto: produtoAtualizado,
    });

  } catch (error) {
    console.error(
      "Erro ao alterar status do produto:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao alterar status do produto.",
    });
  }
}

module.exports = {
  cadastrarProduto,
  listarProdutos,
  buscarProdutoPorId,
  atualizarProduto,
  alterarStatusProduto,
};