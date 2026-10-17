const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

process.env.JWT_SECRET = "chave-ficticia-exclusiva-da-suite-http-d1";

function token(id = 17) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function criarCliente({ quantidade = 5, ativo = true } = {}) {
  const chamadas = [];
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      const consulta = String(sql).replace(/\s+/g, " ").trim();
      chamadas.push(consulta);
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(consulta)) return { rows: [], rowCount: 0 };
      if (/SELECT \* FROM produtos/i.test(consulta)) {
        return { rows: [{ id: 12, nome: "Shampoo", unidade: "unidade", ativo, quantidade_atual: quantidade }] };
      }
      if (/UPDATE produtos/i.test(consulta)) {
        return { rows: [{ id: 12, nome: "Shampoo", unidade: "unidade", ativo, quantidade_atual: Number(consulta.includes("SET") ? client.query.mock.calls.at(-1)[1][0] : quantidade) }] };
      }
      if (/INSERT INTO movimentacoes_estoque/i.test(consulta)) {
        const [, tipo, quantidadeMovida, anterior, posterior, motivo, usuarioId] = client.query.mock.calls.at(-1)[1];
        return { rows: [{ id: 91, produto_id: 12, tipo, quantidade: quantidadeMovida,
          quantidade_anterior: anterior, quantidade_posterior: posterior, motivo, usuario_id: usuarioId }] };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  return { client, chamadas };
}

function configurarPool(perfil = "gerente") {
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes("FROM usuarios")) {
      return { rows: [{ id: 17, nome: "Operador", email: "operador@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    }
    if (String(sql).includes("FROM produtos") && String(sql).includes("WHERE id = $1")) return { rows: [{ id: 12 }] };
    if (String(sql).includes("FROM movimentacoes_estoque m")) {
      return { rows: [{ id: 91, produto_id: 12, tipo: "ENTRADA", quantidade: 3,
        quantidade_anterior: 2, quantidade_posterior: 5, motivo: "Reposição", usuario_nome: "Operador" }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
});

test.each([
  ["ENTRADA", 3, 5, 8],
  ["SAIDA", 3, 5, 2],
])("%s atualiza quantidade e grava movimentacao na mesma transacao", async (tipo, quantidade, inicial, final) => {
  configurarPool("gerente");
  const { client, chamadas } = criarCliente({ quantidade: inicial });
  pool.connect.mockResolvedValue(client);

  const response = await request(app).post("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" })
    .send({ tipo, quantidade, motivo: "Reposição" });

  expect(response.status).toBe(201);
  expect(response.body.produto.quantidade_atual).toBe(final);
  expect(response.body.movimentacao).toMatchObject({ quantidade_anterior: inicial, quantidade_posterior: final });
  expect(chamadas[0]).toBe("BEGIN");
  expect(chamadas.findIndex((sql) => /FOR UPDATE/i.test(sql))).toBeGreaterThan(chamadas.indexOf("BEGIN"));
  expect(chamadas.findIndex((sql) => /INSERT INTO movimentacoes_estoque/i.test(sql))).toBeGreaterThan(chamadas.findIndex((sql) => /UPDATE produtos/i.test(sql)));
  expect(chamadas.at(-1)).toBe("COMMIT");
  expect(client.release).toHaveBeenCalledTimes(1);
});

test("saida acima do disponivel e recusada sem alterar produto ou historico", async () => {
  configurarPool("gerente");
  const { client, chamadas } = criarCliente({ quantidade: 2 });
  pool.connect.mockResolvedValue(client);

  const response = await request(app).post("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" }).send({ tipo: "SAIDA", quantidade: 3 });

  expect(response.status).toBe(400);
  expect(response.body.mensagem).toContain("Estoque insuficiente");
  expect(chamadas).toContain("ROLLBACK");
  expect(chamadas.some((sql) => /UPDATE produtos|INSERT INTO movimentacoes_estoque/i.test(sql))).toBe(false);
});

test("produto inativo nao aceita movimentacao e funcionario nao pode movimentar", async () => {
  configurarPool("gerente");
  const inativo = criarCliente({ ativo: false });
  pool.connect.mockResolvedValue(inativo.client);
  const respostaInativo = await request(app).post("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" }).send({ tipo: "ENTRADA", quantidade: 1 });
  expect(respostaInativo.status).toBe(400);
  expect(inativo.chamadas).toContain("ROLLBACK");

  pool.connect.mockClear();
  configurarPool("funcionario");
  const proibida = await request(app).post("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" }).send({ tipo: "ENTRADA", quantidade: 1 });
  expect(proibida.status).toBe(403);
  expect(pool.connect).not.toHaveBeenCalled();
});

test("consulta de historico por produto e somente leitura e exige autenticacao", async () => {
  configurarPool("funcionario");
  const resposta = await request(app).get("/api/estoque/produtos/12/movimentacoes")
    .auth(token(), { type: "bearer" });
  expect(resposta.status).toBe(200);
  expect(resposta.body).toHaveLength(1);
  expect(resposta.body[0]).toMatchObject({ produto_id: 12, quantidade_posterior: 5 });

  const anonima = await request(app).get("/api/estoque/produtos/12/movimentacoes");
  expect(anonima.status).toBe(401);
});
