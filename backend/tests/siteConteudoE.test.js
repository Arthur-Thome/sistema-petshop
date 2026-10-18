const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const diretorioTeste = path.join(os.tmpdir(), `amores-site-gallery-${crypto.randomUUID()}`);
process.env.SITE_GALLERY_STORAGE_DIR = diretorioTeste;

const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");
const storage = require("../src/services/siteGalleryStorage");
const { validarMapsUrl } = require("../src/controllers/siteConteudoController");

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ykAAAAASUVORK5CYII=", "base64");

function token(perfil) {
  return jwt.sign({ id: 7, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function configurarUsuario(perfil) {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Gestor teste", email: "teste@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    if (sql.includes("INSERT INTO site_galeria")) return { rows: [{ id: 12, arquivo_nome: `${crypto.randomUUID()}.png`, mime_type: "image/png", tamanho_bytes: PNG_1X1.length, titulo: "Teste", legenda: null, texto_alternativo: "Foto teste", categoria: "Equipe", ordem: 0, publicado: false }] };
    return { rows: [] };
  });
}

beforeEach(() => pool.query.mockReset());
afterAll(async () => { await fs.rm(diretorioTeste, { recursive: true, force: true }); });

test.each(["administrador", "super_administrador"])("perfil %s acessa o painel completo", async (perfil) => {
  configurarUsuario(perfil);
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Gestor teste", email: "teste@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    if (sql.includes("FROM site_conteudo")) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
  const resposta = await request(app).get("/api/site-conteudo/admin").auth(token(perfil), { type: "bearer" });
  expect(resposta.status).toBe(200);
  expect(resposta.body.configuracoes.id).toBe(1);
});

test.each(["administrador", "super_administrador"])("perfil %s atualiza conteúdo institucional com autoria", async (perfil) => {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Gestor teste", email: "teste@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    return { rows: [] };
  });
  const chamadas = [];
  const client = {
    query: jest.fn(async (sql, values) => {
      chamadas.push({ sql, values });
      if (sql.includes("SELECT * FROM site_conteudo")) return { rows: [{ id: 1, titulo_principal: "Anterior" }] };
      if (sql.includes("RETURNING *")) return { rows: [{ id: 1, titulo_principal: "Novo título" }] };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  const resposta = await request(app).put("/api/site-conteudo/admin/configuracoes")
    .auth(token(perfil), { type: "bearer" }).send({ titulo_principal: "Novo título" });
  expect(resposta.status).toBe(200);
  expect(resposta.body.configuracoes.titulo_principal).toBe("Novo título");
  expect(chamadas.some(({ sql, values }) => sql.includes("INSERT INTO site_conteudo") && values.at(-1) === 7)).toBe(true);
  expect(chamadas.some(({ sql }) => sql === "COMMIT")).toBe(true);
  expect(client.release).toHaveBeenCalledTimes(1);
  expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO logs"), expect.any(Array));
});

test.each(["gerente", "funcionario"])("perfil %s consulta a Galeria sem acessar a administraÃ§Ã£o geral", async (perfil) => {
  configurarUsuario(perfil);
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Equipe teste", email: "teste@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    if (sql.includes("FROM site_galeria")) return { rows: [{ id: 12, titulo: "Foto teste" }] };
    return { rows: [] };
  });
  const tokenAuth = token(perfil);
  expect((await request(app).get("/api/site-conteudo/admin").auth(tokenAuth, { type: "bearer" })).status).toBe(403);
  const resposta = await request(app).get("/api/site-conteudo/admin/galeria").auth(tokenAuth, { type: "bearer" });
  expect(resposta.status).toBe(200);
  expect(resposta.body.galeria).toHaveLength(1);
});

test.each(["gerente", "funcionario"])("perfil %s nao altera a Galeria sem autorizacao por operacao", async (perfil) => {
  configurarUsuario(perfil);
  const negado = await request(app).delete("/api/site-conteudo/admin/galeria/12")
    .auth(token(perfil), { type: "bearer" });
  expect(negado.status).toBe(401);
});

test("visitante nao consulta o painel", async () => {
  expect((await request(app).get("/api/site-conteudo/admin")).status).toBe(401);
  expect(pool.query).not.toHaveBeenCalled();
});

