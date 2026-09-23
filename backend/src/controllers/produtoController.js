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
 * Normaliza campos textuais antes da validação
 * e da gravação no banco.
 */
function normalizarDadosProduto(dados) {
  const normalizarTexto = (valor) => {
    if (typeof valor !== "string") {
      return "";
    }

    return valor.trim();
  };

  return {
    nome:
      normalizarTexto(dados.nome),

    categoria:
      normalizarTexto(
        dados.categoria
      ),

    descricao:
      normalizarTexto(
        dados.descricao
      ),

    unidade:
      normalizarTexto(
        dados.unidade
      ),

    valor_unitario:
      dados.valor_unitario,

    quantidade_atual:
      dados.quantidade_atual,

    quantidade_minima:
      dados.quantidade_minima,

    observacoes:
      normalizarTexto(
        dados.observacoes
      ),
  };
}


/*
 * Valida os campos textuais do produto.
 *
 * Os limites evitam entradas excessivamente grandes
 * e também mantêm os dados consistentes.
 */
function validarTextosProduto(dados) {
  if (!dados.nome) {
    return "O nome do produto é obrigatório.";
  }

  if (!dados.unidade) {
    return "A unidade de medida é obrigatória.";
  }

  const limites = [
    ["nome", 150, "Nome"],
    ["categoria", 100, "Categoria"],
    ["descricao", 1000, "Descrição"],
    ["unidade", 50, "Unidade"],
    [
      "observacoes",
      2000,
      "Observações",
    ],
  ];

  for (const [
    campo,
    limite,
    nomeCampo,
  ] of limites) {
    if (
      dados[campo] &&
      dados[campo].length > limite
    ) {
      return (
        `${nomeCampo} deve possuir no máximo ` +
        `${limite} caracteres.`
      );
    }
  }

  return null;
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
    /*
     * Aplicamos os valores padrão antes da normalização.
     */
    const dadosRecebidos = {
      unidade: "un",
      quantidade_atual: 0,
      quantidade_minima: 0,
      ...req.body,
    };

    const dados =
      normalizarDadosProduto(
        dadosRecebidos
      );

    const erroTexto =
      validarTextosProduto(dados);

    if (erroTexto) {
      return res.status(400).json({
        mensagem: erroTexto,
      });
    }

    const valorUnitario =
      converterNumero(
        dados.valor_unitario
      );

    const quantidadeAtual =
      converterNumero(
        dados.quantidade_atual
      );

    const quantidadeMinima =
      converterNumero(
        dados.quantidade_minima
      );


    /*
     * O valor não precisa ser informado.
     * Entretanto, quando informado, deve ser um número
     * válido maior ou igual a zero.
     */
    if (
      valorUnitario !== null &&
      (
        !Number.isFinite(
          valorUnitario
        ) ||
        valorUnitario < 0
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um valor unitário válido.",
      });
    }


    /*
     * O estoque é controlado por embalagens/unidades
     * inteiras. Quantidades fracionadas não são aceitas.
     */
    if (
      !Number.isInteger(
        quantidadeAtual
      ) ||
      quantidadeAtual < 0
    ) {
      return res.status(400).json({
        mensagem:
          "A quantidade inicial deve ser um número inteiro maior ou igual a zero.",
      });
    }


    if (
      !Number.isInteger(
        quantidadeMinima
      ) ||
      quantidadeMinima < 0
    ) {
      return res.status(400).json({
        mensagem:
          "A quantidade mínima deve ser um número inteiro maior ou igual a zero.",
      });
    }


    const resultado =
      await pool.query(
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
          dados.nome,
          dados.categoria || null,
          dados.descricao || null,
          dados.unidade,
          valorUnitario,
          quantidadeAtual,
          quantidadeMinima,
          dados.observacoes || null,
        ]
      );


    const produto =
      resultado.rows[0];


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
    let busca = req.query.busca;

    if (typeof busca === "string") {
      busca = busca.trim();

      if (busca.length > 100) {
        return res.status(400).json({
          mensagem:
            "A busca deve possuir no máximo 100 caracteres.",
        });
      }
    } else {
      busca = "";
    }


    const resultado =
      await pool.query(
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
async function buscarProdutoPorId(
  req,
  res
) {
  try {
    const produtoId =
      Number(req.params.id);

    if (
      !Number.isInteger(produtoId) ||
      produtoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de produto inválido.",
      });
    }


    const resultado =
      await pool.query(
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
        [produtoId]
      );


    if (
      resultado.rows.length === 0
    ) {
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
    const produtoId =
      Number(req.params.id);

    if (
      !Number.isInteger(produtoId) ||
      produtoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de produto inválido.",
      });
    }


    const dados =
      normalizarDadosProduto(
        req.body
      );


    const erroTexto =
      validarTextosProduto(dados);

    if (erroTexto) {
      return res.status(400).json({
        mensagem: erroTexto,
      });
    }


    const minimoNumerico =
      converterNumero(
        dados.quantidade_minima
      );


    if (
      !Number.isInteger(
        minimoNumerico
      ) ||
      minimoNumerico < 0
    ) {
      return res.status(400).json({
        mensagem:
          "A quantidade mínima deve ser um número inteiro maior ou igual a zero.",
      });
    }


    const valorNumerico =
      converterNumero(
        dados.valor_unitario
      );


    if (
      valorNumerico !== null &&
      (
        !Number.isFinite(
          valorNumerico
        ) ||
        valorNumerico < 0
      )
    ) {
      return res.status(400).json({
        mensagem:
          "Informe um valor unitário válido.",
      });
    }


    /*
     * Recuperamos o estado anterior somente depois que
     * os dados básicos da requisição foram validados.
     */
    const resultadoAnterior =
      await pool.query(
        `
          SELECT *
          FROM produtos
          WHERE id = $1
        `,
        [produtoId]
      );


    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    const produtoAnterior =
      resultadoAnterior.rows[0];


    const resultado =
      await pool.query(
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
          dados.nome,
          dados.categoria || null,
          dados.descricao || null,
          dados.unidade,
          valorNumerico,
          minimoNumerico,
          dados.observacoes || null,
          produtoId,
        ]
      );


    const produtoAtualizado =
      resultado.rows[0];


    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao: "ALTERAR_PRODUTO",
        entidade: "produtos",
        registroId: produtoId,
        valorAnterior:
          produtoAnterior,
        valorNovo:
          produtoAtualizado,
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

      produto:
        produtoAtualizado,
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
async function alterarStatusProduto(
  req,
  res
) {
  try {
    const produtoId =
      Number(req.params.id);

    const { ativo } = req.body;


    if (
      !Number.isInteger(produtoId) ||
      produtoId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de produto inválido.",
      });
    }


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
        [produtoId]
      );


    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      return res.status(404).json({
        mensagem:
          "Produto não encontrado.",
      });
    }


    const produtoAnterior =
      resultadoAnterior.rows[0];


    /*
     * Evita registrar uma alteração que não modifica
     * efetivamente o estado do produto.
     */
    if (
      produtoAnterior.ativo === ativo
    ) {
      return res.status(400).json({
        mensagem: ativo
          ? "O produto já está ativo."
          : "O produto já está inativo.",
      });
    }


    const resultado =
      await pool.query(
        `
          UPDATE produtos

          SET
            ativo = $1,
            atualizado_em = CURRENT_TIMESTAMP

          WHERE id = $2

          RETURNING *
        `,
        [
          ativo,
          produtoId,
        ]
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
        registroId: produtoId,

        valorAnterior: {
          ativo:
            produtoAnterior.ativo,
        },

        valorNovo: {
          ativo:
            produtoAtualizado.ativo,
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

      produto:
        produtoAtualizado,
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