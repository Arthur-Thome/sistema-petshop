const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

const perfis = ["funcionario", "gerente", "administrador", "super_administrador"];
const cliente = { query: jest.fn(), release: jest.fn() };

function token(perfil) {
  return jwt.sign({ id: 7, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function preparar(perfil) {
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Conta sintética", email: "lote2@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    if (String(sql).includes("INSERT INTO servicos")) return { rows: [{ id: 22, nome: "Serviço sintético", valor: "1.00", duracao_minutos: 15, ativo: true }] };
    return { rows: [] };
  });
  cliente.query.mockImplementation(async (sql) => {
    if (String(sql).includes("SELECT * FROM site_galeria")) return { rows: [{ id: 12, titulo: "Imagem sintética", arquivo_nome: "teste.png", publicado: false }] };
    if (String(sql).includes("UPDATE site_galeria")) return { rows: [{ id: 12, titulo: "Imagem sintética", arquivo_nome: "teste.png", publicado: true }] };
    return { rows: [], rowCount: 1 };
  });
  pool.connect.mockResolvedValue(cliente);
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
  cliente.query.mockReset();
  cliente.release.mockReset();
});

test.each(perfis)("administração de conteúdo do site segue a matriz de perfis para %s", async (perfil) => {
  preparar(perfil);
  const resposta = await request(app).get("/api/site-conteudo/admin").auth(token(perfil), { type: "bearer" });
  const permitido = ["administrador", "super_administrador"].includes(perfil);
  expect(resposta.status).toBe(permitido ? 200 : 403);
  if (!permitido) expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("FROM site_conteudo"))).toBe(false);
});

test.each(perfis)("administração da Agenda Pública segue a matriz de perfis para %s", async (perfil) => {
  preparar(perfil);
  const resposta = await request(app).get("/api/agenda-publica/admin")
    .query({ data_inicio: "2026-10-20", data_fim: "2026-10-21" })
    .auth(token(perfil), { type: "bearer" });
  const permitido = ["administrador", "super_administrador"].includes(perfil);
  expect(resposta.status).toBe(permitido ? 200 : 403);
  if (!permitido) expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("FROM agenda_publica_dias"))).toBe(false);
});

test.each(perfis)("alteração do catálogo de serviços segue a matriz de perfis para %s", async (perfil) => {
  preparar(perfil);
  const resposta = await request(app).post("/api/servicos").auth(token(perfil), { type: "bearer" })
    .send({ nome: "Serviço sintético", descricao: "Fixture Lote 2", valor: 1, duracao_minutos: 15 });
  const permitido = ["administrador", "super_administrador"].includes(perfil);
  expect(resposta.status).toBe(permitido ? 201 : 403);
  expect(pool.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO servicos"))).toBe(permitido);
});

test.each(perfis)("edição direta da Galeria exige autorização somente para Gerente/Funcionário: %s", async (perfil) => {
  preparar(perfil);
  const resposta = await request(app).put("/api/site-conteudo/admin/galeria/12")
    .auth(token(perfil), { type: "bearer" })
    .send({ texto_alternativo: "Imagem de teste", ordem: 1, publicado: true });
  const permitidoDiretamente = ["administrador", "super_administrador"].includes(perfil);
  expect(resposta.status).toBe(permitidoDiretamente ? 200 : 401);
  expect(pool.connect).toHaveBeenCalledTimes(permitidoDiretamente ? 1 : 0);
});
