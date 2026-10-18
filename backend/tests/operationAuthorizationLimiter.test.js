const express = require("express");
const request = require("supertest");
const pool = require("../src/database/connection");
const { authorizationAccountLimiter } = require("../src/middleware/rateLimitMiddleware");

const segredoAnterior = process.env.RATE_LIMIT_HMAC_SECRET;
process.env.RATE_LIMIT_HMAC_SECRET = "segredo-de-teste-hmac-com-comprimento-suficiente";

afterAll(() => {
  if (segredoAnterior === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET;
  else process.env.RATE_LIMIT_HMAC_SECRET = segredoAnterior;
});

beforeEach(() => pool.query.mockReset());

test("limite de tentativas da autorização é compartilhado por conta autorizadora", async () => {
  const contagens = new Map();
  pool.query.mockImplementation(async (_sql, [chave]) => {
    const contagem = (contagens.get(chave) || 0) + 1;
    contagens.set(chave, contagem);
    return { rows: [{ request_count: contagem, expires_at: new Date(Date.now() + 900000), server_now: new Date() }] };
  });
  const app = express();
  app.use(express.json());
  app.post("/autorizar", (req, _res, next) => {
    req.usuario = { id: req.body.solicitante_id };
    next();
  }, authorizationAccountLimiter, (_req, res) => res.sendStatus(204));

  const respostas = [];
  for (let solicitante = 1; solicitante <= 6; solicitante += 1) {
    respostas.push(await request(app).post("/autorizar").send({ solicitante_id: solicitante, autorizador_id: 90 }));
  }
  expect(respostas.map(resposta => resposta.status)).toEqual([204, 204, 204, 204, 204, 429]);
  expect(new Set(pool.query.mock.calls.map(([, valores]) => valores[0])).size).toBe(1);

  const outroAutorizador = await request(app).post("/autorizar").send({ solicitante_id: 7, autorizador_id: 91 });
  expect(outroAutorizador.status).toBe(204);
  expect(pool.query.mock.calls[0][1][0]).not.toBe(pool.query.mock.calls.at(-1)[1][0]);
});
