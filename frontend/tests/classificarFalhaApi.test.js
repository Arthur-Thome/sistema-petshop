import test from "node:test";
import assert from "node:assert/strict";
import { classificarFalhaApi } from "../src/utils/classificarFalhaApi.js";

test("somente 401 e 403 são classificados como sessão inválida", () => {
  assert.equal(classificarFalhaApi({ response: { status: 401 } }), "sessao-invalida");
  assert.equal(classificarFalhaApi({ response: { status: 403 } }), "sessao-invalida");
  assert.equal(classificarFalhaApi({ response: { status: 500 } }), "api-indisponivel");
  assert.equal(classificarFalhaApi({ response: { status: 503 } }), "api-indisponivel");
  assert.equal(classificarFalhaApi(new Error("network")), "api-indisponivel");
});
