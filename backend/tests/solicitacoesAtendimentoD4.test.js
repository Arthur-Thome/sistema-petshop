let mockPerfil = "funcionario";

jest.mock("../src/middleware/authMiddleware", () => (req, _res, next) => {
  req.usuario = { id: 17, perfil: mockPerfil };
  next();
});
jest.mock("../src/middleware/clientePublicoMiddleware", () => (req, _res, next) => {
  req.clientePublico = { tutorId: 44, sessaoId: 9 };
  next();
});

const request = require("supertest");
const app = require("../app");
const pool = require("../src/database/connection");

const horario = { id: 6, horario: "14:00", status: "RESERVADO", agenda_dia_id: 2, data: "2099-03-10", aberto: true, publicado: true };
const atendimento = { id: 81, pet_id: 5, status: "AGUARDANDO_CONFIRMACAO", agenda_publica_horario_id: 6, agendado_para: "2099-03-10T17:00:00.000Z" };

function makeClient({ future = true, dayOpen = true, slotStatus = "RESERVADO" } = {}) {
  const calls = [];
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const q = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      calls.push({ q, params });
      if (["begin", "commit", "rollback"].includes(q)) return { rows: [], rowCount: 0 };
      if (q.startsWith("select agenda_dia_id from agenda_publica_horarios")) return { rows: [{ agenda_dia_id: 2 }] };
      if (q.startsWith("select id from agenda_publica_dias")) return { rows: [{ id: 2 }] };
      if (q.startsWith("select d.id, d.data, d.aberto, d.publicado")) return { rows: [{ id: 2, data: horario.data, aberto: dayOpen, publicado: dayOpen }] };
      if (q.startsWith("select h.id, h.horario, h.status")) return { rows: [{ ...horario, status: slotStatus, aberto: dayOpen, publicado: dayOpen }] };
      if (q.startsWith("select agenda_publica_horario_id from banho_tosa")) return { rows: [{ agenda_publica_horario_id: 6 }] };
      if (q.startsWith("select ((")) return { rows: [{ futuro: future }] };
      if (q.startsWith("select ( ")) return { rows: [{ agendado_para: "2099-03-10T14:00:00.000Z" }] };
      if (q.startsWith("select p.id, p.nome, p.raca, p.porte, p.ativo")) return { rows: [{ id: 5, nome: "Luna", raca: "SRD", porte: "medio", ativo: true, tutor_id: 44, tutor_nome: "Tutor teste", tutor_telefone: null, tutor_email: null, tutor_ativo: true }] };
      if (q.startsWith("select id, nome, descricao")) return { rows: [{ id: 3, nome: "Banho", descricao: null, valor: "75.00", duracao_minutos: 30, ativo: true }] };
      if (q.startsWith("select * from banho_tosa where id = $1 for update")) return { rows: [{ ...atendimento }] };
      if (q.startsWith("select bt.*")) return { rows: [{ ...atendimento, pet_ativo: true }] };
      if (q.startsWith("select p.id, p.ativo, p.raca")) return { rows: [{ id: 5, ativo: true, raca: "SRD", porte: "medio", tutor_ativo: true }] };
      if (q.startsWith("select s.id, s.ativo")) return { rows: [{ id: 3, ativo: true }] };
      if (q.startsWith("select count(*)::int as quantidade")) return { rows: [{ quantidade: 1, valor_total: "75.00", todos_ativos: true }] };
      if (q.startsWith("select id from pagamentos_banho_tosa")) return { rows: [] };
      if (q.startsWith("insert into banho_tosa (")) return { rows: [{ ...atendimento, status: "AGUARDANDO_CONFIRMACAO", origem: "PUBLICO" }] };
      if (q.startsWith("insert into banho_tosa_servicos")) return { rows: [{ id: 1 }] };
      if (q.startsWith("insert into pagamentos_banho_tosa")) return { rows: [{ id: 22, banho_tosa_id: 81, valor_total: "75.00", status: "PENDENTE" }] };
      if (q.startsWith("update banho_tosa set status = 'agendado'")) return { rows: [{ ...atendimento, status: "AGENDADO" }], rowCount: 1 };
      if (q.startsWith("update banho_tosa set status = 'recusado'")) return { rows: [{ ...atendimento, status: "RECUSADO" }], rowCount: 1 };
      if (q.startsWith("update agenda_publica_horarios set status = 'ocupado'")) return { rows: [{ id: 6 }], rowCount: 1 };
      if (q.startsWith("update agenda_publica_horarios set status = 'reservado'")) return { rows: [{ id: 6 }], rowCount: 1 };
      if (q.startsWith("update agenda_publica_horarios set status = $1")) return { rows: [{ id: 6 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  pool.connect.mockResolvedValue(client);
  return { client, calls };
}

beforeEach(() => {
  mockPerfil = "funcionario";
  pool.connect.mockReset();
});

test("pedido público cria pendência, reserva horário e não cria cobrança", async () => {
  const { client } = makeClient({ slotStatus: "DISPONIVEL" });
  const response = await request(app).post("/api/agendamento-publico/confirmar").send({
    pet_id: 5, horario_id: 6, servicos: [3], observacoes: "Levar guia",
  });
  expect(response.status).toBe(201);
  expect(response.body.mensagem).toBe("Sua solicitação foi recebida e aguarda confirmação da equipe Amores Pet.");
  expect(response.body.atendimento.status).toBe("AGUARDANDO_CONFIRMACAO");
  expect(response.body.atendimento.pagamento).toBeNull();
  expect(client.query.mock.calls.some(([sql]) => /INSERT INTO pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);
  expect(client.query.mock.calls.some(([sql]) => /status = 'RESERVADO'/i.test(String(sql)))).toBe(true);
  expect(client.query.mock.calls.some(([sql]) => /SOLICITACAO_CRIADA/i.test(String(sql)))).toBe(true);
});

test.each(["funcionario", "gerente", "administrador"])("%s pode confirmar e gera uma cobrança pendente única", async (perfil) => {
  mockPerfil = perfil;
  const { client } = makeClient();
  const response = await request(app).patch("/api/atendimentos/81/confirmar");
  expect(response.status).toBe(200);
  expect(response.body.atendimento.status).toBe("AGENDADO");
  expect(response.body.pagamento.status).toBe("PENDENTE");
  expect(client.query.mock.calls.filter(([sql]) => /INSERT INTO pagamentos_banho_tosa/i.test(String(sql)))).toHaveLength(1);
  expect(client.query.mock.calls.some(([sql, params]) => /SOLICITACAO_CONFIRMADA/i.test(String(sql)) && params[1] === 17)).toBe(true);
});

test("confirmação de horário passado é recusada sem pagamento", async () => {
  const { client } = makeClient({ future: false });
  const response = await request(app).patch("/api/atendimentos/81/confirmar");
  expect(response.status).toBe(409);
  expect(response.body.codigo).toBe("HORARIO_PASSADO");
  expect(client.query.mock.calls.some(([sql]) => /INSERT INTO pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);
  expect(client.query).toHaveBeenCalledWith("ROLLBACK");
});

test.each(["funcionario", "gerente", "administrador"])("%s pode recusar com motivo e sem reabrir dia fechado", async (perfil) => {
  mockPerfil = perfil;
  const { client } = makeClient({ dayOpen: false });
  const invalida = await request(app).patch("/api/atendimentos/81/recusar").send({ motivo: "   " });
  expect(invalida.status).toBe(400);
  expect(pool.connect).not.toHaveBeenCalled();

  const response = await request(app).patch("/api/atendimentos/81/recusar").send({ motivo: "Pet precisa de avaliação prévia" });
  expect(response.status).toBe(200);
  expect(response.body.atendimento.status).toBe("RECUSADO");
  expect(response.body.horario_liberado).toBe(false);
  const evento = client.query.mock.calls.find(([sql]) => /SOLICITACAO_RECUSADA/i.test(String(sql)));
  expect(evento[1]).toEqual([81, 17, "Pet precisa de avaliação prévia"]);
  expect(client.query.mock.calls.some(([sql, params]) => /UPDATE agenda_publica_horarios/i.test(String(sql)) && params[0] === "BLOQUEADO")).toBe(true);
});

test("recusa libera somente slot aberto, publicado e futuro", async () => {
  const { client } = makeClient({ dayOpen: true });
  const response = await request(app).patch("/api/atendimentos/81/recusar").send({ motivo: "Tutor pediu outro horario" });
  expect(response.status).toBe(200);
  expect(response.body.horario_liberado).toBe(true);
  expect(client.query.mock.calls.some(([sql, params]) => /UPDATE agenda_publica_horarios/i.test(String(sql)) && params[0] === "DISPONIVEL")).toBe(true);
});
test("solicitação pendente não pode iniciar atendimento nem confirmar pagamento", async () => {
  const { client } = makeClient();
  const iniciar = await request(app).patch("/api/atendimentos/81/iniciar");
  expect(iniciar.status).toBe(409);
  expect(client.query.mock.calls.some(([sql]) => /UPDATE banho_tosa/i.test(String(sql)))).toBe(false);

  const finalizar = await request(app).patch("/api/atendimentos/81/finalizar").send({ observacoes_atendimento: "" });
  expect(finalizar.status).toBe(409);

  mockPerfil = "gerente";
  const pagamento = await request(app).patch("/api/atendimentos/81/pagamento").send({ metodo: "DINHEIRO" });
  expect(pagamento.status).toBe(409);
  expect(client.query.mock.calls.some(([sql]) => /FROM pagamentos_banho_tosa/i.test(String(sql)))).toBe(false);

  mockPerfil = "funcionario";
  const financeiro = await request(app).patch("/api/atendimentos/81/pagamento").send({ metodo: "DINHEIRO" });
  expect(financeiro.status).toBe(403);
});
