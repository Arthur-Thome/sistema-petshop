jest.mock("../src/database/connection", () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock("../src/services/petPhotoStorage", () => ({
  MAX_BYTES: 5 * 1024 * 1024,
  modoArmazenamento: jest.fn(() => "s3"),
  prepararUploadDireto: jest.fn(() => ({ key: "tmp/pet-photos/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg", url: "https://objects.invalid/put", headers: { "Content-Type": "image/jpeg" } })),
  examinarUploadDireto: jest.fn(),
  promoverUploadDireto: jest.fn(),
  removerUploadDireto: jest.fn(),
  removerFoto: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const pool = require("../src/database/connection");
const storage = require("../src/services/petPhotoStorage");
const { criarUploadDireto, finalizarUploadDireto } = require("../src/controllers/fotoPetController");

function response() {
  const res = { statusCode: 200 };
  res.status = jest.fn((status) => { res.statusCode = status; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

beforeEach(() => {
  process.env.JWT_SECRET = "test-only-secret-long-enough-for-signing-123456";
  process.env.FILE_STORAGE_MODE = "s3";
  pool.query.mockReset().mockResolvedValue({ rows: [{ id: 7 }] });
  storage.prepararUploadDireto.mockClear();
  storage.examinarUploadDireto.mockReset();
});

test("autoriza upload de 5 MB com chave temporaria isolada e token vinculado ao usuario e pet", async () => {
  const res = response();
  await criarUploadDireto({ params: { id: "7" }, body: { mime_type: "image/jpeg", tamanho_bytes: 5 * 1024 * 1024 }, usuario: { id: 12 } }, res);
  expect(res.statusCode).toBe(200);
  const claims = jwt.verify(res.body.uploadToken, process.env.JWT_SECRET);
  expect(claims).toMatchObject({ finalidade: "FOTO_PET_UPLOAD", usuario_id: 12, pet_id: 7, mime_type: "image/jpeg", tamanho_bytes: 5 * 1024 * 1024 });
  expect(claims.chave_temporaria).toMatch(/^tmp\/pet-photos\//);
  expect(res.body.url).toBe("https://objects.invalid/put");
});

test("finalizacao de outro usuario e recusada antes de consultar ou promover o objeto", async () => {
  const uploadToken = jwt.sign({ finalidade: "FOTO_PET_UPLOAD", usuario_id: 12, pet_id: 7 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const res = response();
  await finalizarUploadDireto({ params: { id: "7" }, body: { uploadToken }, usuario: { id: 13 } }, res);
  expect(res.statusCode).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
  expect(storage.promoverUploadDireto).not.toHaveBeenCalled();
});

test("objeto com tamanho diferente do autorizado nao e promovido", async () => {
  const uploadToken = jwt.sign({ finalidade: "FOTO_PET_UPLOAD", usuario_id: 12, pet_id: 7,
    chave_temporaria: "tmp/pet-photos/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
    nome_final: "22222222-2222-4222-8222-222222222222.jpg", mime_type: "image/jpeg", tamanho_bytes: 50 }, process.env.JWT_SECRET, { expiresIn: "5m" });
  storage.examinarUploadDireto.mockResolvedValue({ tamanhoBytes: 51 });
  const res = response();
  await finalizarUploadDireto({ params: { id: "7" }, body: { uploadToken }, usuario: { id: 12 } }, res);
  expect(res.statusCode).toBe(400);
  expect(storage.promoverUploadDireto).not.toHaveBeenCalled();
});
