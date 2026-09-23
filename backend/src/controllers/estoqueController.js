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

const LIMITE_BUSCA = 100;
const LIMITE_MOTIVO = 1000;
const LIMITE_MAXIMO_POR_PAGINA = 100;


/*
 * Toda alteração de quantidade deve passar por este
 * controller. Assim mantemos um histórico completo
 * das entradas, saídas e ajustes realizados.
 */
async function movimentarEstoque(
  req,
  res
) {
  const produtoId =
    Number(req.params.produtoId);

  if (
    !Number.isInteger(produtoId) ||
    produtoId <= 0
  ) {
    return res.status(400).json({
      mensagem:
        "ID de produto inválido.",
    });
  }


  const {
    tipo,
    quantidade,
    motivo,
  } = req.body;


  const tipoNormalizado =
    typeof tipo === "string"
      ? tipo.trim().toUpperCase()
      : "";


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
    !Number.isInteger(
      quantidadeNumerica
    ) ||
    quantidadeNumerica <= 0
  ) {
    return res.status(400).json({
      mensagem:
        "A quantidade deve ser um número inteiro maior que zero.",
    });
  }


  let motivoNormalizado = null;

  if (
    motivo !== null &&
    motivo !== undefined &&
    motivo !== ""
  ) {
    if (typeof motivo !== "string") {
      return res.status(400).json({
        mensagem:
          "O motivo da movimentação é inválido.",
      });
    }

    motivoNormalizado =
      motivo.trim() || null;

    if (
      motivoNormalizado &&
      motivoNormalizado.length >
        LIMITE_MOTIVO
    ) {
      return res.status(400).json({
        mensagem:
          `O motivo deve possuir no máximo ${LIMITE_MOTIVO} caracteres.`,
      });
    }
  }


  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");


    /*
     * O bloqueio garante que duas movimentações simultâneas
     * não utilizem a mesma quantidade inicial.
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


    if (
      resultadoProduto.rows.length ===
      0
    ) {
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
      Number(
        produto.quantidade_atual
      );


    if (
      !Number.isInteger(
        quantidadeAnterior
      ) ||
      quantidadeAnterior < 0
    ) {
      await client.query("ROLLBACK");

      console.error(
        "Quantidade de estoque inválida no produto:",
        produtoId
      );

      return res.status(500).json({
        mensagem:
          "Não foi possível processar o estoque do produto.",
      });
    }


    const adicionaEstoque =
      tipoNormalizado === "ENTRADA" ||
      tipoNormalizado ===
        "AJUSTE_ENTRADA";


    const quantidadePosterior =
      adicionaEstoque
        ? quantidadeAnterior +
          quantidadeNumerica
        : quantidadeAnterior -
          quantidadeNumerica;


    /*
     * Regra permanente do estoque:
     * nenhuma operação pode deixar a quantidade negativa.
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
            atualizado_em =
              CURRENT_TIMESTAMP

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
          motivoNormalizado,
          req.usuario.id,
        ]
      );


    await client.query("COMMIT");


    /*
     * O histórico específico de estoque e o log geral
     * possuem finalidades diferentes.
     *
     * A movimentação permanece registrada mesmo se houver
     * falha posterior ao registrar a auditoria geral.
     */
    try {
      await registrarLog({
        usuarioId:
          req.usuario.id,

        acao:
          "MOVIMENTAR_ESTOQUE",

        entidade:
          "produtos",

        registroId:
          produtoId,

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
            motivoNormalizado,
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
        resultadoProdutoAtualizado
          .rows[0],

      movimentacao:
        resultadoMovimentacao
          .rows[0],
    });
  } catch (error) {
    try {
      await client.query(
        "ROLLBACK"
      );
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
 * Retorna o histórico geral das movimentações de estoque.
 *
 * Diferentemente da versão anterior, esta consulta não
 * pertence a um único produto.
 *
 * A autorização de Administrador/Gerente é aplicada
 * diretamente no estoqueRoutes.js.
 */
async function listarHistoricoEstoque(
  req,
  res
) {
  try {
    const {
      busca,
      tipo,
      pagina = "1",
      limite = "20",
    } = req.query;


    /*
     * Busca opcional pelo nome do produto.
     */
    let buscaNormalizada = "";

    if (
      busca !== undefined &&
      busca !== ""
    ) {
      if (typeof busca !== "string") {
        return res.status(400).json({
          mensagem:
            "A busca informada é inválida.",
        });
      }

      buscaNormalizada =
        busca.trim();

      if (
        buscaNormalizada.length >
        LIMITE_BUSCA
      ) {
        return res.status(400).json({
          mensagem:
            `A busca deve possuir no máximo ${LIMITE_BUSCA} caracteres.`,
        });
      }
    }


    /*
     * O filtro de tipo utiliza a mesma lista aceita para
     * criação das movimentações.
     */
    let tipoNormalizado = "";

    if (
      tipo !== undefined &&
      tipo !== ""
    ) {
      if (typeof tipo !== "string") {
        return res.status(400).json({
          mensagem:
            "O tipo informado é inválido.",
        });
      }

      tipoNormalizado =
        tipo.trim().toUpperCase();

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
    }


    const paginaNumero =
      Number(pagina);

    const limiteNumero =
      Number(limite);


    if (
      !Number.isInteger(paginaNumero) ||
      paginaNumero <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "A página informada é inválida.",
      });
    }


    if (
      !Number.isInteger(limiteNumero) ||
      limiteNumero <= 0 ||
      limiteNumero >
        LIMITE_MAXIMO_POR_PAGINA
    ) {
      return res.status(400).json({
        mensagem:
          `O limite deve ser um número inteiro entre 1 e ${LIMITE_MAXIMO_POR_PAGINA}.`,
      });
    }


    const filtros = [];
    const valores = [];


    if (buscaNormalizada) {
      valores.push(
        `%${buscaNormalizada}%`
      );

      filtros.push(
        `p.nome ILIKE $${valores.length}`
      );
    }


    if (tipoNormalizado) {
      valores.push(
        tipoNormalizado
      );

      filtros.push(
        `m.tipo = $${valores.length}`
      );
    }


    const where =
      filtros.length > 0
        ? `WHERE ${filtros.join(
            " AND "
          )}`
        : "";


    const resultadoTotal =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total

          FROM movimentacoes_estoque m

          INNER JOIN produtos p
            ON p.id = m.produto_id

          ${where}
        `,
        valores
      );


    const offset =
      (paginaNumero - 1) *
      limiteNumero;


    const valoresConsulta = [
      ...valores,
      limiteNumero,
      offset,
    ];


    const parametroLimite =
      valores.length + 1;

    const parametroOffset =
      valores.length + 2;


    /*
     * LEFT JOIN preserva a movimentação caso futuramente
     * o usuário responsável deixe de estar disponível.
     *
     * O produto continua relacionado porque seu cadastro
     * atualmente trabalha com inativação em vez de exclusão.
     */
    const resultado =
      await pool.query(
        `
          SELECT
            m.id,

            m.produto_id,
            p.nome AS produto_nome,
            p.unidade AS produto_unidade,

            m.tipo,
            m.quantidade,
            m.quantidade_anterior,
            m.quantidade_posterior,
            m.motivo,

            m.usuario_id,
            u.nome AS usuario_nome,

            m.criado_em

          FROM movimentacoes_estoque m

          INNER JOIN produtos p
            ON p.id = m.produto_id

          LEFT JOIN usuarios u
            ON u.id = m.usuario_id

          ${where}

          ORDER BY
            m.criado_em DESC,
            m.id DESC

          LIMIT $${parametroLimite}
          OFFSET $${parametroOffset}
        `,
        valoresConsulta
      );


    const total =
      resultadoTotal.rows[0].total;


    const totalPaginas =
      Math.max(
        Math.ceil(
          total / limiteNumero
        ),
        1
      );


    return res.status(200).json({
      movimentacoes:
        resultado.rows,

      paginacao: {
        pagina:
          paginaNumero,

        limite:
          limiteNumero,

        total,

        total_paginas:
          totalPaginas,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao listar histórico geral de estoque:",
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
  listarHistoricoEstoque,
};