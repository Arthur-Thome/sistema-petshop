const path = require("path");
const objectStorage = require("./objectStorageService");
const gallery = require("./siteGalleryStorage");

const DIRETORIO_LOCAL = path.resolve(__dirname, "../uploads/pets");
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function validarNome(nome) {
  if (typeof nome !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(nome) || nome.includes("..")) {
    throw new Error("Nome de foto invalido.");
  }
  return nome;
}

async function salvarFoto(buffer, mimeType, nome) {
  const arquivo = validarNome(nome);
  if (gallery.detectarMimeImagem(buffer) !== mimeType || buffer.length > 5 * 1024 * 1024) {
    throw new Error("A foto nao corresponde a uma imagem permitida.");
  }
  return objectStorage.gravar({
    bucket: process.env.PET_PHOTO_BUCKET,
    key: arquivo,
    buffer,
    contentType: mimeType,
    localPath: path.join(DIRETORIO_LOCAL, arquivo),
  });
}

async function lerFoto(nome) {
  const arquivo = validarNome(nome);
  return objectStorage.ler({ bucket: process.env.PET_PHOTO_BUCKET, key: arquivo, localPath: path.join(DIRETORIO_LOCAL, arquivo) });
}

async function removerFoto(nome) {
  const arquivo = validarNome(nome);
  return objectStorage.remover({ bucket: process.env.PET_PHOTO_BUCKET, key: arquivo, localPath: path.join(DIRETORIO_LOCAL, arquivo) });
}

function prepararUploadDireto(uploadId, nomeFinal, mimeType) {
  if (objectStorage.modoArmazenamento() !== "s3") return null;
  if (process.env.S3_TEMP_UPLOAD_CLEANUP_CONFIRMED !== "true") {
    const erro = new Error("O coletor de uploads temporarios S3 ainda nao foi validado."); erro.code = "LIMPEZA_TEMPORARIA_NAO_CONFIRMADA"; throw erro;
  }
  if (!/^[a-f0-9-]{36}$/.test(uploadId) || !EXTENSIONS[mimeType] || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(nomeFinal)) {
    throw new Error("Upload de foto invalido.");
  }
  const key = `tmp/pet-photos/${uploadId}/${nomeFinal}`;
  return {
    key,
    url: objectStorage.presignPut({ bucket: process.env.PET_PHOTO_BUCKET, key, contentType: mimeType, expiresSeconds: 300 }),
    headers: { "Content-Type": mimeType },
  };
}

async function examinarUploadDireto(key) {
  if (typeof key !== "string" || !/^tmp\/pet-photos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return null;
  return objectStorage.examinarObjeto({ bucket: process.env.PET_PHOTO_BUCKET, key });
}

async function promoverUploadDireto(key, nomeFinal, mimeType, bytes) {
  const buffer = await objectStorage.ler({ bucket: process.env.PET_PHOTO_BUCKET, key });
  if (buffer.length !== bytes || buffer.length > MAX_BYTES || gallery.detectarMimeImagem(buffer) !== mimeType) throw new Error("A foto nao corresponde ao tipo ou tamanho autorizado.");
  await objectStorage.gravar({ bucket: process.env.PET_PHOTO_BUCKET, key: nomeFinal, buffer, contentType: mimeType, localPath: path.join(DIRETORIO_LOCAL, nomeFinal) });
  return buffer;
}

async function removerUploadDireto(key) {
  if (typeof key !== "string" || !/^tmp\/pet-photos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return false;
  return objectStorage.remover({ bucket: process.env.PET_PHOTO_BUCKET, key });
}

module.exports = { DIRETORIO_LOCAL, MAX_BYTES, validarNome, salvarFoto, lerFoto, removerFoto, modoArmazenamento: objectStorage.modoArmazenamento, prepararUploadDireto, examinarUploadDireto, promoverUploadDireto, removerUploadDireto };
