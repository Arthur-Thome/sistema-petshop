jest.mock("../src/database/connection", () => ({
  query: jest.fn(),
}));

const pool = require("../src/database/connection");
const controller = require("../src/controllers/notificacaoController");

function respostaMock() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

beforeEach(() => pool.query.mockReset());

test("lista somente notificações do usuário autenticado e inclui contagem e preferência", async () => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("INSERT INTO notificacoes_internas")) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT id, evento")) return { rows: [{ id: 2, evento: "NOVO_ATENDIMENTO" }] };
    if (sql.includes("COUNT(*)")) return { rows: [{ nao_lidas: 4 }] };
    if (sql.includes("FROM preferencias_notificacao")) return { rows: [{ modo: "SONORO" }] };
    throw new Error("Consulta inesperada");
  });

  const req = { usuario: { id: 17, perfil: "funcionario" }, query: { apenas_nao_lidas: "true" } };
  const res = respostaMock();
  await controller.listarNotificacoes(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    notificacoes: [{ id: 2, evento: "NOVO_ATENDIMENTO" }],
    nao_lidas: 4,
    preferencia: "SONORO",
  }));
  for (const chamada of pool.query.mock.calls) {
    expect(chamada[1]?.[0]).toBe(17);
  }
});

test("marca individualmente apenas notificação pertencente ao usuário autenticado", async () => {
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  const req = { usuario: { id: 17, perfil: "gerente" }, params: { id: "99" } };
  const res = respostaMock();

  await controller.marcarNotificacaoLida(req, res);

  expect(pool.query).toHaveBeenCalledWith(
    expect.stringContaining("WHERE id = $1 AND usuario_id = $2"),
    [99, 17]
  );
  expect(res.status).toHaveBeenCalledWith(404);
});

test("marcar todas e alterar preferência usam somente o usuário autenticado", async () => {
  pool.query.mockResolvedValue({ rows: [{ modo: "VISUAL" }], rowCount: 3 });
  const reqLidas = { usuario: { id: 21, perfil: "administrador" } };
  const resLidas = respostaMock();
  await controller.marcarTodasLidas(reqLidas, resLidas);
  expect(pool.query.mock.calls[0][0]).toContain("WHERE usuario_id = $1 AND lida_em IS NULL");
  expect(pool.query.mock.calls[0][1]).toEqual([21]);

  const reqPreferencia = { usuario: { id: 21, perfil: "administrador" }, body: { modo: "sonoro" } };
  const resPreferencia = respostaMock();
  await controller.atualizarPreferencia(reqPreferencia, resPreferencia);
  expect(pool.query.mock.calls[1][1]).toEqual([21, "SONORO"]);
  expect(resPreferencia.status).toHaveBeenCalledWith(200);
});

test("rejeita modo inválido para impedir seleção simultânea visual e sonora", async () => {
  const req = { usuario: { id: 21, perfil: "funcionario" }, body: { modo: "AMBOS" } };
  const res = respostaMock();
  await controller.atualizarPreferencia(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.query).not.toHaveBeenCalled();
});

test("nega perfis não operacionais antes de consultar notificações", async () => {
  const req = { usuario: { id: 21, perfil: "cliente" }, query: {} };
  const res = respostaMock();
  await controller.listarNotificacoes(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.query).not.toHaveBeenCalled();
});
