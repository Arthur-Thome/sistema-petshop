const { Pool } = require("pg");


// Pool mantém conexões reutilizáveis com PostgreSQL.
// As credenciais ficam no .env e nunca devem ser colocadas
// diretamente no código ou enviadas ao GitHub.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

module.exports = pool;