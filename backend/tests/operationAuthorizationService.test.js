const mockClient = { query: jest.fn(), release: jest.fn() };
const mockPool = { query: jest.fn(), connect: jest.fn() };

jest.mock("../src/database/connection", () => mockPool);
jest.mock("bcrypt", () => ({ compare: jest.fn() }));
jest.mock("../src/services/logService", () => ({ registrarLogObrigatorio: jest.fn(async () => {}) }));

const bcrypt = require("bcrypt");
const { registrarLogObrigatorio } = require("../src/services/logService");
const { emitirAutorizacao, consumirAutorizacao, hashContexto } = require("../src/services/operationAuthorizationService");

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });
  bcrypt.compare.mockResolvedValue(true);
});

test("contextos JSON com ordem de propriedades diferente produzem o mesmo hash", () => {
  expect(hashContexto({ a: 1, b: { x: 2, y: 3 } })).toBe(hashContexto({ b: { y: 3, x: 2 }, a: 1 }));
});

test("emite ticket hash-only e registra solicitante e autorizador distintos", async () => {
  mockClient.query.mockImplementation(async sql => {
    if (sql.includes("SELECT id, perfil, senha_hash")) return { rows: [
      { id: 7, perfil: "gerente", senha_hash: "hash-solicitante" },
      { id: 9, perfil: "administrador", senha_hash: "hash-autorizador" },
    ] };
    return { rows: [], rowCount: 1 };
  });
  const result = await emitirAutorizacao({
    requesterId: 7, authorizerId: 9, password: "senha-temporaria",
    operation: "GALERIA_ATUALIZAR", entity: "site_galeria", resourceId: 42,
    context: { titulo: "Foto sintética", publicado: true },
  });

  expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO operation_authorizations"))).toBe(true);
  expect(mockClient.query.mock.calls.flat().join(" ")).not.toContain("senha-temporaria");
  expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("COMMIT"));
  expect(bcrypt.compare).toHaveBeenCalledWith("senha-temporaria", "hash-autorizador");
  expect(registrarLogObrigatorio).toHaveBeenCalledWith(expect.objectContaining({
    acao: "AUTORIZACAO_OPERACAO_EMITIDA",
    valorNovo: expect.objectContaining({ solicitante_id: 7, autorizador_id: 9, operacao: "GALERIA_ATUALIZAR" }),
  }), mockClient);
});

test.each([
  ["gerente", "administrador"], ["gerente", "super_administrador"],
  ["funcionario", "administrador"], ["funcionario", "super_administrador"],
])("emite autorização da Galeria para solicitante %s com autorizador %s", async (requesterProfile, authorizerProfile) => {
  mockClient.query.mockImplementation(async sql => sql.includes("SELECT id, perfil, senha_hash")
    ? { rows: [
      { id: 7, perfil: requesterProfile, senha_hash: "hash-solicitante" },
      { id: 9, perfil: authorizerProfile, senha_hash: "hash-autorizador" },
    ] }
    : { rows: [], rowCount: 1 });
  const result = await emitirAutorizacao({
    requesterId: 7, authorizerId: 9, password: "senha-temporaria",
    operation: "GALERIA_REMOVER", entity: "site_galeria", resourceId: 42,
  });
  expect(result.token).toBeTruthy();
  expect(bcrypt.compare).toHaveBeenCalledWith("senha-temporaria", "hash-autorizador");
});

test("senha errada do autorizador não cria autorização", async () => {
  mockClient.query.mockImplementation(async sql => sql.includes("SELECT id, perfil, senha_hash")
    ? { rows: [
      { id: 7, perfil: "funcionario", senha_hash: "hash-solicitante" },
      { id: 9, perfil: "administrador", senha_hash: "hash-autorizador" },
    ] }
    : { rows: [], rowCount: 1 });
  bcrypt.compare.mockResolvedValue(false);
  await expect(emitirAutorizacao({
    requesterId: 7, authorizerId: 9, password: "senha-incorreta",
    operation: "GALERIA_ATUALIZAR", entity: "site_galeria", resourceId: 42, context: { titulo: "Teste" },
  })).rejects.toMatchObject({ status: 401 });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO operation_authorizations"))).toBe(false);
});

test("nega autoautorização da Galeria antes de consultar o banco", async () => {
  await expect(emitirAutorizacao({
    requesterId: 7, authorizerId: 7, password: "x", operation: "GALERIA_REMOVER", entity: "site_galeria", resourceId: 42,
  })).rejects.toMatchObject({ status: 403 });
  expect(mockPool.connect).not.toHaveBeenCalled();
});

