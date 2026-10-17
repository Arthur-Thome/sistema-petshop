const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

process.env.JWT_SECRET = "chave-ficticia-exclusiva-da-suite-http-d1";

const produto = {
  id: 12,
  nome: "Shampoo",
  unidade: "unidade",
  quantidade_atual: 4,
  quantidade_minima: 2,
  ativo: false,
  estoque_baixo: false,
};
const movimentacao = {
  id: 55,
  produto_id: 12,
  tipo: "ENTRADA",
  quantidade: 4,
  quantidade_anterior: 0,
  quantidade_posterior: 4,
  motivo: "Estoque inicial",
  usuario_id: 17,
  usuario_nome: "Operador",
  criado_em: "2026-10-01T12:00:00.000Z",
};

function token(id = 17) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function configurarPool(perfil = "funcionario", produtoEncontrado = true) {
  pool.query.mockImplementation(async (sql) => {
    const consulta = String(sql);
    if (consulta.includes("FROM usuarios")) {
      return { rows: [{ id: 17, nome: "Operador", email: "operador@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    }
    if (consulta.includes("FROM produtos") && consulta.includes("quantidade_atual <= quantidade_minima")) {
      return { rows: produtoEncontrado ? [produto] : [] };
    }
    if (consulta.includes("FROM produtos") && consulta.includes("WHERE id = $1")) {
      return { rows: produtoEncontrado ? [{ id: produto.id }] : [] };
    }
    if (consulta.includes("FROM movimentacoes_estoque m")) return { rows: produtoEncontrado ? [movimentacao] : [] };
    return { rows: [] };
  });
}

beforeEach(() => pool.query.mockReset());

test("funcionario autenticado consulta produto inativo e historico sem receber permissao de edicao", async () => {
  configurarPool("funcionario");
  const detalhes = await request(app).get("/api/produtos/12")
    .auth(token(), { type: "bearer" });
  expect(detalhes.status).toBe(200);
  expect(detalhes.body.produto).toMatchObject({ id: 12, ativo: false });

  const historico = await request(app).get("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" });
  expect(historico.status).toBe(200);
  expect(historico.body).toEqual([movimentacao]);

  const editar = await request(app).put("/api/produtos/12")
    .auth(token(), { type: "bearer" }).send({ nome: "Outro nome" });
  expect(editar.status).toBe(403);
});

test("ID de produto inexistente recebe 404 na busca e no historico", async () => {
  configurarPool("gerente", false);
  const detalhes = await request(app).get("/api/produtos/999")
    .auth(token(), { type: "bearer" });
  expect(detalhes.status).toBe(404);

  const historico = await request(app).get("/api/estoque/produtos/999/movimentacoes")
    .auth(token(), { type: "bearer" });
  expect(historico.status).toBe(404);
});

test("busca de produto exige autenticacao", async () => {
  const response = await request(app).get("/api/produtos/12");
  expect(response.status).toBe(401);
  expect(pool.query).not.toHaveBeenCalled();
});
