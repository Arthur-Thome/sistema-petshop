import test from "node:test";
import assert from "node:assert/strict";
import { extrairSolicitacoes, resolverEstadoLista } from "../src/utils/estadoLista.js";

test("fila pública diferencia carregamento, erro, lista vazia e dados", () => {
  assert.equal(resolverEstadoLista({ carregando: true, erro: "", quantidade: 0 }), "carregando");
  assert.equal(resolverEstadoLista({ carregando: false, erro: "falha", quantidade: 0 }), "erro");
  assert.equal(resolverEstadoLista({ carregando: false, erro: "", quantidade: 0 }), "vazio");
  assert.equal(resolverEstadoLista({ carregando: false, erro: "", quantidade: 1 }), "dados");
});

test("fila pública aceita resposta vazia válida e rejeita resposta de formato inesperado", () => {
  assert.deepEqual(extrairSolicitacoes({ solicitacoes: [] }), []);
  assert.deepEqual(extrairSolicitacoes({ solicitacoes: [{ id: 8 }] }), [{ id: 8 }]);
  assert.throws(() => extrairSolicitacoes({}), TypeError);
});