test("nega um autorizador inativo ou de perfil não permitido", async () => {
  mockClient.query.mockImplementation(async sql => sql.includes("SELECT id, perfil, senha_hash")
    ? { rows: [{ id: 7, perfil: "funcionario", senha_hash: "hash" }, { id: 9, perfil: "gerente", senha_hash: "hash" }] }
    : { rows: [], rowCount: 1 });
  await expect(emitirAutorizacao({
    requesterId: 7, authorizerId: 9, password: "x", operation: "GALERIA_CRIAR", entity: "site_galeria", context: {},
  })).rejects.toMatchObject({ status: 403 });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO operation_authorizations"))).toBe(false);
});

test("Super Administrador confirma exclusão com a própria senha e contexto completo", async () => {
  mockClient.query.mockImplementation(async sql => sql.includes("SELECT id, perfil, senha_hash")
    ? { rows: [{ id: 5, perfil: "super_administrador", senha_hash: "hash" }] }
    : { rows: [], rowCount: 1 });
  const result = await emitirAutorizacao({
    requesterId: 5, authorizerId: 5, password: "senha",
    operation: "PERMANENT_DELETE", entity: "pets", resourceId: 12,
    context: { motivo: "Registro de teste isolado", confirmacao: "EXCLUIR 12", confirmacao_irreversivel: true },
  });
  expect(result.token).toBeTruthy();
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO operation_authorizations"))).toBe(true);
});

test("não emite autorização de exclusão para a configuração institucional singleton", async () => {
  await expect(emitirAutorizacao({
    requesterId: 5, authorizerId: 5, password: "senha",
    operation: "PERMANENT_DELETE", entity: "site_conteudo", resourceId: 1,
    context: { motivo: "Registro de teste isolado", confirmacao: "EXCLUIR 1", confirmacao_irreversivel: true },
  })).rejects.toMatchObject({ status: 400 });
  expect(mockPool.connect).not.toHaveBeenCalled();
});

test("consome ticket vinculado e rejeita repetição", async () => {
  const hash = hashContexto({ titulo: "Atualizado" });
  mockClient.query.mockImplementation(async sql => {
    if (sql.includes("FROM operation_authorizations")) return { rows: [{ id: 1, requester_user_id: 7,
      authorizer_user_id: 9, operation: "GALERIA_ATUALIZAR", entity: "site_galeria", resource_id: "42",
      context_hash: hash, consumed_at: null, ativa: true }] };
    return { rows: [], rowCount: 1 };
  });
  const result = await consumirAutorizacao({ token: "a".repeat(43), requesterId: 7,
    operation: "GALERIA_ATUALIZAR", entity: "site_galeria", resourceId: 42, context: { titulo: "Atualizado" } });
  expect(result).toMatchObject({ requesterId: 7, authorizerId: 9 });
  expect(registrarLogObrigatorio).toHaveBeenCalledWith(expect.objectContaining({
    acao: "AUTORIZACAO_OPERACAO_CONSUMIDA",
    valorNovo: expect.objectContaining({ solicitante_id: 7, autorizador_id: 9, operacao: "GALERIA_ATUALIZAR" }),
  }), mockClient);
  mockClient.query.mockImplementation(async sql => sql.includes("FROM operation_authorizations")
    ? { rows: [{ id: 1, requester_user_id: 7, authorizer_user_id: 9, operation: "GALERIA_ATUALIZAR",
      entity: "site_galeria", resource_id: "42", context_hash: hash, consumed_at: new Date(), ativa: true }] }
    : { rows: [], rowCount: 0 });
  await expect(consumirAutorizacao({ token: "a".repeat(43), requesterId: 7,
    operation: "GALERIA_ATUALIZAR", entity: "site_galeria", resourceId: 42, context: { titulo: "Atualizado" } }))
    .rejects.toMatchObject({ status: 409 });
});

test("rejeita ticket expirado sem registrar consumo", async () => {
  mockClient.query.mockImplementation(async sql => sql.includes("FROM operation_authorizations")
    ? { rows: [{ id: 2, requester_user_id: 7, authorizer_user_id: 9, operation: "GALERIA_REMOVER",
      entity: "site_galeria", resource_id: "42", context_hash: hashContexto(null), consumed_at: null, ativa: false }] }
    : { rows: [], rowCount: 0 });
  await expect(consumirAutorizacao({ token: "b".repeat(43), requesterId: 7,
    operation: "GALERIA_REMOVER", entity: "site_galeria", resourceId: 42 })).rejects.toMatchObject({ status: 409 });
  expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("UPDATE operation_authorizations"))).toBe(false);
});
