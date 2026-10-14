jest.mock("../src/database/connection", () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock("../src/services/whatsappBusinessService", () => ({
  enviarTexto: jest.fn(),
  enviarDocumento: jest.fn(),
  normalizarDestino: jest.fn((telefone) => telefone),
}));

const pool = require("../src/database/connection");
const whatsApp = require("../src/services/whatsappBusinessService");
const { enviarWhatsAppTexto } = require("../src/controllers/comunicacaoController");

function response() {
  const res = { statusCode: 200 };
  res.status = jest.fn((status) => { res.statusCode = status; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

function client(resultadoConsulta = { rows: [] }) {
  return { query: jest.fn(async (sql) => String(sql).includes("SELECT id FROM logs") ? resultadoConsulta : { rows: [] }), release: jest.fn() };
}

beforeEach(() => {
  process.env.WHATSAPP_TRANSPORT = "meta_cloud";
  pool.query.mockReset().mockResolvedValue({ rows: [] });
  pool.connect.mockReset();
  whatsApp.enviarTexto.mockReset();
});

test("reserva e registra o envio por atendimento sem guardar o telefone completo", async () => {
  const db = client();
  pool.connect.mockResolvedValue(db);
  whatsApp.enviarTexto.mockResolvedValue({ messageId: "wamid-fake" });
  const res = response();
  await enviarWhatsAppTexto({ body: { atendimento_id: 87, consentimento_confirmado: true, telefone: "5511999991234", texto: "mensagem ficticia" }, usuario: { id: 4 }, ip: "127.0.0.1" }, res);
  expect(res.statusCode).toBe(200);
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), ["whatsapp:87:texto"]);
  expect(db.query.mock.calls.some(([sql]) => String(sql).includes("WHATSAPP_ENVIO_INICIADO"))).toBe(true);
  expect(pool.query.mock.calls[0][1][3]).toContain('"destino_final":"1234"');
  expect(pool.query.mock.calls[0][1][3]).not.toContain("5511999991234");
  expect(db.release).toHaveBeenCalled();
});

test("uma tentativa anterior no mesmo atendimento impede reenvio duplicado", async () => {
  const db = client({ rows: [{ id: 1 }] });
  pool.connect.mockResolvedValue(db);
  const res = response();
  await enviarWhatsAppTexto({ body: { atendimento_id: 87, consentimento_confirmado: true, telefone: "5511999991234", texto: "mensagem ficticia" }, usuario: { id: 4 }, ip: "127.0.0.1" }, res);
  expect(res.statusCode).toBe(409);
  expect(res.body.codigo).toBe("WHATSAPP_ENVIO_DUPLICADO");
  expect(whatsApp.enviarTexto).not.toHaveBeenCalled();
});
