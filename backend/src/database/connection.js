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

// Erros de clientes ociosos do pg Pool precisam de listener próprio. Sem ele,
// uma falha transitória de conexão pode virar exceção não tratada no Node.
pool.on("error", erro => {
  const codigo = typeof erro?.code === "string" && /^[A-Z0-9]{2,10}$/.test(erro.code)
    ? erro.code
    : "DB_POOL_ERROR";
  console.error(JSON.stringify({
    evento: "postgres_idle_client_error",
    codigo,
    horario: new Date().toISOString(),
  }));
});

module.exports = pool;
