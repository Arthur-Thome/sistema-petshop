const pool = require("../database/connection");
const galleryStorage = require("./siteGalleryStorage");

async function processarArquivoExcluido(id) {
  const client = await pool.connect();
  let tarefa;
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT id, resource_kind, object_key
        FROM permanent_file_deletion_queue
       WHERE id=$1 AND completed_at IS NULL
         AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
       FOR UPDATE SKIP LOCKED`, [id]);
    tarefa = result.rows[0];
    if (!tarefa) {
      await client.query("COMMIT");
      return false;
    }
    await client.query(`UPDATE permanent_file_deletion_queue
      SET cleanup_claimed_at=CURRENT_TIMESTAMP, last_attempt_at=CURRENT_TIMESTAMP,
          attempts=attempts+1, last_error_code=NULL
      WHERE id=$1`, [id]);
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    client.release();
  }

  try {
    if (tarefa.resource_kind !== "SITE_GALLERY") throw new Error("RESOURCE_KIND_INVALID");
    await galleryStorage.removerImagem(tarefa.object_key);
    await pool.query(`UPDATE permanent_file_deletion_queue
      SET completed_at=CURRENT_TIMESTAMP, cleanup_claimed_at=NULL, last_error_code=NULL
      WHERE id=$1 AND completed_at IS NULL`, [id]);
    return true;
  } catch (erro) {
    const code = typeof erro?.code === "string" && /^[A-Z0-9_]{2,40}$/.test(erro.code) ? erro.code : "STORAGE_ERROR";
    await pool.query(`UPDATE permanent_file_deletion_queue
      SET cleanup_claimed_at=NULL, last_error_code=$2
      WHERE id=$1 AND completed_at IS NULL`, [id, code]);
    return false;
  }
}

async function limparArquivosExcluidos(limite = 25) {
  const result = await pool.query(`SELECT id FROM permanent_file_deletion_queue
    WHERE completed_at IS NULL
      AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    ORDER BY created_at, id LIMIT $1`, [limite]);
  let concluidas = 0;
  for (const row of result.rows) if (await processarArquivoExcluido(row.id)) concluidas += 1;
  return { examinadas: result.rows.length, concluidas };
}

module.exports = { processarArquivoExcluido, limparArquivosExcluidos };
