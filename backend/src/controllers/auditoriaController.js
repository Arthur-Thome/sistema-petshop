const pool = require("../database/connection");

const LIMITE_FILTRO_TEXTO = 100;
const LIMITE_MAXIMO_POR_PAGINA = 100;


/*
 * Verifica se uma string representa uma data no formato
 * YYYY-MM-DD e se a data realmente existe.
 *
 * Exemplo inválido:
 * 2026-02-31
 */
function validarData(valor) {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    return false;
  }

  const [ano, mes, dia] =
    valor.split("-").map(Number);

  const data =
    new Date(
      Date.UTC(ano, mes - 1, dia)
    );

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}


/*
 * Lista os registros da trilha de auditoria.
 *
 * Esta área é protegida nas rotas e pode ser acessada
 * exclusivamente por Administradores.
 */
async function listarLogs(req, res) {
  try {
    const {
      usuario_id,
      acao,
      entidade,
      data_inicio,
      data_fim,
      pagina = "1",
      limite = "20",
    } = req.query;


    /*
     * Validação do usuário utilizado como filtro.
     */
    let usuarioId = null;

    if (
      usuario_id !== undefined &&
      usuario_id !== ""
    ) {
      usuarioId = Number(usuario_id);

      if (
        !Number.isInteger(usuarioId) ||
        usuarioId <= 0
      ) {
        return res.status(400).json({
          mensagem:
            "O usuário informado para o filtro é inválido.",
        });
      }
    }


    /*
     * Ação e entidade são filtros livres, mas recebem
     * limite para impedir parâmetros excessivamente grandes.
     */
    let acaoNormalizada = "";

    if (
      acao !== undefined &&
      acao !== ""
    ) {
      if (typeof acao !== "string") {
        return res.status(400).json({
          mensagem:
            "O filtro de ação é inválido.",
        });
      }

      acaoNormalizada = acao.trim();

      if (
        acaoNormalizada.length >
        LIMITE_FILTRO_TEXTO
      ) {
        return res.status(400).json({
          mensagem:
            `O filtro de ação deve possuir no máximo ${LIMITE_FILTRO_TEXTO} caracteres.`,
        });
      }
    }


    let entidadeNormalizada = "";

    if (
      entidade !== undefined &&
      entidade !== ""
    ) {
      if (
        typeof entidade !== "string"
      ) {
        return res.status(400).json({
          mensagem:
            "O filtro de entidade é inválido.",
        });
      }

      entidadeNormalizada =
        entidade.trim();

      if (
        entidadeNormalizada.length >
        LIMITE_FILTRO_TEXTO
      ) {
        return res.status(400).json({
          mensagem:
            `O filtro de entidade deve possuir no máximo ${LIMITE_FILTRO_TEXTO} caracteres.`,
        });
      }
    }


    /*
     * Datas são aceitas somente no formato utilizado
     * pelo frontend: YYYY-MM-DD.
     */
    if (
      data_inicio !== undefined &&
      data_inicio !== "" &&
      !validarData(data_inicio)
    ) {
      return res.status(400).json({
        mensagem:
          "A data inicial é inválida.",
      });
    }

    if (
      data_fim !== undefined &&
      data_fim !== "" &&
      !validarData(data_fim)
    ) {
      return res.status(400).json({
        mensagem:
          "A data final é inválida.",
      });
    }

    if (
      data_inicio &&
      data_fim &&
      data_inicio > data_fim
    ) {
      return res.status(400).json({
        mensagem:
          "A data inicial não pode ser posterior à data final.",
      });
    }


    /*
     * Paginação aceita somente inteiros positivos.
     *
     * Diferentemente de parseInt("2abc"), que retornaria 2,
     * Number exige que todo o valor represente um número.
     */
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

    const offset =
      (paginaNumero - 1) *
      limiteNumero;


    /*
     * Construção parametrizada dos filtros.
     *
     * Nenhum valor enviado pelo usuário é concatenado
     * diretamente dentro do SQL.
     */
    const filtros = [];
    const valores = [];

    if (usuarioId) {
      valores.push(usuarioId);

      filtros.push(
        `l.usuario_id = $${valores.length}`
      );
    }

    if (acaoNormalizada) {
      valores.push(
        `%${acaoNormalizada}%`
      );

      filtros.push(
        `l.acao ILIKE $${valores.length}`
      );
    }

    if (entidadeNormalizada) {
      valores.push(
        `%${entidadeNormalizada}%`
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
     * Utilizamos "< data final + 1 dia" para incluir
     * todas as horas da data final selecionada.
     */
    if (data_fim) {
      valores.push(data_fim);

      filtros.push(
        `l.criado_em < ($${valores.length}::DATE + INTERVAL '1 day')`
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
          FROM logs l
          ${where}
        `,
        valores
      );


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
     * LEFT JOIN preserva o histórico mesmo se o usuário
     * associado ao log deixar de existir futuramente.
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
 * A autorização para acessar este endpoint continua sendo
 * realizada no auditoriaRoutes.js.
 */
async function buscarLogPorId(req, res) {
  try {
    const id =
      Number(req.params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
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
 * Retorna as opções utilizadas nos filtros da auditoria.
 *
 * Somente Administradores chegam a esta função porque
 * toda a rota /auditoria é protegida no backend.
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