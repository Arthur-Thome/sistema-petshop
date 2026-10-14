const pool = require("../src/database/connection");
jest.mock("../src/services/sessaoClientePublicoService", () => ({
  buscarSessaoCliente: jest.fn(),
}));
const sessao = require("../src/services/sessaoClientePublicoService");
const { servirFotoPet } = require("../src/controllers/fotoPetController");

function response() {
  const res = { headers: {}, statusCode: 200 };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  res.set = jest.fn((headers) => { res.headers = headers; return res; });
  res.sendFile = jest.fn((_file, callback) => callback());
  return res;
}

beforeEach(() => {
  pool.query.mockReset();
  sessao.buscarSessaoCliente.mockReset();
});

test("foto privada não é servida sem sessão", async () => {
  const res = response();
  await servirFotoPet({ params: { filename: "foto.jpg" }, headers: {} }, res);
  expect(res.statusCode).toBe(401);
  expect(pool.query).not.toHaveBeenCalled();
});

test("sessão pública só lê foto de pet vinculado ao tutor da sessão", async () => {
  sessao.buscarSessaoCliente.mockResolvedValue({ tutor_id: 42 });
  pool.query.mockResolvedValue({ rows: [] });
  const res = response();
  await servirFotoPet({ params: { filename: "foto.jpg" }, headers: { authorization: "Bearer public-test" } }, res);
  expect(res.statusCode).toBe(404);
  expect(pool.query.mock.calls[0][0]).toContain("pt.tutor_id=$2");
  expect(pool.query.mock.calls[0][1]).toEqual(["/uploads/pets/foto.jpg", 42]);
  expect(res.sendFile).not.toHaveBeenCalled();
});

test("caminho manipulado é recusado antes de acessar o arquivo", async () => {
  const res = response();
  await servirFotoPet({ params: { filename: "..%2fsecret.jpg" }, headers: {} }, res);
  expect(res.statusCode).toBe(404);
  expect(pool.query).not.toHaveBeenCalled();
});
