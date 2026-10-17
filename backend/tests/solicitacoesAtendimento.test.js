const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../src/database/connection");

process.env.JWT_SECRET = "chave-ficticia-exclusiva-da-suite-http-d1";

const solicitacao = {
  id: 81,
  status: "AGUARDANDO_CONFIRMACAO",
  pet_nome: "Luna",
  pet_foto: "/uploads/pets/foto-sintetica-hml.png",
  tutor_nome: "Tutor de teste",
  servicos: [{ id: 3, nome: "Banho", valor: "75.00", duracao_minutos: 30 }],
};

function token(id = 17) {
  return jwt.sign({ id, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: "HS256" });
}

function configurarPool(perfil, listar) {
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes("FROM usuarios")) {
      return { rows: [{ id: 17, nome: "Operador", email: "operador@example.invalid", perfil, ativo: true, versao_sessao: 1 }] };
    }
    if (String(sql).includes("FROM banho_tosa bt")) return listar();
    throw new Error("Consulta inesperada no teste isolado");
  });
}

beforeEach(() => pool.query.mockReset());

test.each(["administrador", "gerente", "funcionario"])("%s consulta solicitações pendentes sem alterar registros", async (perfil) => {
  configurarPool(perfil, async () => ({ rows: [solicitacao] }));
  const response = await request(app).get("/api/atendimentos/solicitacoes")
    .auth(token(), { type: "bearer" });

  expect(response.status).toBe(200);
  expect(response.body.solicitacoes).toEqual([solicitacao]);
  expect(response.body.solicitacoes[0].pet_foto).toBe("/uploads/pets/foto-sintetica-hml.png");
  const consulta = pool.query.mock.calls.find(([sql]) => String(sql).includes("FROM banho_tosa bt"));
  expect(consulta[0]).toContain("AGUARDANDO_CONFIRMACAO");
  expect(consulta[0]).toContain("p.foto AS pet_foto");
  expect(consulta[0]).toContain("historico_atendimentos");
  expect(pool.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(String(sql)))).toBe(true);
});

test("lista vazia e uma resposta 200 valida", async () => {
  configurarPool("gerente", async () => ({ rows: [] }));
  const response = await request(app).get("/api/atendimentos/solicitacoes")
    .auth(token(), { type: "bearer" });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ solicitacoes: [] });
});

test("falha SQL retorna requestId e conserva diagnostico tecnico seguro apenas no servidor", async () => {
  const erroSql = Object.assign(new Error("texto interno que nao deve chegar ao cliente"), {
    code: "42803",
    schema: "public",
    table: "banho_tosa",
    column: "status",
    routine: "check_ungrouped_columns_walker",
  });
  configurarPool("gerente", async () => { throw erroSql; });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await request(app).get("/api/atendimentos/solicitacoes")
      .auth(token(), { type: "bearer" });

    expect(response.status).toBe(500);
    expect(response.body.codigo).toBe("ERRO_INTERNO");
    expect(JSON.stringify(response.body)).not.toContain("texto interno");
    expect(response.body.requestId).toBeTruthy();
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
    expect(log).toHaveBeenCalledTimes(1);
    const diagnostico = JSON.parse(log.mock.calls[0][0]);
    expect(diagnostico).toMatchObject({
      evento: "public_requests_list_failed",
      operacao: "listar_solicitacoes_publicas",
      requestId: response.body.requestId,
      codigo: "42803",
      schema: "public",
      table: "banho_tosa",
      column: "status",
      routine: "check_ungrouped_columns_walker",
    });
    expect(JSON.stringify(diagnostico)).not.toContain("texto interno");
  } finally {
    log.mockRestore();
  }
});

test("fila rejeita requisicao sem autenticacao ou perfil de equipe", async () => {
  const anonima = await request(app).get("/api/atendimentos/solicitacoes");
  expect(anonima.status).toBe(401);
  expect(pool.query).not.toHaveBeenCalled();

  configurarPool("cliente", async () => ({ rows: [] }));
  const semPerfil = await request(app).get("/api/atendimentos/solicitacoes")
    .auth(token(), { type: "bearer" });
  expect(semPerfil.status).toBe(403);
  expect(pool.query).toHaveBeenCalledTimes(1);
});
