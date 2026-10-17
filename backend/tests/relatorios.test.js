const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

function token(id) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

beforeEach(() => pool.query.mockReset());

test("relatório financeiro é negado a funcionário e não consulta valores", async () => {
  pool.query.mockResolvedValue({ rows: [{ id: 8, nome: "Operador", perfil: "funcionario", ativo: true, versao_sessao: 1 }] });
  const resposta = await request(app).get("/api/relatorios/financeiro?inicio=2026-01-01&fim=2026-01-31")
    .auth(token(8), { type: "bearer" });
  expect(resposta.status).toBe(403);
  expect(pool.query).toHaveBeenCalledTimes(1);
});

test("relatório operacional valida datas e agrega atendimento sem duplicar serviços", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Funcionário", perfil: "funcionario", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("COUNT(*) FILTER")) return { rows: [{ confirmados: 1, aguardando_confirmacao: 1, recusados: 0, cancelados: 0, finalizados: 1 }] };
    if (sql.includes("COUNT(DISTINCT bt.id)")) return { rows: [{ servico_id: 4, servico_nome: "Banho", atendimentos_confirmados: 1 }] };
    return { rows: [{ id: 17, status: "FINALIZADO", servicos: [{ nome: "Banho" }, { nome: "Tosa" }] }] };
  });
  const resposta = await request(app).get("/api/relatorios/atendimentos-servicos?inicio=2026-01-01&fim=2026-01-31")
    .auth(token(7), { type: "bearer" });
  expect(resposta.status).toBe(200);
  expect(resposta.body.resumo.confirmados).toBe(1);
  expect(resposta.body.resumo.aguardando_confirmacao).toBe(1);
  expect(resposta.body.periodo.fuso).toBe("America/Sao_Paulo");
  expect(resposta.body.servicos[0].atendimentos_confirmados).toBe(1);
  const consultaServicos = pool.query.mock.calls.find(([sql]) => sql.includes("COUNT(DISTINCT bt.id)"))[0];
  expect(consultaServicos).toContain("AGUARDANDO_CONFIRMACAO");
});

test("datas inválidas e período invertido são rejeitados sem consulta do relatório", async () => {
  pool.query.mockResolvedValue({ rows: [{ id: 7, nome: "Operador", perfil: "funcionario", ativo: true, versao_sessao: 1 }] });
  const invalida = await request(app).get("/api/relatorios/creche?inicio=2026-02-30&fim=2026-03-01")
    .auth(token(7), { type: "bearer" });
  expect(invalida.status).toBe(400);
  expect(pool.query).toHaveBeenCalledTimes(1);
});

test("relatório de estoque inclui lista de reposição separada das movimentações", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Operador", perfil: "funcionario", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("AS movimentacoes")) return { rows: [{ movimentacoes: 0, unidades_entrada: 0, unidades_saida: 0 }] };
    if (sql.includes("GROUP BY tipo")) return { rows: [] };
    if (sql.includes("FROM produtos")) return { rows: [
      { produto_id: 9, produto_nome: "Shampoo", quantidade_atual: 1, quantidade_minima: 2 },
      { produto_id: 10, produto_nome: "Luvas", quantidade_atual: 2, quantidade_minima: 2 },
    ] };
    if (sql.includes("FROM movimentacoes_estoque m")) return { rows: [] };
    throw new Error("Consulta inesperada no relatório de estoque");
  });

  const resposta = await request(app).get("/api/relatorios/estoque?inicio=2026-01-01&fim=2026-01-31")
    .auth(token(7), { type: "bearer" });

  expect(resposta.status).toBe(200);
  expect(resposta.body.dados).toEqual([]);
  expect(resposta.body.estoque_baixo).toEqual([
    expect.objectContaining({ produto_id: 9, quantidade_atual: 1, quantidade_minima: 2 }),
    expect.objectContaining({ produto_id: 10, quantidade_atual: 2, quantidade_minima: 2 }),
  ]);
  const consultaBaixo = pool.query.mock.calls.find(([sql]) => String(sql).includes("FROM produtos"));
  expect(consultaBaixo[0]).toMatch(/WHERE ativo = TRUE AND quantidade_atual <= quantidade_minima/);
});

test("relatório de creche separa entradas e saídas e mantém permanências abertas no indicador", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Operador", perfil: "funcionario", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("AS entradas")) return { rows: [{ entradas: 1, saidas: 1, ainda_na_creche: 2, finalizadas: 1 }] };
    if (sql.includes("FROM creche c")) return { rows: [{ id: 3, status: "FINALIZADO", entrada_em: "2025-12-31", saida_em: "2026-01-02" }] };
    throw new Error("Consulta inesperada no relatório de creche");
  });

  const resposta = await request(app).get("/api/relatorios/creche?inicio=2026-01-01&fim=2026-01-31")
    .auth(token(7), { type: "bearer" });

  expect(resposta.status).toBe(200);
  expect(resposta.body.resumo).toEqual({ entradas: 1, saidas: 1, ainda_na_creche: 2, finalizadas: 1 });
  expect(resposta.body.dados).toHaveLength(1);
  const resumoSql = pool.query.mock.calls.find(([sql]) => sql.includes("AS entradas"))[0];
  expect(resumoSql).toContain("saida_em >= $1::date::timestamp");
  expect(resumoSql).toContain("WHERE status = 'NA_CRECHE'");
});
