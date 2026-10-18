const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");
const client = { query: jest.fn(), release: jest.fn() };

function token(id) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  client.query.mockReset();
  client.release.mockReset();
  pool.connect.mockResolvedValue(client);
  client.query.mockResolvedValue({ rows: [], rowCount: 1 });
});

test("Administrador nao pode criar perfil Super Administrador", async () => {
  pool.query.mockImplementation(async sql => String(sql).includes("FROM usuarios")
    ? { rows: [{ id: 7, nome: "Admin", email: "admin@example.invalid", perfil: "administrador", ativo: true, versao_sessao: 1 }] }
    : { rows: [] });
  const resposta = await request(app).post("/api/usuarios").auth(token(7), { type: "bearer" }).send({
    nome: "Conta privilegiada", email: "super@example.invalid", senha: "Senha-Sintetica-2026", perfil: "super_administrador",
  });
  expect(resposta.status).toBe(403);
  expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO usuarios"))).toBe(false);
});

test("Super Administrador pode criar outro Super Administrador", async () => {
  pool.query.mockImplementation(async (sql) => {
    const consulta = String(sql);
    if (consulta.includes("FROM usuarios") && consulta.includes("WHERE id = $1")) return { rows: [{ id: 7, nome: "Super", email: "super@example.invalid", perfil: "super_administrador", ativo: true, versao_sessao: 1 }] };
    return { rows: [] };
  });
  client.query.mockImplementation(async (sql) => String(sql).includes("INSERT INTO usuarios")
    ? { rows: [{ id: 9, nome: "Nova conta", email: "nova@example.invalid", perfil: "super_administrador", ativo: true, criado_em: new Date() }], rowCount: 1 }
    : { rows: [], rowCount: 1 });
  const resposta = await request(app).post("/api/usuarios").auth(token(7), { type: "bearer" }).send({
    nome: "Nova conta", email: "nova@example.invalid", senha: "Senha-Sintetica-2026", perfil: "super_administrador",
  });
  expect(resposta.status).toBe(201);
  expect(resposta.body.usuario.perfil).toBe("super_administrador");
});
