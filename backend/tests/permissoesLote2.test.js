const permitirPerfis = require("../src/middleware/permissaoMiddleware");

function resposta() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

test("Super Administrador herda rotas explicitamente administrativas", () => {
  const next = jest.fn();
  permitirPerfis("administrador")({ usuario: { perfil: "super_administrador" } }, resposta(), next);
  expect(next).toHaveBeenCalledTimes(1);
});

test("Super Administrador não herda autorização reservada a Gerente", () => {
  const res = resposta();
  const next = jest.fn();
  permitirPerfis("gerente")({ usuario: { perfil: "super_administrador" } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test("rotas que aceitam Administrador ou Gerente também aceitam Super Administrador", () => {
  const next = jest.fn();
  permitirPerfis("administrador", "gerente")({ usuario: { perfil: "super_administrador" } }, resposta(), next);
  expect(next).toHaveBeenCalledTimes(1);
});

test("perfil não autenticado continua negado", () => {
  const res = resposta();
  const next = jest.fn();
  permitirPerfis("administrador")({}, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
