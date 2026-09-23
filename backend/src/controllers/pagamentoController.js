const pool = require("../database/connection");

const LIMITE_BUSCA = 100;
const LIMITE_MAXIMO_POR_PAGINA = 100;


/*
 * Lista os pagamentos de atendimentos que ainda estão
 * pendentes.
 *
 * Este controller pertence à área financeira/administrativa.
 * A rota deve permitir acesso somente para Administrador
 * e Gerente.
 *
 * A consulta parte da tabela de pagamentos para que a lista
 * utilize exatamente a mesma regra do indicador exibido
 * no Dashboard: pagamento com status PENDENTE.
 */
async function listarPagamentosPendentes(req, res) {
  try {
    const busca =
      typeof req.query.busca === "string"
        ? req.query.busca.trim()
        : "";

    const pagina =
      req.query.pagina === undefined
        ? 1
        : Number(req.query.pagina);

    const limite =
      req.query.limite === undefined
        ? 20
        : Number(req.query.limite);


    if (busca.length > LIMITE_BUSCA) {
      return res.status(400).json({
        mensagem:
          `A busca deve possuir no máximo ${LIMITE_BUSCA} caracteres.`,
      });
    }


    if (
      !Number.isInteger(pagina) ||
      pagina <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "A página informada é inválida.",
      });
    }


    if (
      !Number.isInteger(limite) ||
      limite <= 0 ||
      limite > LIMITE_MAXIMO_POR_PAGINA
    ) {
      return res.status(400).json({
        mensagem:
          `O limite deve ser um número inteiro entre 1 e ${LIMITE_MAXIMO_POR_PAGINA}.`,
      });
    }


    const parametros = [];
    const condicoes = [
      "pg.status = 'PENDENTE'",
    ];


    /*
     * A pesquisa pode localizar pelo nome do Pet ou Tutor.
     * Os valores continuam sendo enviados por parâmetros,
     * evitando concatenar dados do usuário diretamente no SQL.
     */
    if (busca) {
      parametros.push(`%${busca}%`);

      condicoes.push(`
        (
          p.nome ILIKE $${parametros.length}
          OR
          t.nome ILIKE $${parametros.length}
        )
      `);
    }


    const where =
      `WHERE ${condicoes.join(" AND ")}`;


    /*
     * O total é calculado com os mesmos filtros utilizados
     * na consulta principal para manter a paginação correta.
     */
    const resultadoTotal =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          ${where}
        `,
        parametros
      );


    const total =
      resultadoTotal.rows[0].total;

    const totalPaginas =
      total === 0
        ? 0
        : Math.ceil(total / limite);

    const offset =
      (pagina - 1) * limite;


    const parametrosConsulta = [
      ...parametros,
      limite,
      offset,
    ];

    const indiceLimite =
      parametros.length + 1;

    const indiceOffset =
      parametros.length + 2;


    const resultado =
      await pool.query(
        `
          SELECT
            pg.id AS pagamento_id,
            pg.banho_tosa_id AS atendimento_id,
            pg.valor_total,
            pg.status AS pagamento_status,
            pg.metodo AS pagamento_metodo,
            pg.criado_em AS pagamento_criado_em,

            bt.status AS atendimento_status,
            bt.agendado_para,

            p.id AS pet_id,
            p.nome AS pet_nome,

            t.id AS tutor_id,
            t.nome AS tutor_nome,

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', s.id,
                    'nome', s.nome
                  )
                  ORDER BY s.nome
                )

                FROM banho_tosa_servicos bts

                INNER JOIN servicos s
                  ON s.id = bts.servico_id

                WHERE
                  bts.banho_tosa_id = bt.id
              ),
              '[]'::json
            ) AS servicos

          FROM pagamentos_banho_tosa pg

          INNER JOIN banho_tosa bt
            ON bt.id = pg.banho_tosa_id

          INNER JOIN pets p
            ON p.id = bt.pet_id

          INNER JOIN tutores t
            ON t.id = p.tutor_id

          ${where}

          ORDER BY
            bt.agendado_para ASC,
            pg.id ASC

          LIMIT $${indiceLimite}
          OFFSET $${indiceOffset}
        `,
        parametrosConsulta
      );


    return res.status(200).json({
      pagamentos: resultado.rows,

      paginacao: {
        pagina,
        limite,
        total,
        total_paginas: totalPaginas,
      },
    });

  } catch (error) {
    console.error(
      "Erro ao listar pagamentos pendentes:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar os pagamentos pendentes.",
    });
  }
}


module.exports = {
  listarPagamentosPendentes,
};