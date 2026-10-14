const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

function token() {
  return jwt.sign({ id: 7, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

beforeEach(() => pool.query.mockReset());

test("dashboard conta atendimento confirmado separadamente e exclui pendente/recusado dos previstos", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, perfil: "administrador", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("FROM banho_tosa") && sql.includes("agendado_para::DATE")) {
      expect(sql).toContain("status IN ('AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO')");
    }
    if (sql.includes("FROM banho_tosa") && sql.includes("status = 'AGUARDANDO_CONFIRMACAO'")) {
      return { rows: [{ total: 2 }] };
    }
    return { rows: [{ total: 0 }] };
  });
  const response = await request(app).get("/api/dashboard/resumo").auth(token(), { type: "bearer" });
  expect(response.status).toBe(200);
  expect(response.body.solicitacoes_pendentes).toBe(2);
});

test.each(["AGUARDANDO_CONFIRMACAO", "RECUSADO"])("PIX rejeita atendimento %s mesmo com cobrança PENDENTE inconsistente", async (status) => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, perfil: "gerente", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("FROM pagamentos_banho_tosa")) return { rows: [{ id: 3, valor_total: "50.00", status: "PENDENTE", atendimento_status: status }] };
    throw new Error("Consulta inesperada");
  });
  const response = await request(app).get("/api/atendimentos/55/pix").auth(token(), { type: "bearer" });
  expect(response.status).toBe(409);
  expect(response.body.mensagem).toMatch(/não podem gerar cobrança PIX/i);
  expect(pool.query).toHaveBeenCalledTimes(2);
});
