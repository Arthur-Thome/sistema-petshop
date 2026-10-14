const pool = require("../database/connection");

const DATA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS_PERIODO = 365;
const STATUS_ATENDIMENTOS = new Set([
  "AGENDADO",
  "EM_ATENDIMENTO",
  "FINALIZADO",
  "CANCELADO",
  "AGUARDANDO_CONFIRMACAO",
  "RECUSADO",
]);

function dataUtc(valor) {
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(0);
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCFullYear(ano, mes - 1, dia);
  return data;
}

function dataCalendarioValida(valor) {
  if (typeof valor !== "string" || !DATA_PATTERN.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasNoMes[mes - 1];
}

function lerPeriodo(req, res) {
  const { inicio, fim } = req.query;
  if (!dataCalendarioValida(inicio) || !dataCalendarioValida(fim)) {
    res.status(400).json({
      mensagem: "Informe inicio e fim como datas válidas no formato YYYY-MM-DD.",
    });
    return null;
  }
  if (fim < inicio) {
    res.status(400).json({ mensagem: "A data final deve ser igual ou posterior à inicial." });
    return null;
  }
  const diasInclusivos = (dataUtc(fim) - dataUtc(inicio)) / 86400000 + 1;
  if (diasInclusivos > MAX_DIAS_PERIODO) {
    res.status(400).json({
      mensagem: `O período máximo permitido é de ${MAX_DIAS_PERIODO} dias, contando as datas inicial e final.`,
    });
    return null;
  }
  return { inicio, fim };
}

function lerFiltrosAtendimentos(req, res, periodo) {
  const { status, servico_id: servicoIdTexto } = req.query;
  if (status !== undefined && (typeof status !== "string" || !STATUS_ATENDIMENTOS.has(status))) {
    res.status(400).json({ mensagem: "O status informado não é válido para atendimentos." });
    return null;
  }

  let servicoId = null;
  if (servicoIdTexto !== undefined) {
    if (typeof servicoIdTexto !== "string" || !/^[1-9]\d*$/.test(servicoIdTexto)) {
      res.status(400).json({ mensagem: "Informe um serviço válido." });
      return null;
    }
    servicoId = Number(servicoIdTexto);
    if (!Number.isSafeInteger(servicoId)) {
      res.status(400).json({ mensagem: "Informe um serviço válido." });
      return null;
    }
  }

  const params = [periodo.inicio, periodo.fim];
  const condicoes = [
    "bt.agendado_para >= $1::date::timestamp",
    "bt.agendado_para < ($2::date + 1)::timestamp",
  ];
  if (status !== undefined) {
    params.push(status);
    condicoes.push(`bt.status = $${params.length}`);
  }
  let servicoIdPlaceholder = null;
  if (servicoId !== null) {
    params.push(servicoId);
    servicoIdPlaceholder = `$${params.length}`;
    condicoes.push(`EXISTS (
      SELECT 1 FROM banho_tosa_servicos filtro_bts
      WHERE filtro_bts.banho_tosa_id = bt.id
        AND filtro_bts.servico_id = ${servicoIdPlaceholder}
    )`);
  }

  return {
    params,
    where: condicoes.join(" AND "),
    servicoIdPlaceholder,
    filtros: { status: status || null, servico_id: servicoId },
  };
}

function respostaPeriodo(periodo, resumo, dados, extra = {}) {
  return {
    periodo: { ...periodo, fuso: "America/Sao_Paulo", inclusivo: true },
    resumo,
    dados,
    ...extra,
  };
}

function tratarErro(res, contexto, erro) {
  console.error(`${contexto}:`, erro);
  return res.status(500).json({ mensagem: "Não foi possível gerar o relatório." });
}

async function relatorioAtendimentos(req, res) {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;
  const filtros = lerFiltrosAtendimentos(req, res, periodo);
  if (!filtros) return;

  try {
    const [resumoResult, dadosResult, servicosResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE bt.status IN ('AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO'))::INTEGER AS confirmados,
          COUNT(*) FILTER (WHERE bt.status = 'AGUARDANDO_CONFIRMACAO')::INTEGER AS aguardando_confirmacao,
          COUNT(*) FILTER (WHERE bt.status = 'RECUSADO')::INTEGER AS recusados,
          COUNT(*) FILTER (WHERE bt.status = 'CANCELADO')::INTEGER AS cancelados,
          COUNT(*) FILTER (WHERE bt.status = 'FINALIZADO')::INTEGER AS finalizados
        FROM banho_tosa bt
        WHERE ${filtros.where}
      `, filtros.params),
      pool.query(`
        SELECT
          bt.id, bt.status, bt.origem, bt.agendado_para,
          bt.criado_em, bt.finalizado_em,
          p.id AS pet_id, p.nome AS pet_nome, p.especie AS pet_especie,
          tutor.nome AS tutor_nome,
          COALESCE(servicos.itens, '[]'::json) AS servicos,
          COALESCE(servicos.valor_snapshot, 0)::numeric AS valor_servicos_snapshot
        FROM banho_tosa bt
        JOIN pets p ON p.id = bt.pet_id
        LEFT JOIN LATERAL (
          SELECT t.nome
          FROM pet_tutores pt
          JOIN tutores t ON t.id = pt.tutor_id
          WHERE pt.pet_id = p.id
          ORDER BY pt.principal DESC, pt.criado_em ASC, pt.tutor_id ASC
          LIMIT 1
        ) tutor ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            json_agg(json_build_object(
              'servico_id', s.id,
              'nome', s.nome,
              'valor_unitario', bts.valor_unitario,
              'duracao_minutos', bts.duracao_minutos
            ) ORDER BY s.nome) AS itens,
            SUM(bts.valor_unitario) AS valor_snapshot
          FROM banho_tosa_servicos bts
          JOIN servicos s ON s.id = bts.servico_id
          WHERE bts.banho_tosa_id = bt.id
            ${filtros.servicoIdPlaceholder ? `AND bts.servico_id = ${filtros.servicoIdPlaceholder}` : ""}
        ) servicos ON TRUE
        WHERE ${filtros.where}
        ORDER BY bt.agendado_para, bt.id
      `, filtros.params),
      pool.query(`
        SELECT
          s.id AS servico_id,
          s.nome AS servico_nome,
          COUNT(DISTINCT bt.id) FILTER (
            WHERE bt.status IN ('AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO')
          )::INTEGER AS atendimentos_confirmados,
          COUNT(DISTINCT bt.id) FILTER (
            WHERE bt.status = 'AGUARDANDO_CONFIRMACAO'
          )::INTEGER AS solicitacoes_pendentes,
          COALESCE(SUM(bts.valor_unitario) FILTER (
            WHERE bt.status IN ('AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO')
          ), 0)::numeric AS valor_snapshot_confirmado
        FROM banho_tosa bt
        JOIN banho_tosa_servicos bts ON bts.banho_tosa_id = bt.id
        JOIN servicos s ON s.id = bts.servico_id
        WHERE ${filtros.where}
          ${filtros.servicoIdPlaceholder ? `AND bts.servico_id = ${filtros.servicoIdPlaceholder}` : ""}
        GROUP BY s.id, s.nome
        ORDER BY s.nome, s.id
      `, filtros.params),
    ]);

    return res.json(respostaPeriodo(periodo, resumoResult.rows[0], dadosResult.rows, {
      servicos: servicosResult.rows,
      filtros: filtros.filtros,
      nota_valores: "Valores de serviço são snapshots de agendamentos, não receita recebida.",
    }));
  } catch (erro) {
    return tratarErro(res, "Erro ao gerar relatório de atendimentos", erro);
  }
}

async function relatorioCreche(req, res) {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  try {
    const [resumoResult, dadosResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE entrada_em >= $1::date::timestamp AND entrada_em < ($2::date + 1)::timestamp
          )::INTEGER AS entradas,
          (SELECT COUNT(*)::INTEGER FROM creche
            WHERE saida_em >= $1::date::timestamp AND saida_em < ($2::date + 1)::timestamp) AS saidas,
          (SELECT COUNT(*)::INTEGER FROM creche WHERE status = 'NA_CRECHE') AS ainda_na_creche,
          COUNT(*) FILTER (
            WHERE status = 'FINALIZADO' AND saida_em >= $1::date::timestamp AND saida_em < ($2::date + 1)::timestamp
          )::INTEGER AS finalizadas
        FROM creche
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT c.id, c.status, c.entrada_em, c.saida_em,
          c.observacoes_entrada, c.observacoes_saida,
          p.id AS pet_id, p.nome AS pet_nome, p.especie AS pet_especie,
          tutor.nome AS tutor_nome
        FROM creche c
        JOIN pets p ON p.id = c.pet_id
        LEFT JOIN LATERAL (
          SELECT t.nome
          FROM pet_tutores pt
          JOIN tutores t ON t.id = pt.tutor_id
          WHERE pt.pet_id = p.id
          ORDER BY pt.principal DESC, pt.criado_em ASC, pt.tutor_id ASC
          LIMIT 1
        ) tutor ON TRUE
        WHERE (c.entrada_em >= $1::date::timestamp
               AND c.entrada_em < ($2::date + 1)::timestamp)
           OR (c.saida_em >= $1::date::timestamp
               AND c.saida_em < ($2::date + 1)::timestamp)
        ORDER BY c.entrada_em, c.id
      `, [periodo.inicio, periodo.fim]),
    ]);
    return res.json(respostaPeriodo(periodo, resumoResult.rows[0], dadosResult.rows));
  } catch (erro) {
    return tratarErro(res, "Erro ao gerar relatório de creche", erro);
  }
}

