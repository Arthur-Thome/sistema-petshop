const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

process.env.JWT_SECRET = "chave-ficticia-exclusiva-da-suite-http-d1";

const data = "2099-03-10";
const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();

function token() {
  return jwt.sign({ id: 17, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function criarClient({ horariosProtegidos = [], horariosDoDia = [] } = {}) {
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      const consulta = String(sql).replace(/\s+/g, " ").trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(consulta)) return { rows: [] };
      if (consulta.includes("FROM agenda_publica_dias") && consulta.includes("WHERE data = $1")) {
        return { rows: [{ id: 5, data, aberto: true, publicado: true, observacao: null }] };
      }
      if (consulta.includes("SELECT DISTINCT h.horario")) return { rows: horariosProtegidos.map((horario) => ({ horario })) };
      if (consulta.includes("SELECT id, horario, status") && consulta.includes("FROM agenda_publica_horarios")) {
        return { rows: horariosDoDia };
      }
      if (consulta.includes("INSERT INTO agenda_publica_operacoes")) return { rows: [{ id: 79 }] };
      if (consulta.includes("SELECT id, data, aberto, publicado")) {
        return { rows: [{ id: 5, data, aberto: true, publicado: true, horarios: [] }] };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  pool.connect.mockResolvedValue(client);
  return client;
}

function configurarAuth() {
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes("FROM usuarios")) {
      return { rows: [{ id: 17, nome: "Gerente", email: "gerente@example.invalid", perfil: "gerente", ativo: true, versao_sessao: 1 }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  configurarAuth();
});

function bodySubstituicao(horarios) {
  return {
    data_inicio: data,
    data_fim: data,
    dias_semana: [diaSemana],
    horarios,
    publicado: true,
    tratamento_existentes: "SUBSTITUIR",
    confirmacao_substituicao: true,
  };
}

test("substituicao recusa remover horario RESERVADO e faz rollback antes de qualquer mutacao", async () => {
  const client = criarClient({ horariosProtegidos: ["10:00"] });
  const response = await request(app).post("/api/agenda-publica/admin/operacoes/massa")
    .auth(token(), { type: "bearer" }).send(bodySubstituicao(["09:00", "14:00"]));

  expect(response.status).toBe(409);
  expect(response.body.codigo).toBe("HORARIO_OCUPADO_IMPEDE_SUBSTITUICAO");
  expect(client.query.mock.calls.some(([sql]) => /ROLLBACK/i.test(String(sql)))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => /UPDATE agenda_publica_dias|DELETE FROM agenda_publica_horarios|INSERT INTO agenda_publica_horarios/i.test(String(sql)))).toBe(false);
});

test("substituicao de horario livre pode prosseguir e limita exclusao a slots sem reserva e sem atendimento", async () => {
  const client = criarClient();
  const response = await request(app).post("/api/agenda-publica/admin/operacoes/massa")
    .auth(token(), { type: "bearer" }).send(bodySubstituicao(["09:00", "14:00"]));

  expect(response.status).toBe(200);
  expect(client.query.mock.calls.some(([sql]) => /DELETE FROM agenda_publica_horarios/i.test(String(sql)) && /status NOT IN \('OCUPADO', 'RESERVADO'\)/i.test(String(sql)) && /NOT EXISTS \(SELECT 1 FROM banho_tosa/i.test(String(sql)))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => /UPDATE agenda_publica_horarios/i.test(String(sql)) && /status NOT IN \('OCUPADO', 'RESERVADO'\)/i.test(String(sql)))).toBe(true);
});

test("fechamento em massa fecha a data sem apagar nem alterar horarios existentes", async () => {
  const client = criarClient({ horariosDoDia: [
    { id: 41, horario: "10:00", status: "OCUPADO" },
    { id: 42, horario: "14:00", status: "DISPONIVEL" },
  ] });
  const response = await request(app).post("/api/agenda-publica/admin/operacoes/fechamento")
    .auth(token(), { type: "bearer" })
    .send({ data_inicio: data, data_fim: data, dias_semana: [diaSemana], confirmacao_fechamento: true });

  expect(response.status).toBe(200);
  expect(response.body.resumo.horarios_preservados).toBe(2);
  expect(response.body.resumo.horarios_ocupados_preservados).toBe(1);
  expect(client.query.mock.calls.some(([sql]) => /DELETE FROM agenda_publica_horarios|UPDATE agenda_publica_horarios/i.test(String(sql)))).toBe(false);
  expect(client.query.mock.calls.some(([sql]) => /UPDATE agenda_publica_dias/i.test(String(sql)))).toBe(true);
});
