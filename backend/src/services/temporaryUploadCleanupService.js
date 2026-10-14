const poolPadrao = require("../database/connection");
const objectStorage = require("./objectStorageService");

// Duas exclusoes sequenciais com timeout de 8 s deixam margem dentro dos 30 s
// configurados para a funcao Vercel, incluindo consultas e resposta HTTP.
const MAX_LOTE = 2;
const TIMEOUT_EXCLUSAO_MS = 8000;
const KEY_POR_TIPO = {
  PET_PHOTO: /^tmp\/pet-photos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/,
  SITE_GALLERY: /^tmp\/site-gallery\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/,
};

async function limparUploadsTemporarios({ pool = poolPadrao, env = process.env, limite = MAX_LOTE } = {}) {
  if (!Number.isInteger(limite) || limite < 1 || limite > MAX_LOTE) throw new Error("Limite de limpeza invalido.");
  if (String(env.FILE_STORAGE_MODE || "local").toLowerCase() !== "s3") {
    return { examinados: 0, removidos: 0, falhas: 0, ignorados: 0 };
  }
  const resultado = { examinados: 0, removidos: 0, falhas: 0, ignorados: 0 };
  const client = await pool.connect();
  let pendentes;
  try {
    await client.query("BEGIN");
    pendentes = await client.query(`
      WITH selecionados AS (
        SELECT upload_id FROM object_upload_intents
         WHERE cleanup_after <= CURRENT_TIMESTAMP AND finalized_at IS NULL AND cleaned_at IS NULL
           AND cleanup_attempts < 10
           AND (cleanup_claimed_at IS NULL OR cleanup_claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
         ORDER BY cleanup_after, created_at, upload_id
         LIMIT $1 FOR UPDATE SKIP LOCKED
      )
      UPDATE object_upload_intents i
         SET cleanup_claimed_at=clock_timestamp(), cleanup_attempts=cleanup_attempts+1
        FROM selecionados s
       WHERE i.upload_id=s.upload_id
      RETURNING i.upload_id, i.resource_kind, i.object_key, i.cleanup_claimed_at
    `, [limite]);
    resultado.examinados = pendentes.rows.length;
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    client.release();
  }

  for (const item of pendentes.rows) {
      const re = KEY_POR_TIPO[item.resource_kind];
      const bucket = item.resource_kind === "PET_PHOTO" ? env.PET_PHOTO_BUCKET : env.SITE_GALLERY_BUCKET;
      if (!re || !re.test(item.object_key) || !bucket) {
        await pool.query(`UPDATE object_upload_intents SET cleanup_claimed_at=NULL
          WHERE upload_id=$1 AND cleanup_claimed_at=$2 AND finalized_at IS NULL`, [item.upload_id, item.cleanup_claimed_at]);
        resultado.ignorados++;
        continue;
      }
      try {
        // DELETE de chave exata sob tmp/; 404 e tratado como sucesso pelo adapter.
        await objectStorage.remover({ bucket, key: item.object_key, env, timeoutMs: TIMEOUT_EXCLUSAO_MS });
        const atualizado = await pool.query(`UPDATE object_upload_intents
          SET cleaned_at=CURRENT_TIMESTAMP, cleanup_claimed_at=NULL
          WHERE upload_id=$1 AND cleanup_claimed_at=$2 AND finalized_at IS NULL AND cleaned_at IS NULL`,
        [item.upload_id, item.cleanup_claimed_at]);
        if (atualizado.rowCount === 1) resultado.removidos++;
        else resultado.ignorados++;
      } catch (_) {
        await pool.query(`UPDATE object_upload_intents SET cleanup_claimed_at=NULL
          WHERE upload_id=$1 AND cleanup_claimed_at=$2 AND finalized_at IS NULL`, [item.upload_id, item.cleanup_claimed_at]);
        resultado.falhas++;
      }
  }
  return resultado;
}

module.exports = { limparUploadsTemporarios, MAX_LOTE, TIMEOUT_EXCLUSAO_MS, KEY_POR_TIPO };