async function relatorioHotel(req, res) {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  try {
    const [resumoResult, dadosResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INTEGER AS reservas_no_periodo,
          COUNT(*) FILTER (WHERE status = 'AGENDADO')::INTEGER AS agendadas,
          COUNT(*) FILTER (WHERE status = 'HOSPEDADO')::INTEGER AS hospedados,
          COUNT(*) FILTER (WHERE status = 'FINALIZADO')::INTEGER AS finalizadas,
          COUNT(*) FILTER (WHERE status = 'CANCELADO')::INTEGER AS canceladas,
          COALESCE(SUM(GREATEST(0, saida_prevista::date - entrada_prevista::date)), 0)::INTEGER AS noites_previstas
        FROM hotel
        WHERE entrada_prevista < ($2::date + 1)::timestamp
          AND saida_prevista > $1::date::timestamp
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT h.id, h.status, h.entrada_prevista, h.saida_prevista,
          h.checkin_em, h.checkout_em, h.observacoes_reserva,
          h.observacoes_checkin, h.observacoes_checkout,
          p.id AS pet_id, p.nome AS pet_nome, p.especie AS pet_especie,
          tutor.nome AS tutor_nome
        FROM hotel h
        JOIN pets p ON p.id = h.pet_id
        LEFT JOIN LATERAL (
          SELECT t.nome
          FROM pet_tutores pt
          JOIN tutores t ON t.id = pt.tutor_id
          WHERE pt.pet_id = p.id
          ORDER BY pt.principal DESC, pt.criado_em ASC, pt.tutor_id ASC
          LIMIT 1
        ) tutor ON TRUE
        WHERE h.entrada_prevista < ($2::date + 1)::timestamp
          AND h.saida_prevista > $1::date::timestamp
        ORDER BY h.entrada_prevista, h.id
      `, [periodo.inicio, periodo.fim]),
    ]);
    return res.json(respostaPeriodo(periodo, resumoResult.rows[0], dadosResult.rows, {
      criterio: "Reservas cujo período previsto se sobrepõe ao período informado.",
    }));
  } catch (erro) {
    return tratarErro(res, "Erro ao gerar relatório de hotel", erro);
  }
}

async function relatorioEstoque(req, res) {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  try {
    const [resumoResult, tiposResult, dadosResult, estoqueBaixoResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INTEGER AS movimentacoes,
          COALESCE(SUM(quantidade) FILTER (WHERE tipo IN ('ENTRADA', 'AJUSTE_ENTRADA')), 0)::INTEGER AS unidades_entrada,
          COALESCE(SUM(quantidade) FILTER (WHERE tipo IN ('SAIDA', 'AJUSTE_SAIDA')), 0)::INTEGER AS unidades_saida
        FROM movimentacoes_estoque
        WHERE criado_em >= $1::date::timestamp
          AND criado_em < ($2::date + 1)::timestamp
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT tipo, COUNT(*)::INTEGER AS movimentacoes,
          COALESCE(SUM(quantidade), 0)::INTEGER AS unidades
        FROM movimentacoes_estoque
        WHERE criado_em >= $1::date::timestamp
          AND criado_em < ($2::date + 1)::timestamp
        GROUP BY tipo
        ORDER BY tipo
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT m.id, m.tipo, m.quantidade, m.quantidade_anterior,
          m.quantidade_posterior, m.motivo, m.criado_em,
          p.id AS produto_id, p.nome AS produto_nome, p.unidade,
          u.nome AS usuario_nome
        FROM movimentacoes_estoque m
        JOIN produtos p ON p.id = m.produto_id
        JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.criado_em >= $1::date::timestamp
          AND m.criado_em < ($2::date + 1)::timestamp
        ORDER BY m.criado_em, m.id
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT id AS produto_id, nome AS produto_nome, categoria, unidade,
          quantidade_atual, quantidade_minima
        FROM produtos
        WHERE ativo = TRUE AND quantidade_atual <= quantidade_minima
        ORDER BY quantidade_atual ASC, nome, id
      `),
    ]);
    return res.json(respostaPeriodo(periodo, resumoResult.rows[0], dadosResult.rows, {
      por_tipo: tiposResult.rows,
      estoque_baixo: estoqueBaixoResult.rows,
      nota_valores: "Estoque é tratado como movimentação de unidades, não venda de produtos.",
    }));
  } catch (erro) {
    return tratarErro(res, "Erro ao gerar relatório de estoque", erro);
  }
}

