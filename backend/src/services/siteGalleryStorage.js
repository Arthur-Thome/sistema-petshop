const crypto = require("crypto");
const path = require("path");
const objectStorage = require("./objectStorageService");

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 12000;
const MAX_PIXELS = 80000000;
const REPO_ROOT = path.resolve(__dirname, "../../..");
const STORAGE_ROOT = path.resolve(
  process.env.SITE_GALLERY_STORAGE_DIR || path.join(__dirname, "../../storage/site-gallery")
);
const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function estaDentro(diretorio, destino) {
  const relativo = path.relative(diretorio, destino);
  return relativo === "" || (!relativo.startsWith(`..${path.sep}`) && relativo !== ".." && !path.isAbsolute(relativo));
}

function validarRaizArmazenamento(raiz) {
  const proibidos = [
    path.join(REPO_ROOT, "backend", "src", "uploads"),
    path.join(REPO_ROOT, "frontend", "public"),
    path.join(REPO_ROOT, "frontend", "dist"),
  ].map((diretorio) => path.resolve(diretorio));
  const destino = path.resolve(raiz);
  if (proibidos.some((diretorio) => estaDentro(diretorio, destino))) {
    throw new Error("O armazenamento da galeria deve ficar fora de diretórios públicos e uploads privados.");
  }
  return destino;
}

validarRaizArmazenamento(STORAGE_ROOT);

function dimensoesValidas(largura, altura) {
  return Number.isInteger(largura) && Number.isInteger(altura) && largura > 0 && altura > 0 &&
    largura <= MAX_DIMENSION && altura <= MAX_DIMENSION && largura * altura <= MAX_PIXELS;
}

function validarPng(buffer) {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(assinatura)) return false;
  let offset = 8;
  let viuHeader = false;
  let viuDados = false;
  while (offset + 12 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(offset);
    const nome = buffer.toString("ascii", offset + 4, offset + 8);
    const fim = offset + 12 + tamanho;
    if (fim > buffer.length || !/^[A-Za-z]{4}$/.test(nome)) return false;
    if (!viuHeader) {
      if (nome !== "IHDR" || tamanho !== 13) return false;
      viuHeader = true;
      if (!dimensoesValidas(buffer.readUInt32BE(offset + 8), buffer.readUInt32BE(offset + 12))) return false;
    } else if (nome === "IHDR") return false;
    if (nome === "IDAT") viuDados = true;
    if (nome === "IEND") return tamanho === 0 && fim === buffer.length && viuDados;
    offset = fim;
  }
  return false;
}

function validarJpeg(buffer) {
  if (buffer.length < 12 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) return false;
  const marcadoresSof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let encontrouQuadro = false;
  while (offset < buffer.length - 2) {
    if (buffer[offset++] !== 0xff) return false;
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) return false;
    const marcador = buffer[offset++];
    if (marcador === 0xd9 || marcador === 0xda) break;
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return false;
    const tamanho = buffer.readUInt16BE(offset);
    if (tamanho < 2 || offset + tamanho > buffer.length) return false;
    if (marcadoresSof.has(marcador)) {
      if (tamanho < 8) return false;
      const altura = buffer.readUInt16BE(offset + 3);
      const largura = buffer.readUInt16BE(offset + 5);
      if (!dimensoesValidas(largura, altura)) return false;
      encontrouQuadro = true;
    }
    offset += tamanho;
  }
  return encontrouQuadro;
}

function validarWebp(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WEBP" || buffer.readUInt32LE(4) + 8 !== buffer.length) return false;
  let offset = 12;
  let larguraImagem;
  let alturaImagem;
  let encontrouDados = false;
  while (offset + 8 <= buffer.length) {
    const tipo = buffer.toString("ascii", offset, offset + 4);
    const tamanho = buffer.readUInt32LE(offset + 4);
    const inicio = offset + 8;
    const fim = inicio + tamanho + (tamanho % 2);
    if (fim > buffer.length) return false;
    if (tipo === "VP8X" && tamanho >= 10) {
      larguraImagem = 1 + buffer.readUIntLE(inicio + 4, 3);
      alturaImagem = 1 + buffer.readUIntLE(inicio + 7, 3);
    } else if (tipo === "VP8 " && tamanho >= 10 && buffer[inicio + 3] === 0x9d && buffer[inicio + 4] === 0x01 && buffer[inicio + 5] === 0x2a) {
      larguraImagem = buffer.readUInt16LE(inicio + 6) & 0x3fff;
      alturaImagem = buffer.readUInt16LE(inicio + 8) & 0x3fff;
      encontrouDados = true;
    } else if (tipo === "VP8L" && tamanho >= 5 && buffer[inicio] === 0x2f) {
      larguraImagem = 1 + buffer[inicio + 1] + ((buffer[inicio + 2] & 0x3f) << 8);
      alturaImagem = 1 + (buffer[inicio + 2] >> 6) + (buffer[inicio + 3] << 2) + ((buffer[inicio + 4] & 0x0f) << 10);
      encontrouDados = true;
    } else if (tipo === "ANMF" && tamanho >= 16) {
      encontrouDados = true;
    }
    offset = fim;
  }
  return offset === buffer.length && encontrouDados && dimensoesValidas(larguraImagem, alturaImagem);
}

