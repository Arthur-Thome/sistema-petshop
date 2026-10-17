import test from "node:test";
import assert from "node:assert/strict";
import { resolverBaseApi } from "../src/utils/resolverBaseApi.js";

test("homologação na porta temporária usa a origem atual mesmo se o build apontar localhost", () => {
  assert.equal(resolverBaseApi("http://localhost:3001/api", "http://127.0.0.1:49333"), "/api");
  assert.equal(resolverBaseApi("http://127.0.0.1:3001/api", "http://127.0.0.1:49333"), "/api");
  assert.equal(resolverBaseApi("http://localhost:3001/api", "http://127.0.0.1:3001"), "/api");
  assert.equal(resolverBaseApi("http://127.0.0.1:3001/api", "http://localhost:3001"), "/api");
});

test("desenvolvimento Vite usa proxy de mesma origem para API local", () => {
  assert.equal(resolverBaseApi("http://localhost:3001/api", "http://localhost:5173"), "/api");
  assert.equal(resolverBaseApi("http://localhost:3001/api", "http://127.0.0.1:5173"), "/api");
});

test("build remoto nao tenta chamar o localhost do navegador", () => {
  assert.equal(resolverBaseApi("http://localhost:3001/api", "https://amorespet.example"), "/api");
  assert.equal(resolverBaseApi("http://127.0.0.1:3001/api", "https://amorespet.example"), "/api");
});

test("deploy remoto preserva a URL configurada e valor ausente usa mesma origem", () => {
  assert.equal(resolverBaseApi("https://api.example.test/api", "https://app.example.test"), "https://api.example.test/api");
  assert.equal(resolverBaseApi(undefined, "http://127.0.0.1:3001"), "/api");
});

test("configuração inválida volta para caminho relativo seguro", () => {
  assert.equal(resolverBaseApi("not a url", "http://127.0.0.1:3001"), "/api");
});
