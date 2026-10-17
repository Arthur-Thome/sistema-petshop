const path = require("node:path");
const { Client } = require(require.resolve("pg", { paths: [path.resolve(__dirname, "../../backend")] }));

async function main() {
  const expectedDirectory = process.env.HOMOLOGACAO_DATA_DIRECTORY;
  if (process.env.DATABASE_URL || process.env.DB_HOST !== "127.0.0.1" || Number(process.env.DB_PORT) !== 55432
      || process.env.DB_NAME !== "amores_pet_homologacao" || !expectedDirectory || !path.isAbsolute(expectedDirectory)) {
    throw new Error("Destino de banco recusado pela allowlist de homologacao.");
  }
  const client = new Client({ host: process.env.DB_HOST, port: 55432, database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: false, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    const { rows: [row] } = await client.query("SELECT current_database() AS db,current_user AS username,current_setting('port')::int AS port,inet_server_addr()::text AS address,current_setting('server_version_num')::int AS version_num");
    if (row.db !== "amores_pet_homologacao" || row.username !== process.env.DB_USER || row.port !== 55432
        || !["127.0.0.1", "127.0.0.1/32"].includes(row.address) || row.version_num < 170000 || row.version_num >= 180000) {
      throw new Error("Identidade SQL do PostgreSQL nao confere com o banco de homologacao.");
    }
    process.stdout.write(JSON.stringify({ database: row.db, port: row.port, address: row.address,
      dataDirectory: path.resolve(expectedDirectory), majorVersion: Math.floor(row.version_num / 10000) }) + "\n");
  } finally { await client.end().catch(() => {}); }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
