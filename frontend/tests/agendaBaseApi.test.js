import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolverBaseApi } from "../src/utils/resolverBaseApi.js";

test("agenda administrativa usa API na origem atual quando build aponta localhost", () => {
  const pastaTeste = path.dirname(fileURLToPath(import.meta.url));
  const pagina = fs.readFileSync(path.join(pastaTeste, "../src/pages/AgendaPublica.jsx"), "utf8");

  assert.match(pagina, /import\s*\{\s*resolverBaseApi\s*\}\s*from\s*["']\.\.\/utils\/resolverBaseApi["']/);
  assert.match(pagina, /resolverBaseApi\(\s*import\.meta\.env\.VITE_API_URL/);
  assert.equal(resolverBaseApi("http://localhost:3001/api", "http://127.0.0.1:3001"), "/api");
});