test("leitura publica nao devolve rascunhos e SQL filtra publicacao e remocao", async () => {
  const chamadas = [];
  pool.query.mockImplementation(async (sql) => {
    chamadas.push(sql);
    if (sql.includes("FROM site_premiacoes")) return { rows: [{ id: 2, titulo: "Reconhecimento publicado" }] };
    if (sql.includes("FROM site_galeria")) return { rows: [{ id: 3, titulo: "Foto publicada" }] };
    return { rows: [{ titulo_principal: "Conteudo institucional" }] };
  });
  const resposta = await request(app).get("/api/site-conteudo/publico");
  expect(resposta.status).toBe(200);
  expect(resposta.body.premios).toHaveLength(1);
  expect(resposta.body.galeria).toHaveLength(1);
  expect(chamadas.join(" ")).toMatch(/publicado\s*=\s*TRUE/i);
  expect(chamadas.join(" ")).toMatch(/removido_em\s+IS\s+NULL/i);
});

test("Maps aceita destino HTTPS permitido e recusa destinos perigosos", () => {
  expect(validarMapsUrl("https://www.google.com/maps/search/?api=1&query=Amores+Pet")).toContain("google.com/maps");
  expect(() => validarMapsUrl("javascript:alert(1)")).toThrow();
  expect(() => validarMapsUrl("https://google.com.evil.invalid/maps")).toThrow();
  expect(() => validarMapsUrl("https://www.google.com/search?q=pet")).toThrow();
});

test("upload de galeria persiste PNG valido no armazenamento segregado e rejeita arquivo falso", async () => {
  expect(storage.detectarMimeImagem(PNG_1X1)).toBe("image/png");
  expect(storage.detectarMimeImagem(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  configurarUsuario("administrador");
  const valido = await request(app).post("/api/site-conteudo/admin/galeria")
    .auth(token("administrador"), { type: "bearer" })
    .field("texto_alternativo", "Foto teste")
    .field("publicado", "false")
    .attach("imagem", PNG_1X1, { filename: "foto.png", contentType: "image/png" });
  expect(valido.status).toBe(201);
  expect(valido.body.imagem.imagem_url).toMatch(/^\/site-conteudo\/admin\/galeria\/\d+\/imagem$/);
  const arquivos = await fs.readdir(diretorioTeste);
  expect(arquivos).toHaveLength(1);
  expect(arquivos[0]).toMatch(/^[a-f0-9-]{36}\.png$/);

  pool.query.mockReset();
  configurarUsuario("administrador");
  const falso = await request(app).post("/api/site-conteudo/admin/galeria")
    .auth(token("administrador"), { type: "bearer" })
    .field("texto_alternativo", "Arquivo recusado")
    .field("publicado", "false")
    .attach("imagem", Buffer.from("<svg onload=alert(1) />"), { filename: "imagem.png", contentType: "image/png" });
  expect(falso.status).toBe(400);
  expect(falso.body.mensagem).not.toContain("/storage/");
  expect(await fs.readdir(diretorioTeste)).toHaveLength(1);
});

test("remover imagem do site e uma operacao logica sem apagar o arquivo", async () => {
  configurarUsuario("administrador");
  const existente = (await fs.readdir(diretorioTeste))[0];
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Admin teste", email: "teste@example.invalid", perfil: "administrador", ativo: true, versao_sessao: 1 }] };
    return { rows: [] };
  });
  const client = {
    query: jest.fn(async (sql) => {
      if (String(sql).includes("UPDATE site_galeria")) return { rows: [{ id: 12, titulo: "Teste", arquivo_nome: existente }], rowCount: 1 };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(client);
  const remover = jest.spyOn(storage, "removerImagem");
  const resposta = await request(app).delete("/api/site-conteudo/admin/galeria/12")
    .auth(token("administrador"), { type: "bearer" });
  expect(resposta.status).toBe(200);
  expect(remover).not.toHaveBeenCalled();
  expect(await fs.readdir(diretorioTeste)).toContain(existente);
  remover.mockRestore();
});

test("caminhos e dimensoes perigosos sao recusados", () => {
  expect(storage.resolverCaminho("..\\private.png")).toBeNull();
  expect(() => storage.validarRaizArmazenamento(path.resolve(__dirname, "../src/uploads/pets"))).toThrow();
  const pngGigante = Buffer.from(PNG_1X1);
  pngGigante.writeUInt32BE(12001, 16);
  expect(storage.detectarMimeImagem(pngGigante)).toBeNull();
});
