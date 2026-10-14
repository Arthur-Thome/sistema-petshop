// Testes devem substituir este modulo por um pool simulado ou explicitamente isolado.
if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined) {
  throw new Error("Conexao padrao proibida em testes; use o harness isolado.");
}

const { Pool } = require("pg");
const { criarConfiguracaoPool } = require("./poolConfig");


// Pool mantém conexões reutilizáveis com PostgreSQL.
// As credenciais ficam no .env e nunca devem ser colocadas
// diretamente no código ou enviadas ao GitHub.
const pool = new Pool(criarConfiguracaoPool());

module.exports = pool;
