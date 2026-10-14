const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [{ id: 1, nome: "Equipe Teste", email: "teste@example.invalid", perfil: "funcionario", ativo: true, versao_sessao: 1 }] });
  process.env.WHATSAPP_TRANSPORT = "manual";
  delete process.env.WHATSAPP_ACCESS_TOKEN;
});

test("endpoint oficial e autenticado; transporte manual responde desativado sem envio", async () => {
  const anonimo = await request(app).post("/api/comunicacao/whatsapp/texto").send({ telefone: "5511987654321", texto: "teste" });
  expect(anonimo.status).toBe(401);
  const token = jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
  const equipe = await request(app).post("/api/comunicacao/whatsapp/texto").auth(token, { type: "bearer" }).send({ atendimento_id: 1, consentimento_confirmado: true, telefone: "5511987654321", texto: "teste" });
  expect(equipe.status).toBe(503);
  expect(equipe.body.codigo).toBe("WHATSAPP_NAO_CONFIGURADO");
});

test("upload de comprovante oficial tambem exige sessao interna e nao envia no modo manual", async () => {
  const documento = Buffer.from("%PDF-1.4\nficticio\n%%EOF\n");
  const anonimo = await request(app).post("/api/comunicacao/whatsapp/documento")
    .field("telefone", "5511987654321").attach("documento", documento, { filename: "teste.pdf", contentType: "application/pdf" });
  expect(anonimo.status).toBe(401);
  const token = jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
  const equipe = await request(app).post("/api/comunicacao/whatsapp/documento")
    .auth(token, { type: "bearer" }).field("atendimento_id", "1").field("consentimento_confirmado", "true").field("telefone", "5511987654321")
    .attach("documento", documento, { filename: "teste.pdf", contentType: "application/pdf" });
  expect(equipe.status).toBe(503);
  expect(equipe.body.codigo).toBe("WHATSAPP_NAO_CONFIGURADO");
});

test("CORS restringe origens a FRONTEND_URL configurado", async () => {
  const permitida = await request(app).get("/health/live").set("Origin", "http://localhost:5173");
  expect(permitida.status).toBe(200);
  expect(permitida.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  const negada = await request(app).get("/health/live").set("Origin", "https://origem-nao-configurada.example");
  expect(negada.status).toBe(403);
});

test("status informa indisponibilidade sem revelar configuracao ou segredos", async () => {
  const token = jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
  const status = await request(app).get("/api/comunicacao/whatsapp/status").auth(token, { type: "bearer" });
  expect(status.status).toBe(200);
  expect(status.body).toEqual({ disponivel: false });
  expect(JSON.stringify(status.body)).not.toContain("ACCESS_TOKEN");
});
