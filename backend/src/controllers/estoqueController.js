const pool = require("../database/connection");

const {
  registrarLog,
} = require("../services/logService");


const TIPOS_MOVIMENTACAO = [
  "ENTRADA",
  "SAIDA",
  "AJUSTE_ENTRADA",
  "AJUSTE_SAIDA",
];


/*
 * Toda alteração de quantidade deve passar por este
 * controller. Assim mantemos um histórico completo
 * das entradas, saídas e ajustes realizados.
 */
async function movimentarEstoque(req, res) {
  const client = await pool.connect();

  try {
    const { produtoId } = req.params;

    const {
      tipo,
      quantidade,
      motivo,
    } = req.body;


    const tipoNormalizado =
      String(tipo || "")
        .trim()
        .toUpperCase();


    if (
      !TIPOS_MOVIMENTACAO.includes(
        tipoNormalizado
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Tipo de movimentação inválido.",
      });
    }


    const quantidadeNumerica =
      Number(quantidade);


    /*
     * O estoque representa unidades, caixas, pacotes etc.
     * Portanto não permitimos quantidades fracionadas.
     */
    if (
      !Number.isInteger(quantidadeNumerica) ||
      quantidadeNumerica <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "A quantidade deve ser um número inteiro maior que zero.",
      });
    }


    await client.query("BEGIN");


    /*
     * Bloqueamos o produto durante a transação para evitar
     * duas movimentações simultâneas calculando a partir
     * da mesma quantidade.
     */
    const resultadoProduto =
      await client.query(
        `
          SELECT *
          FROM produtos
          WHERE id = $1
          FOR UPDATE
        `,
        [produtoId]
      );


    if (resultadoProduto.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    const produto =
      resultadoProduto.rows[0];


    if (!produto.ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Não é possível movimentar um produto inativo.",
      });
    }


    const quantidadeAnterior =
      Number(produto.quantidade_atual);


    const adicionaEstoque =
      tipoNormalizado === "ENTRADA" ||
      tipoNormalizado === "AJUSTE_ENTRADA";


    const quantidadePosterior =
      adicionaEstoque
        ? quantidadeAnterior + quantidadeNumerica
        : quantidadeAnterior - quantidadeNumerica;


    /*
     * Estoque negativo nunca é permitido.
     */
    if (quantidadePosterior < 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          `Estoque insuficiente. Existem ${quantidadeAnterior} ${produto.unidade} disponíveis.`,
      });
    }


    const resultadoProdutoAtualizado =
      await client.query(
        `
          UPDATE produtos

          SET
            quantidade_atual = $1,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE id = $2

          RETURNING *
        `,
        [
          quantidadePosterior,
          produtoId,
        ]
      );


    const resultadoMovimentacao =
      await client.query(
        `
          INSERT INTO movimentacoes_estoque (
            produto_id,
            tipo,
            quantidade,
            quantidade_anterior,
            quantidade_posterior,
            motivo,
            usuario_id
          )

          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7
          )

          RETURNING *
        `,
        [
          produtoId,
          tipoNormalizado,
          quantidadeNumerica,
          quantidadeAnterior,
          quantidadePosterior,
          motivo?.trim() || null,
          req.usuario.id,
        ]
      );


    await client.query("COMMIT");


    /*
     * A movimentação já possui seu próprio histórico.
     * Também registramos no log geral de auditoria.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "MOVIMENTAR_ESTOQUE",
        entidade: "produtos",
        registroId: Number(produtoId),

        valorAnterior: {
          quantidade_atual:
            quantidadeAnterior,
        },

        valorNovo: {
          quantidade_atual:
            quantidadePosterior,

          tipo:
            tipoNormalizado,

          quantidade:
            quantidadeNumerica,

          motivo:
            motivo?.trim() || null,
        },

        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Movimentação realizada, mas houve erro no log de auditoria:",
        erroLog
      );
    }


    return res.status(201).json({
      mensagem:
        "Movimentação registrada com sucesso.",

      produto:
        resultadoProdutoAtualizado.rows[0],

      movimentacao:
        resultadoMovimentacao.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (erroRollback) {
      console.error(
        "Erro ao executar rollback:",
        erroRollback
      );
    }

    console.error(
      "Erro ao movimentar estoque:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao movimentar estoque.",
    });
  } finally {
    client.release();
  }
}


/*
 * Exibe o histórico de movimentações do produto,
 * incluindo quem realizou cada operação.
 */
async function listarMovimentacoesProduto(
  req,
  res
) {
  try {
    const { produtoId } = req.params;


    const produtoExiste =
      await pool.query(
        `
          SELECT id
          FROM produtos
          WHERE id = $1
        `,
        [produtoId]
      );


    if (produtoExiste.rows.length === 0) {
      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    const resultado =
      await pool.query(
        `
          SELECT
            m.id,
            m.produto_id,
            m.tipo,
            m.quantidade,
            m.quantidade_anterior,
            m.quantidade_posterior,
            m.motivo,
            m.criado_em,

            u.id AS usuario_id,
            u.nome AS usuario_nome

          FROM movimentacoes_estoque m

          INNER JOIN usuarios u
            ON u.id = m.usuario_id

          WHERE m.produto_id = $1

          ORDER BY
            m.criado_em DESC,
            m.id DESC
        `,
        [produtoId]
      );


    return res.status(200).json(
      resultado.rows
    );
  } catch (error) {
    console.error(
      "Erro ao listar movimentações:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar histórico de estoque.",
    });
  }
}


module.exports = {
  movimentarEstoque,
  listarMovimentacoesProduto,
};