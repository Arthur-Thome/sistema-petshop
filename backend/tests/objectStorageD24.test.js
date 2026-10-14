const storage = require("../src/services/objectStorageService");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const env = {
  FILE_STORAGE_MODE: "s3",
  AWS_ENDPOINT_URL_S3: "https://objects.example.test",
  AWS_REGION: "us-east-2",
  AWS_ACCESS_KEY_ID: "fake-key",
  AWS_SECRET_ACCESS_KEY: "fake-secret-for-tests",
};

test("modo local e S3 sao explicitos; S3 sem credenciais falha fechado", () => {
  expect(storage.modoArmazenamento({})).toBe("local");
  expect(() => storage.configuracaoS3({})).toThrow("nao configurado");
  expect(storage.urlObjeto(storage.configuracaoS3(env), "amores-pets", "pet.jpg").toString()).toBe("https://objects.example.test/amores-pets/pet.jpg");
});

test("S3 assina operacao com SigV4 sem registrar chave secreta no cabecalho", () => {
  const config = storage.configuracaoS3(env);
  const url = storage.urlObjeto(config, "galeria-amores", "uuid.webp");
  const headers = storage.headersAssinados(config, "PUT", url, Buffer.from("bytes"), "image/webp", new Date("2026-01-02T03:04:05.000Z"));
  expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=fake-key\//);
  expect(headers.Authorization).not.toContain(env.AWS_SECRET_ACCESS_KEY);
  expect(headers["x-amz-content-sha256"]).toHaveLength(64);
});

test("URL de upload direto e escopada a objeto, tipo e validade curta", () => {
  const presigned = new URL(storage.presignPut({
    bucket: "site-galeria",
    key: "d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1.jpg",
    contentType: "image/jpeg",
    expiresSeconds: 300,
    env,
    now: new Date("2026-10-14T12:00:00.000Z"),
  }));
  expect(presigned.pathname).toContain("site-galeria/d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1.jpg");
  expect(presigned.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(presigned.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
  expect(presigned.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  expect(() => storage.presignPut({ bucket: "site-galeria", key: "a.jpg", contentType: "image/jpeg", expiresSeconds: 900, env })).toThrow("Validade de upload invalida");
});

test("foto privada S3 usa prefixo temporario exclusivo e suporta 5 MB", () => {
  const anterior = { ...process.env };
  Object.assign(process.env, { FILE_STORAGE_MODE: "s3", AWS_ENDPOINT_URL_S3: env.AWS_ENDPOINT_URL_S3,
    AWS_REGION: env.AWS_REGION, AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY, PET_PHOTO_BUCKET: "pet-photos-private",
    S3_TEMP_UPLOAD_CLEANUP_CONFIRMED: "true" });
  try {
    const fotos = require("../src/services/petPhotoStorage");
    const upload = fotos.prepararUploadDireto("d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1", "a99d1b3b-933c-4b51-b73b-a940f4cc5b11.jpg", "image/jpeg");
    expect(upload.key).toMatch(/^tmp\/pet-photos\/d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1\//);
    expect(new URL(upload.url).pathname).toContain("tmp/pet-photos/");
    expect(fotos.MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(() => fotos.prepararUploadDireto("../bad", "a99d1b3b-933c-4b51-b73b-a940f4cc5b11.jpg", "image/jpeg")).toThrow("invalido");
    process.env.S3_TEMP_UPLOAD_CLEANUP_CONFIRMED = "false";
    expect(() => fotos.prepararUploadDireto("d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1", "a99d1b3b-933c-4b51-b73b-a940f4cc5b11.jpg", "image/jpeg"))
      .toThrow("O coletor de uploads temporarios S3 ainda nao foi validado");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in anterior)) delete process.env[key];
    for (const [key, value] of Object.entries(anterior)) process.env[key] = value;
  }
});

test("galeria usa prefixo temporario proprio e chave permanente separada", () => {
  const anterior = { ...process.env };
  Object.assign(process.env, { FILE_STORAGE_MODE: "s3", AWS_ENDPOINT_URL_S3: env.AWS_ENDPOINT_URL_S3,
    AWS_REGION: env.AWS_REGION, AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY, SITE_GALLERY_BUCKET: "site-gallery",
    S3_TEMP_UPLOAD_CLEANUP_CONFIRMED: "true" });
  try {
    const galeria = require("../src/services/siteGalleryStorage");
    const upload = galeria.prepararUploadDireto("d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1", "a99d1b3b-933c-4b51-b73b-a940f4cc5b11.jpg", "image/jpeg");
    expect(upload.key).toMatch(/^tmp\/site-gallery\/d5d1a6bd-2a7d-4e8b-9f09-4569c1a4c5c1\//);
    expect(galeria.resolverCaminho("a99d1b3b-933c-4b51-b73b-a940f4cc5b11.jpg")).not.toBeNull();
    expect(galeria.resolverCaminho(upload.key)).toBeNull();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in anterior)) delete process.env[key];
    for (const [key, value] of Object.entries(anterior)) process.env[key] = value;
  }
});

test("namespace seguro rejeita traversal e nao acessa rede em falha de configuracao", async () => {
  expect(() => storage.urlObjeto(storage.configuracaoS3(env), "amores-pets", "../galeria/foto.jpg")).toThrow("invalido");
  const fetch = jest.fn();
  await expect(storage.requisitarS3({ method: "GET", bucket: "amores-pets", key: "foto.jpg", env: {} })).rejects.toThrow("nao configurado");
  expect(fetch).not.toHaveBeenCalled();
});

test("filesystem da Function nao aceita escrita local efemera", async () => {
  await expect(storage.gravar({ bucket: "amores-pets", key: "foto.jpg", buffer: Buffer.from("x"), contentType: "image/jpeg", localPath: "C:/nao-usar.jpg", env: { FILE_STORAGE_MODE: "local", VERCEL: "1" } }))
    .rejects.toMatchObject({ code: "ARMAZENAMENTO_LOCAL_EPHEMERO" });
});

test("adapter local grava e le em diretorio temporario exclusivo", async () => {
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), "amores-storage-d24-"));
  const localPath = path.join(diretorio, "objects", "foto.jpg");
  try {
    await storage.gravar({ key: "foto.jpg", buffer: Buffer.from("fake-image"), contentType: "image/jpeg", localPath, env: { FILE_STORAGE_MODE: "local" } });
    expect((await storage.ler({ key: "foto.jpg", localPath, env: { FILE_STORAGE_MODE: "local" } })).toString()).toBe("fake-image");
    await storage.remover({ key: "foto.jpg", localPath, env: { FILE_STORAGE_MODE: "local" } });
    await expect(fs.access(localPath)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await fs.rm(diretorio, { recursive: true, force: true });
  }
});

test("S3 transfere objetos usando transporte injetavel", async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("photo").buffer });
  const bytes = await storage.requisitarS3({ method: "GET", bucket: "amores-pets", key: "foto.jpg", env, fetch });
  expect(bytes).toBeInstanceOf(Buffer);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].headers.Authorization).toMatch(/^AWS4-HMAC-SHA256/);
});

test("S3 aceita timeout cancelavel para operacoes agendadas", async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true });
  await storage.requisitarS3({ method: "DELETE", bucket: "amores-pets", key: "tmp/foto.jpg", env, fetch, timeoutMs: 8000 });
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  await expect(storage.requisitarS3({ method: "DELETE", bucket: "amores-pets", key: "tmp/foto.jpg", env, fetch, timeoutMs: 30001 }))
    .rejects.toThrow();
});
