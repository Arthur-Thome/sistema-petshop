const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

function token(id = 7) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

beforeEach(() => pool.query.mockReset());

function configurarProduto() {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM usuarios")) return { rows: [{ id: 7, nome: "Gestor teste", perfil: "gerente", ativo: true, versao_sessao: 1 }] };
    if (sql.includes("SELECT id, nome, unidade, categoria")) return { rows: [{ id: 11, nome: "Shampoo neutro", unidade: "litro", categoria: "Higiene" }] };
    if (sql.includes("INSERT INTO produtos")) return { rows: [{ id: 22, nome: "Shampoo neutro", unidade: "litro" }] };
    return { rows: [], rowCount: 1 };
  });
}

test("cadastro de produto pede confirmação para nome/unidade iguais sem bloquear nomes legítimos", async () => {
  configurarProduto();
  const payload = { nome: " Shampoo neutro ", unidade: "litro", quantidade_atual: 0, quantidade_minima: 0 };
  const alerta = await request(app).post("/api/produtos").auth(token(), { type: "bearer" }).send(payload);
  expect(alerta.status).toBe(409);
  expect(alerta.body.codigo).toBe("POSSIVEL_DUPLICIDADE");
  expect(alerta.body.produtos_semelhantes).toHaveLength(1);
  expect(pool.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO produtos"))).toBe(false);

  const permitido = await request(app).post("/api/produtos").auth(token(), { type: "bearer" })
    .send({ ...payload, confirmar_possivel_duplicidade: true });
  expect(permitido.status).toBe(201);
  expect(pool.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO produtos"))).toBe(true);
});

test("funcionario continua sem permissão de criar produto", async () => {
  pool.query.mockResolvedValue({ rows: [{ id: 8, nome: "Operador", perfil: "funcionario", ativo: true, versao_sessao: 1 }] });
  const resposta = await request(app).post("/api/produtos").auth(token(8), { type: "bearer" })
    .send({ nome: "Novo", unidade: "un" });
  expect(resposta.status).toBe(403);
  expect(pool.query).toHaveBeenCalledTimes(1);
});