async function relatorioFinanceiro(req, res) {
  const periodo = lerPeriodo(req, res);
  if (!periodo) return;

  try {
    const [resumoResult, dadosResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'PENDENTE' AND criado_em >= $1::date::timestamp AND criado_em < ($2::date + 1)::timestamp)::INTEGER AS quantidade_pendente,
          COALESCE(SUM(valor_total) FILTER (
            WHERE status IN ('PAGO', 'ESTORNADO')
              AND pago_em >= $1::date::timestamp AND pago_em < ($2::date + 1)::timestamp
          ), 0)::numeric AS bruto_recebido,
          COUNT(*) FILTER (
            WHERE status IN ('PAGO', 'ESTORNADO')
              AND pago_em >= $1::date::timestamp AND pago_em < ($2::date + 1)::timestamp
          )::INTEGER AS pagamentos_recebidos,
          COUNT(*) FILTER (
            WHERE status = 'PAGO'
              AND pago_em >= $1::date::timestamp AND pago_em < ($2::date + 1)::timestamp
          )::INTEGER AS quantidade_pago,
          COALESCE(SUM(valor_total) FILTER (
            WHERE status = 'PAGO'
              AND pago_em >= $1::date::timestamp AND pago_em < ($2::date + 1)::timestamp
          ), 0)::numeric AS valor_pago_atual,
          COALESCE(SUM(valor_total) FILTER (
            WHERE status = 'ESTORNADO'
              AND estornado_em >= $1::date::timestamp AND estornado_em < ($2::date + 1)::timestamp
          ), 0)::numeric AS valor_estornado,
          COUNT(*) FILTER (
            WHERE status = 'ESTORNADO'
              AND estornado_em >= $1::date::timestamp AND estornado_em < ($2::date + 1)::timestamp
          )::INTEGER AS quantidade_estornada,
          COALESCE(SUM(valor_total) FILTER (
            WHERE status = 'PENDENTE' AND criado_em >= $1::date::timestamp AND criado_em < ($2::date + 1)::timestamp
          ), 0)::numeric AS valor_pendente,
          COUNT(*) FILTER (
            WHERE status = 'CANCELADO'
              AND atualizado_em >= $1::date::timestamp AND atualizado_em < ($2::date + 1)::timestamp
          )::INTEGER AS quantidade_cancelada,
          COALESCE(SUM(valor_total) FILTER (
            WHERE status = 'CANCELADO'
              AND atualizado_em >= $1::date::timestamp AND atualizado_em < ($2::date + 1)::timestamp
          ), 0)::numeric AS valor_cancelado,
          (
            COALESCE(SUM(valor_total) FILTER (
              WHERE status IN ('PAGO', 'ESTORNADO')
                AND pago_em >= $1::date::timestamp AND pago_em < ($2::date + 1)::timestamp
            ), 0)
            - COALESCE(SUM(valor_total) FILTER (
              WHERE status = 'ESTORNADO'
                AND estornado_em >= $1::date::timestamp AND estornado_em < ($2::date + 1)::timestamp
            ), 0)
          )::numeric AS liquido_no_periodo
        FROM pagamentos_banho_tosa
      `, [periodo.inicio, periodo.fim]),
      pool.query(`
        SELECT
          pg.id AS pagamento_id, pg.banho_tosa_id AS atendimento_id,
          pg.valor_total, pg.status, pg.metodo,
          pg.criado_em, pg.pago_em, pg.estornado_em, pg.atualizado_em,
          bt.status AS atendimento_status,
          p.nome AS pet_nome,
          tutor.nome AS tutor_nome
        FROM pagamentos_banho_tosa pg
        JOIN banho_tosa bt ON bt.id = pg.banho_tosa_id
        JOIN pets p ON p.id = bt.pet_id
        LEFT JOIN LATERAL (
          SELECT t.nome
          FROM pet_tutores pt
          JOIN tutores t ON t.id = pt.tutor_id
          WHERE pt.pet_id = p.id
          ORDER BY pt.principal DESC, pt.criado_em ASC, pt.tutor_id ASC
          LIMIT 1
        ) tutor ON TRUE
        WHERE
          (pg.status = 'PENDENTE' AND pg.criado_em >= $1::date::timestamp AND pg.criado_em < ($2::date + 1)::timestamp)
          OR (pg.status IN ('PAGO', 'ESTORNADO') AND pg.pago_em >= $1::date::timestamp AND pg.pago_em < ($2::date + 1)::timestamp)
          OR (pg.status = 'ESTORNADO' AND pg.estornado_em >= $1::date::timestamp AND pg.estornado_em < ($2::date + 1)::timestamp)
          OR (pg.status = 'CANCELADO' AND pg.atualizado_em >= $1::date::timestamp AND pg.atualizado_em < ($2::date + 1)::timestamp)
        ORDER BY COALESCE(pg.pago_em, pg.estornado_em, pg.atualizado_em, pg.criado_em), pg.id
      `, [periodo.inicio, periodo.fim]),
    ]);
    const resumo = resumoResult.rows[0];
    return res.json(respostaPeriodo(periodo, resumo, dadosResult.rows, {
      criterio: "Bruto pela data de recebimento; estorno pela data do estorno; líquido é bruto menos estornos ocorridos no período.",
      observacao_cancelamento: "O schema não tem cancelado_em no pagamento; cancelamentos são datados por atualizado_em.",
    }));
  } catch (erro) {
    return tratarErro(res, "Erro ao gerar relatório financeiro", erro);
  }
}

module.exports = {
  relatorioAtendimentos,
  relatorioCreche,
  relatorioHotel,
  relatorioEstoque,
  relatorioFinanceiro,
};
