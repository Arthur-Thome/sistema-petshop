import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchRoutes } from "react-router-dom";

test("rota direta de produto aponta para a ficha e URLs antigas continuam reconhecidas", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const declaration = app.match(/<Route\s+path="(\/produtos\/:id)"\s+element=\{<DetalhesProduto\s*\/>\}/);
  assert.ok(declaration, "App.jsx deve manter a rota /produtos/:id para DetalhesProduto");

  const route = [{ path: declaration[1] }];
  assert.equal(matchRoutes(route, "/produtos/1")?.[0]?.params.id, "1");
  assert.equal(matchRoutes(route, "/produtos/2")?.[0]?.params.id, "2");
});
