import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const arquivosComApiConfiguravel = [
  "src/services/api.js",
  "src/public-pages/AgendamentoPublico.jsx",
  "src/public-pages/HomePublica.jsx",
  "src/public-pages/GaleriaPublica.jsx",
  "src/pages/AgendaPublica.jsx",
  "src/utils/useFotoPet.js",
];

test("todas as telas que leem VITE_API_URL aplicam o resolvedor compartilhado", () => {
  for (const arquivo of arquivosComApiConfiguravel) {
    const fonte = readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");
    assert.match(fonte, /resolverBaseApi\(/, `${arquivo} deve resolver a base da API`);
  }
});

test("o exemplo de configuração usa a API relativa, compatível com proxy local e mesma origem", () => {
  const exemplo = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(exemplo, /^VITE_API_URL=\/api\s*$/m);
});
