const pool = require("../database/connection");


/*
 * Lista os registros da trilha de auditoria.
 *
 * Esta consulta é utilizada exclusivamente pela área
 * administrativa do sistema.
 *
 * Filtros disponíveis:
 * - usuário;
 * - ação;
 * - entidade;
 * - data inicial;
 * - data final.
 *
 * A paginação evita carregar todo o histórico de uma vez,
 * pois a tabela de logs tende a crescer continuamente.
 */
async function listarLogs(req, res) {
  try {

    const {
      usuario_id,
      acao,
      entidade,
      data_inicio,
      data_fim,
      pagina = 1,
      limite = 20,
    } = req.query;


    /*
     * Impede valores inválidos ou quantidades excessivas
     * de registros por requisição.
     */
    const paginaNumero =
      Math.max(
        parseInt(pagina, 10) || 1,
        1
      );


    const limiteNumero =
      Math.min(
        Math.max(
          parseInt(limite, 10) || 20,
          1
        ),
        100
      );


    const offset =
      (paginaNumero - 1) *
      limiteNumero;


    const filtros = [];

    const valores = [];


    /*
     * Adiciona cada filtro dinamicamente utilizando
     * parâmetros do PostgreSQL.
     *
     * Dessa forma não concatenamos diretamente valores
     * enviados pelo usuário dentro da consulta SQL.
     */
    if (usuario_id) {

      valores.push(usuario_id);

      filtros.push(
        `l.usuario_id = $${valores.length}`
      );

    }


    if (acao) {

      valores.push(
        `%${acao}%`
      );

      filtros.push(
        `l.acao ILIKE $${valores.length}`
      );

    }


    if (entidade) {

      valores.push(
        `%${entidade}%`
      );

      filtros.push(
        `l.entidade ILIKE $${valores.length}`
      );

    }


    if (data_inicio) {

      valores.push(data_inicio);

      filtros.push(
        `l.criado_em >= $${valores.length}::DATE`
      );

    }


    /*
     * Somamos um dia e utilizamos "<" para que a data
     * final inclua todas as horas daquele dia.
     *
     * Exemplo:
     * data_fim = 20/09
     *
     * inclui registros até 20/09 23:59:59...
     */
    if (data_fim) {

      valores.push(data_fim);

      filtros.push(
        `l.criado_em < ($${valores.length}::DATE + INTERVAL '1 day')`
      );

    }


    const where =
      filtros.length > 0
        ? `WHERE ${filtros.join(" AND ")}`
        : "";


    /*
     * Primeiro contamos quantos registros existem com
     * os filtros informados.
     *
     * Isso permite ao frontend construir a paginação.
     */
    const resultadoTotal =
      await pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total

          FROM logs l

          ${where}
        `,
        valores
      );


    /*
     * Criamos uma nova lista porque LIMIT e OFFSET também
     * serão parâmetros da consulta principal.
     */
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
     * LEFT JOIN é utilizado porque usuario_id pode ficar
     * NULL caso um usuário seja removido futuramente.
     *
     * Mesmo nessa situação, o log deve continuar existindo.
     */
    const resultadoLogs =
      await pool.query(
        `
          SELECT
            l.id,
            l.usuario_id,

            u.nome AS usuario_nome,
            u.email AS usuario_email,

            l.acao,
            l.entidade,
            l.registro_id,
            l.valor_anterior,
            l.valor_novo,
            l.ip,
            l.criado_em

          FROM logs l

          LEFT JOIN usuarios u
            ON u.id = l.usuario_id

          ${where}

          ORDER BY
            l.criado_em DESC,
            l.id DESC

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

      logs:
        resultadoLogs.rows,

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
      "Erro ao listar logs de auditoria:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao consultar a auditoria.",
    });

  }
}


/*
 * Retorna um único registro da auditoria.
 *
 * Será utilizado quando o administrador clicar em
 * "Visualizar" para consultar os detalhes completos
 * do valor anterior e do valor novo.
 */
async function buscarLogPorId(req, res) {
  try {

    const { id } =
      req.params;


    if (
      !Number.isInteger(Number(id)) ||
      Number(id) <= 0
    ) {

      return res.status(400).json({
        mensagem:
          "Identificador do log inválido.",
      });

    }


    const resultado =
      await pool.query(
        `
          SELECT
            l.id,
            l.usuario_id,

            u.nome AS usuario_nome,
            u.email AS usuario_email,

            l.acao,
            l.entidade,
            l.registro_id,
            l.valor_anterior,
            l.valor_novo,
            l.ip,
            l.criado_em

          FROM logs l

          LEFT JOIN usuarios u
            ON u.id = l.usuario_id

          WHERE l.id = $1
        `,
        [id]
      );


    if (
      resultado.rows.length === 0
    ) {

      return res.status(404).json({
        mensagem:
          "Registro de auditoria não encontrado.",
      });

    }


    return res.status(200).json(
      resultado.rows[0]
    );

  } catch (error) {

    console.error(
      "Erro ao buscar log de auditoria:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao consultar o registro de auditoria.",
    });

  }
}


/*
 * Retorna informações utilizadas nos filtros da tela.
 *
 * A lista de usuários vem separada da consulta dos logs
 * para que o frontend possa montar o campo de seleção.
 */
async function buscarFiltros(req, res) {
  try {

    const [
      resultadoUsuarios,
      resultadoAcoes,
      resultadoEntidades,
    ] = await Promise.all([

      pool.query(`
        SELECT
          id,
          nome,
          email

        FROM usuarios

        ORDER BY nome ASC
      `),


      pool.query(`
        SELECT DISTINCT
          acao

        FROM logs

        WHERE acao IS NOT NULL

        ORDER BY acao ASC
      `),


      pool.query(`
        SELECT DISTINCT
          entidade

        FROM logs

        WHERE entidade IS NOT NULL

        ORDER BY entidade ASC
      `),

    ]);


    return res.status(200).json({

      usuarios:
        resultadoUsuarios.rows,

      acoes:
        resultadoAcoes.rows.map(
          (item) => item.acao
        ),

      entidades:
        resultadoEntidades.rows.map(
          (item) => item.entidade
        ),

    });

  } catch (error) {

    console.error(
      "Erro ao buscar filtros da auditoria:",
      error
    );


    return res.status(500).json({
      mensagem:
        "Erro interno ao carregar os filtros da auditoria.",
    });

  }
}


module.exports = {
  listarLogs,
  buscarLogPorId,
  buscarFiltros,
};