function detectarMimeImagem(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_BYTES) return null;
  if (validarJpeg(buffer)) return "image/jpeg";
  if (validarPng(buffer)) return "image/png";
  if (validarWebp(buffer)) return "image/webp";
  return null;
}

async function salvarImagem(buffer, mimeType, nomeFinal) {
  if (!EXTENSIONS[mimeType] || detectarMimeImagem(buffer) !== mimeType || buffer.length < 1 || buffer.length > MAX_BYTES) {
    throw new Error("Imagem invalida.");
  }
  const arquivoNome = nomeFinal || `${crypto.randomUUID()}${EXTENSIONS[mimeType]}`;
  if (!new RegExp(`^[a-f0-9-]{36}\\${EXTENSIONS[mimeType]}$`).test(arquivoNome)) throw new Error("Identificador de imagem invalido.");
  const caminho = path.join(STORAGE_ROOT, arquivoNome);
  await objectStorage.gravar({ bucket: process.env.SITE_GALLERY_BUCKET, key: arquivoNome, buffer, contentType: mimeType, localPath: caminho });
  return { arquivoNome, caminho, tamanhoBytes: buffer.length };
}

async function lerImagem(arquivoNome) {
  const caminho = resolverCaminho(arquivoNome);
  if (!caminho) return null;
  return objectStorage.ler({ bucket: process.env.SITE_GALLERY_BUCKET, key: arquivoNome, localPath: caminho });
}

function resolverCaminho(arquivoNome) {
  if (typeof arquivoNome !== "string" || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(arquivoNome)) return null;
  const caminho = path.resolve(STORAGE_ROOT, arquivoNome);
  if (!caminho.startsWith(`${STORAGE_ROOT}${path.sep}`)) return null;
  return caminho;
}

function prepararUploadDireto(uploadId, arquivoNome, mimeType) {
  if (objectStorage.modoArmazenamento() !== "s3") return null;
  if (process.env.S3_TEMP_UPLOAD_CLEANUP_CONFIRMED !== "true") {
    const erro = new Error("O coletor de uploads temporarios S3 ainda nao foi validado."); erro.code = "LIMPEZA_TEMPORARIA_NAO_CONFIRMADA"; throw erro;
  }
  const caminho = resolverCaminho(arquivoNome);
  if (!/^[a-f0-9-]{36}$/.test(uploadId) || !caminho || !EXTENSIONS[mimeType]) throw new Error("Upload de imagem invalido.");
  const key = `tmp/site-gallery/${uploadId}/${arquivoNome}`;
  return {
    key,
    url: objectStorage.presignPut({ bucket: process.env.SITE_GALLERY_BUCKET, key, contentType: mimeType, expiresSeconds: 300 }),
    headers: { "Content-Type": mimeType },
  };
}

async function examinarUploadDireto(key) {
  if (objectStorage.modoArmazenamento() !== "s3") return null;
  if (typeof key !== "string" || !/^tmp\/site-gallery\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return null;
  return objectStorage.examinarObjeto({ bucket: process.env.SITE_GALLERY_BUCKET, key });
}

async function lerUploadDireto(key) {
  if (typeof key !== "string" || !/^tmp\/site-gallery\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return null;
  return objectStorage.ler({ bucket: process.env.SITE_GALLERY_BUCKET, key });
}

async function removerUploadDireto(key) {
  if (typeof key !== "string" || !/^tmp\/site-gallery\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return false;
  return objectStorage.remover({ bucket: process.env.SITE_GALLERY_BUCKET, key });
}

async function removerImagem(arquivoNome) {
  const caminho = resolverCaminho(arquivoNome);
  if (!caminho) return false;
  return objectStorage.remover({ bucket: process.env.SITE_GALLERY_BUCKET, key: arquivoNome, localPath: caminho });
}

module.exports = { MAX_BYTES, MAX_DIMENSION, MAX_PIXELS, STORAGE_ROOT, detectarMimeImagem, validarRaizArmazenamento, salvarImagem, lerImagem, resolverCaminho, prepararUploadDireto, examinarUploadDireto, lerUploadDireto, removerUploadDireto, removerImagem };
