jest.mock("../src/database/connection", () => ({ query: jest.fn() }));
jest.mock("../src/services/sessaoClientePublicoService", () => ({ buscarSessaoCliente: jest.fn() }));
jest.mock("../src/services/petPhotoStorage", () => ({ lerFoto: jest.fn() }));

const jwt = require("jsonwebtoken");
const pool = require("../src/database/connection");
const storage = require("../src/services/petPhotoStorage");
const { servirFotoPet } = require("../src/controllers/fotoPetController");

function response() {
  const res = { headers: {}, statusCode: 200 };
  res.status = jest.fn((status) => { res.statusCode = status; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  res.set = jest.fn((headers) => { res.headers = headers; return res; });
  res.send = jest.fn((body) => { res.body = body; return res; });
  return res;
}

test("foto PNG inteiramente sintetica passa pela autorizacao privada e e entregue", async () => {
  const secret = "chave-sintetica-teste-foto-privada-d24";
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ id: 17, versaoSessao: 1 }, secret, { algorithm: "HS256" });
  const syntheticPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  pool.query
    .mockResolvedValueOnce({ rows: [{ id: 17, ativo: true, versao_sessao: 1 }] })
    .mockResolvedValueOnce({ rows: [{ id: 501 }] });
  storage.lerFoto.mockResolvedValue(syntheticPng);

  try {
    const res = response();
    await servirFotoPet({
      params: { filename: "foto-sintetica-hml.png" },
      headers: { authorization: `Bearer ${token}` },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
    expect(res.body).toEqual(syntheticPng);
    expect(pool.query.mock.calls[1][0]).toContain("p.foto=$1");
    expect(pool.query.mock.calls[1][1]).toEqual(["/uploads/pets/foto-sintetica-hml.png"]);
    expect(storage.lerFoto).toHaveBeenCalledWith("foto-sintetica-hml.png");
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
