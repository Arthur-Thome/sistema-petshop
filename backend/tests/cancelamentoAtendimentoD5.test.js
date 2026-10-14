let mockPerfil = "funcionario";

jest.mock("../src/middleware/authMiddleware", () => (req, _res, next) => {
  req.usuario = { id: 27, perfil: mockPerfil };
  next();
});
jest.mock("../src/services/logService", () => ({ registrarLog: jest.fn().mockResolvedValue(undefined) }));

const request = require("supertest");
const app = require("../app");
const pool = require("../src/database/connection");

function criarClient({
  status = "AGUARDANDO_CONFIRMACAO",
  pagamento = null,
  horarioStatus = "RESERVADO",
  diaAberto = true,
  futuro = true,
} = {}) {
  const atendimento = {
    id: 72,
    status,
    agenda_publica_horario_id: horarioStatus ? 9 : null,
    pet_id: 31,
  };
  const queries = [];
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const query = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      queries.push({ query, params });
      if (["begin", "commit", "rollback"].includes(query)) return { rows: [], rowCount: 0 };
      if (query.startsWith("select agenda_publica_horario_id from banho_tosa")) {
        return { rows: [{ agenda_publica_horario_id: horarioStatus ? 9 : null }] };
      }
      if (query.startsWith("select d.id from agenda_publica_dias")) return { rows: [{ id: 4 }] };
      if (query.startsWith("select h.id, h.status, h.horario")) {
        return { rows: [{ id: 9, status: horarioStatus, horario: "14:00", data: "2099-03-10", aberto: diaAberto, publicado: diaAberto }] };
      }
      if (query.startsWith("select * from banho_tosa where id = $1 for update")) return { rows: [{ ...atendimento }] };
      if (query.startsWith("select * from pagamentos_banho_tosa")) return { rows: pagamento ? [{ id: 93, banho_tosa_id: 72, ...pagamento }] : [] };
      if (query.startsWith("update banho_tosa")) return { rows: [{ ...atendimento, status: "CANCELADO", cancelado_em: "2099-03-10T14:00:00" }] };
      if (query.startsWith("update pagamentos_banho_tosa")) return { rows: [{ id: 93, status: "CANCELADO" }] };
      if (query.startsWith("select ((")) return { rows: [{ futuro }] };
      if (query.startsWith("update agenda_publica_horarios")) return { rows: [{ id: 9 }] };
      return { rows: [], rowCount: 1 };
    }),
  };
  pool.connect.mockResolvedValue(client);
  return { client, queries };
}

beforeEach(() => {
  mockPerfil = "funcionario";
  pool.connect.mockReset();
});

test.each(["funcionario", "gerente", "administrador"])("%s cancela solicitação sem cobrança, libera slot e grava autoria/motivo", async (papel) => {
  mockPerfil = papel;
  const { client, queries } = criarClient();
  const response = await request(app).patch("/api/atendimentos/72/cancelar")
    .send({ motivo_cancelamento: "  Tutor solicitou cancelamento  " });

  expect(response.status).toBe(200);
  expect(response.body.atendimento.status).toBe("CANCELADO");
  expect(response.body.horario_liberado).toBe(true);
  expect(queries.find(({ query }) => query.includes("update agenda_publica_horarios")).params[0]).toBe("DISPONIVEL");
  const historico = queries.find(({ query }) => query.includes("atendimento_cancelado"));
  expect(historico.params).toEqual([72, "AGUARDANDO_CONFIRMACAO", 27, "Tutor solicitou cancelamento"]);
  expect(client.query.mock.calls.some(([sql]) => /update pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);
});

test("pagamento pendente e atendimento são cancelados atomicamente", async () => {
  const { client, queries } = criarClient({ status: "AGENDADO", pagamento: { status: "PENDENTE" }, horarioStatus: "OCUPADO" });
  const response = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Desmarcado" });
  expect(response.status).toBe(200);
  expect(response.body.pagamento.status).toBe("CANCELADO");
  expect(client.query.mock.calls.map(([sql]) => String(sql).trim().toUpperCase())).toContain("COMMIT");
  expect(queries.find(({ query }) => query.startsWith("update pagamentos_banho_tosa")).params).toEqual([93]);
});

test("pagamento pago bloqueia sem mutações; estornado permanece intacto", async () => {
  const pago = criarClient({ status: "AGENDADO", pagamento: { status: "PAGO" }, horarioStatus: "OCUPADO" });
  const bloqueado = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Solicitado" });
  expect(bloqueado.status).toBe(409);
  expect(bloqueado.body.codigo).toBe("PAGAMENTO_EXIGE_ESTORNO");
  expect(pago.client.query.mock.calls.some(([sql]) => /update banho_tosa|update agenda_publica_horarios/i.test(String(sql)))).toBe(false);

  const estornado = criarClient({ status: "AGENDADO", pagamento: { status: "ESTORNADO", valor_total: "75.00", metodo: "PIX", pago_em: "2099-01-01" }, horarioStatus: "OCUPADO" });
  const permitido = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Estorno realizado" });
  expect(permitido.status).toBe(200);
  expect(estornado.client.query.mock.calls.some(([sql]) => /update pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);
});

test.each([[false, true], [true, false]])("não libera slot se dia fechado ou horário passado", async (diaAberto, futuro) => {
  const { queries } = criarClient({ diaAberto, futuro });
  const response = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Teste" });
  expect(response.status).toBe(200);
  expect(response.body.horario_liberado).toBe(false);
  expect(queries.find(({ query }) => query.startsWith("update agenda_publica_horarios")).params[0]).toBe("BLOQUEADO");
});

test("recusa motivo vazio, cancelamento duplicado e mockPerfil fora da equipe", async () => {
  criarClient({ status: "CANCELADO" });
  const semMotivo = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "   " });
  expect(semMotivo.status).toBe(400);
  expect(pool.connect).not.toHaveBeenCalled();

  const duplicado = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Repetido" });
  expect(duplicado.status).toBe(409);

  mockPerfil = "cliente";
  const proibido = await request(app).patch("/api/atendimentos/72/cancelar").send({ motivo_cancelamento: "Teste" });
  expect(proibido.status).toBe(403);
});
