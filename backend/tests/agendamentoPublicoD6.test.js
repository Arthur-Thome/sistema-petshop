jest.mock("../src/middleware/clientePublicoMiddleware", () => (req, _res, next) => {
  req.clientePublico = { tutorId: 44, sessaoId: 9 };
  next();
});
jest.mock("../src/database/connection", () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require("supertest");
const app = require("../app");
const pool = require("../src/database/connection");

function criarCliente({ raca = "SRD", porte = "medio" } = {}) {
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      const q = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (["begin", "commit", "rollback"].includes(q)) return { rows: [], rowCount: 0 };
      if (q.startsWith("select agenda_dia_id from agenda_publica_horarios")) return { rows: [{ agenda_dia_id: 3 }] };
      if (q.startsWith("select id from agenda_publica_dias")) return { rows: [{ id: 3 }] };
      if (q.startsWith("select h.id, h.horario, h.status")) return { rows: [{ id: 6, horario: "14:00", status: "DISPONIVEL", data: "2099-03-10", aberto: true, publicado: true }] };
      if (q.startsWith("select ((")) return { rows: [{ futuro: true }] };
      if (q.startsWith("select p.id, p.nome, p.raca, p.porte")) return { rows: [{
        id: 5, nome: "Luna", raca, porte, ativo: true, tutor_id: 44,
        tutor_nome: "Tutor", tutor_ativo: true,
      }] };
      if (q.startsWith("select id, nome, descricao")) return { rows: [{ id: 7, nome: "Banho", valor: "75.00", duracao_minutos: 30, ativo: true }] };
      if (q.includes("as agendado_para")) return { rows: [{ agendado_para: "2099-03-10T14:00:00.000Z" }] };
      if (q.startsWith("insert into banho_tosa (")) return { rows: [{ id: 81, status: "AGUARDANDO_CONFIRMACAO", origem: "PUBLICO" }] };
      if (q.startsWith("insert into banho_tosa_servicos")) return { rows: [{ id: 1, banho_tosa_id: 81, valor_unitario: "75.00" }] };
      if (q.startsWith("update agenda_publica_horarios set status = 'reservado'")) return { rows: [{ id: 6 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
});

test("disponibilidade pública filtra horários passados usando America/Sao_Paulo", async () => {
  pool.query.mockResolvedValue({ rows: [] });
  const response = await request(app).get("/api/agenda-publica/disponibilidade")
    .query({ data_inicio: "2026-10-14", data_fim: "2026-10-31" });

  expect(response.status).toBe(200);
  const [sql] = pool.query.mock.calls[0];
  expect(sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
  expect(sql).toContain("> clock_timestamp()");
});

test.each([
  ["", "medio", "RACA_PET_PENDENTE"],
  ["Não sei informar", null, "PORTE_OBRIGATORIO"],
])("API recusa solicitação sem dados cadastrais obrigatórios do pet (%s)", async (raca, porte, codigo) => {
  const client = criarCliente({ raca, porte });
  const response = await request(app).post("/api/agendamento-publico/confirmar")
    .send({ pet_id: 5, horario_id: 6, servicos: [7] });

  expect(response.status).toBe(409);
  expect(response.body.codigo).toBe(codigo);
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  expect(client.query.mock.calls.some(([sql]) => /INSERT INTO banho_tosa \(/i.test(String(sql)))).toBe(false);
});

test("raça conhecida sem porte continua apta para solicitar horário", async () => {
  const client = criarCliente({ raca: "Shih Tzu", porte: null });
  const response = await request(app).post("/api/agendamento-publico/confirmar")
    .send({ pet_id: 5, horario_id: 6, servicos: [7] });

  expect(response.status).toBe(201);
  expect(response.body.atendimento.status).toBe("AGUARDANDO_CONFIRMACAO");
  expect(client.query.mock.calls.some(([sql]) => /INSERT INTO pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);
});
