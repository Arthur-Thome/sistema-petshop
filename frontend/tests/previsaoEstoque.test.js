import assert from "node:assert/strict";
import test from "node:test";

import { preverSaidaEstoque } from "../src/utils/previsaoEstoque.js";

test("calcula a previsão somente quando a saída cabe no saldo", () => {
  assert.deepEqual(preverSaidaEstoque(6, 5), {
    status: "valida",
    saldoDisponivel: 6,
    quantidadeSolicitada: 5,
    saldoPrevisto: 1,
  });
});

test("não apresenta saldo previsto quando a saída excede o saldo disponível", () => {
  assert.deepEqual(preverSaidaEstoque(6, 7), {
    status: "estoque-insuficiente",
    saldoDisponivel: 6,
    quantidadeSolicitada: 7,
    saldoPrevisto: null,
  });
});

test("não calcula previsão para quantidade vazia, fracionada ou não positiva", () => {
  for (const quantidade of ["", 0, -1, 1.5, "abc"]) {
    assert.equal(preverSaidaEstoque(6, quantidade).status, "quantidade-invalida");
    assert.equal(preverSaidaEstoque(6, quantidade).saldoPrevisto, null);
  }
});
