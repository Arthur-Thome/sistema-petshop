jest.mock("../src/services/objectStorageService", () => ({ remover: jest.fn() }));
const objectStorage = require("../src/services/objectStorageService");
const { limparUploadsTemporarios, MAX_LOTE } = require("../src/services/temporaryUploadCleanupService");
const cronSecret = require("../src/middleware/cronSecretMiddleware");
const express = require("express");
const request = require("supertest");

const tempPet = "tmp/pet-photos/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";
const tempGallery = "tmp/site-gallery/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webp";

function fakePool(rows) {
  const client = { query: jest.fn(async sql => sql.trimStart().startsWith("SELECT upload_id") ? { rows } : { rows: [], rowCount: 1 }), release: jest.fn() };
  client.query.mockImplementation(async sql => sql.includes("RETURNING i.upload_id") ? { rows } : { rows: [], rowCount: 1 });
  return { client, connect: jest.fn(async () => client), query: jest.fn(async () => ({ rows: [], rowCount: 1 })) };
}

beforeEach(() => { objectStorage.remover.mockReset().mockResolvedValue(true); });

test("coletor remove apenas intents vencidos temporarios, com lote limitado e lock concorrente", async () => {
  const claimedAt = "2026-10-14T12:00:00.000Z";
  const pool = fakePool([
    { upload_id: "a", resource_kind: "PET_PHOTO", object_key: tempPet, cleanup_claimed_at: claimedAt },
    { upload_id: "b", resource_kind: "SITE_GALLERY", object_key: tempGallery, cleanup_claimed_at: claimedAt },
  ]);
  const result = await limparUploadsTemporarios({ pool, env: { FILE_STORAGE_MODE: "s3", PET_PHOTO_BUCKET: "pets-private", SITE_GALLERY_BUCKET: "gallery-private" } });
  expect(result).toEqual({ examinados: 2, removidos: 2, falhas: 0, ignorados: 0 });
  expect(pool.client.query.mock.calls[1][0]).toMatch(/cleanup_after <= CURRENT_TIMESTAMP/);
  expect(pool.client.query.mock.calls[1][0]).toMatch(/finalized_at IS NULL AND cleaned_at IS NULL/);
  expect(pool.client.query.mock.calls[1][0]).toMatch(/SKIP LOCKED/);
  expect(pool.client.query.mock.calls[1][0]).toMatch(/cleanup_claimed_at IS NULL OR cleanup_claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'/);
  expect(pool.client.query.mock.calls[1][0]).toMatch(/cleanup_claimed_at=clock_timestamp\(\)/);
  expect(pool.client.query.mock.calls[1][0]).toMatch(/cleanup_attempts=cleanup_attempts\+1/);
  expect(pool.client.query.mock.calls[1][1]).toEqual([MAX_LOTE]);
  expect(objectStorage.remover).toHaveBeenNthCalledWith(1, expect.objectContaining({ bucket: "pets-private", key: tempPet, timeoutMs: 8000 }));
  expect(objectStorage.remover).toHaveBeenNthCalledWith(2, expect.objectContaining({ bucket: "gallery-private", key: tempGallery, timeoutMs: 8000 }));
  expect(pool.query.mock.calls.some(([sql]) => /cleaned_at=CURRENT_TIMESTAMP/.test(sql))).toBe(true);
  expect(pool.query.mock.calls.some(([sql, params]) => /cleanup_claimed_at=\$2/.test(sql) && params[1] === claimedAt)).toBe(true);
  expect(pool.client.query.mock.calls.some(([sql]) => /ROLLBACK/.test(sql))).toBe(false);
});

test("chaves invalidas nunca chegam ao S3 e falhas incrementam tentativas para repeticao limitada", async () => {
  const pool = fakePool([
    { upload_id: "bad", resource_kind: "PET_PHOTO", object_key: "pets/arquivo-real.jpg" },
    { upload_id: "retry", resource_kind: "SITE_GALLERY", object_key: tempGallery },
  ]);
  objectStorage.remover.mockRejectedValueOnce(new Error("erro remoto sensivel"));
  const result = await limparUploadsTemporarios({ pool, env: { FILE_STORAGE_MODE: "s3", PET_PHOTO_BUCKET: "pets-private", SITE_GALLERY_BUCKET: "gallery-private" } });
  expect(result).toEqual({ examinados: 2, removidos: 0, falhas: 1, ignorados: 1 });
  expect(objectStorage.remover).toHaveBeenCalledTimes(1);
  expect(objectStorage.remover).toHaveBeenCalledWith(expect.objectContaining({ key: tempGallery }));
  expect(pool.client.query.mock.calls[1][0]).toMatch(/cleanup_attempts=cleanup_attempts\+1/);
  expect(pool.client.query).toHaveBeenLastCalledWith("COMMIT");
  expect(pool.query).toHaveBeenCalledTimes(2);
});

test("modo local nao percorre nem apaga objetos", async () => {
  const pool = fakePool([]);
  expect(await limparUploadsTemporarios({ pool, env: { FILE_STORAGE_MODE: "local" } })).toEqual({ examinados: 0, removidos: 0, falhas: 0, ignorados: 0 });
  expect(pool.connect).not.toHaveBeenCalled();
  expect(objectStorage.remover).not.toHaveBeenCalled();
});

test("intents ativos ou finalizados ficam fora da consulta de limpeza", async () => {
  const pool = fakePool([]);
  expect(await limparUploadsTemporarios({ pool, env: { FILE_STORAGE_MODE: "s3", PET_PHOTO_BUCKET: "pets", SITE_GALLERY_BUCKET: "gallery" } }))
    .toEqual({ examinados: 0, removidos: 0, falhas: 0, ignorados: 0 });
  const sql = pool.client.query.mock.calls.find(([statement]) => statement.includes("RETURNING i.upload_id"))[0];
  expect(sql).toContain("cleanup_after <= CURRENT_TIMESTAMP");
  expect(sql).toContain("finalized_at IS NULL AND cleaned_at IS NULL");
  expect(sql).toContain("cleanup_attempts < 10");
  expect(sql).toContain("cleanup_claimed_at IS NULL OR cleanup_claimed_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'");
  expect(objectStorage.remover).not.toHaveBeenCalled();
});

test("chaves permanentes de pet ou galeria nunca são enviadas para remoção", async () => {
  const pool = fakePool([
    { upload_id: "pet-final", resource_kind: "PET_PHOTO", object_key: "pets/foto-definitiva.jpg" },
    { upload_id: "gallery-final", resource_kind: "SITE_GALLERY", object_key: "site-gallery/foto-publicada.webp" },
  ]);
  const result = await limparUploadsTemporarios({
    pool,
    env: { FILE_STORAGE_MODE: "s3", PET_PHOTO_BUCKET: "pets-private", SITE_GALLERY_BUCKET: "gallery-private" },
  });
  expect(result).toEqual({ examinados: 2, removidos: 0, falhas: 0, ignorados: 2 });
  expect(objectStorage.remover).not.toHaveBeenCalled();
  expect(pool.query).toHaveBeenCalledTimes(2);
  for (const [sql] of pool.query.mock.calls) expect(sql).toContain("cleanup_claimed_at=NULL");
});

test("lote não pode exceder o máximo e a validação ocorre antes de obter conexão", async () => {
  const pool = fakePool([]);
  await expect(limparUploadsTemporarios({
    pool,
    env: { FILE_STORAGE_MODE: "s3" },
    limite: MAX_LOTE + 1,
  })).rejects.toThrow("Limite de limpeza invalido");
  expect(pool.connect).not.toHaveBeenCalled();
});

test("endpoint manual/cron exige segredo forte em comparacao constante", async () => {
  process.env.CRON_SECRET = "segredo-cron-ficticio-com-mais-de-32-bytes";
  const app = express();
  app.get("/cleanup", cronSecret, (_req, res) => res.status(204).end());
  expect((await request(app).get("/cleanup")).status).toBe(401);
  expect((await request(app).get("/cleanup").set("Authorization", "Bearer errado" )).status).toBe(401);
  expect((await request(app).get("/cleanup").set("Authorization", `Bearer ${process.env.CRON_SECRET}`)).status).toBe(204);
  delete process.env.CRON_SECRET;
});

test("a rota Express real aceita o método GET do Vercel Cron e falha fechada sem validar o segredo", async () => {
  const anterior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "segredo-cron-ficticio-com-mais-de-32-bytes";
  try {
    const app = require("../app");
    const response = await request(app)
      .get("/api/maintenance/temporary-upload-cleanup")
      .set("Authorization", "Bearer token-incorreto");
    expect(response.status).toBe(401);
  } finally {
    if (anterior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = anterior;
  }
});
