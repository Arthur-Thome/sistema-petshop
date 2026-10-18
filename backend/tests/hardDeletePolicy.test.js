const mockPool = { query: jest.fn(), connect: jest.fn() };

jest.mock("../src/database/connection", () => mockPool);
jest.mock("../src/services/logService", () => ({ registrarLogObrigatorio: jest.fn() }));
jest.mock("../src/services/operationAuthorizationService", () => ({ consumirAutorizacao: jest.fn() }));
jest.mock("../src/services/permanentFileDeletionService", () => ({ processarArquivoExcluido: jest.fn() }));

const { ENTIDADES, consultar } = require("../src/services/hardDeleteService");

test("a configuração institucional singleton não é uma entidade de exclusão definitiva", async () => {
  expect(ENTIDADES).not.toHaveProperty("site_conteudo");
  await expect(consultar("site_conteudo", 1)).rejects.toMatchObject({ status: 400 });
  expect(mockPool.query).not.toHaveBeenCalled();
});

test("a prévia bloqueia tutor inativo que ainda possui dependência", async () => {
  mockPool.query.mockImplementation(async (sql) => {
    if (String(sql).includes("SELECT id, nome, email, ativo FROM public.tutores")) {
      return { rows: [{ id: 12, nome: "Tutor sintético", email: "tutor@example.invalid", ativo: false }] };
    }
    if (String(sql).includes("AS elegivel")) return { rows: [{ elegivel: true }] };
    if (String(sql).includes("FROM pg_constraint fk")) {
      return { rows: [{ schema_name: "public", table_name: "pets", column_name: "tutor_id" }] };
    }
    if (String(sql).includes('WHERE "tutor_id" = $1')) return { rows: [{ existe: true }] };
    throw new Error("Consulta de teste inesperada");
  });
  const resultado = await consultar("tutores", 12);
  expect(resultado.elegivel).toBe(false);
  expect(resultado.dependencias).toEqual(["pets"]);
  expect(resultado.motivo_bloqueio).toMatch(/dependentes/i);
});

test.each(["pagamentos_atendimentos", "pagamentos_banho_tosa", "movimentacoes_estoque", "logs", "operation_authorizations", "atendimentos"])(
  "%s permanece fora da lista de exclusão definitiva",
  async (entidade) => {
    expect(ENTIDADES).not.toHaveProperty(entidade);
    await expect(consultar(entidade, 1)).rejects.toMatchObject({ status: 400 });
    expect(mockPool.query).not.toHaveBeenCalled();
  },
);
