const multer = require("multer");
const crypto = require("crypto");


// Define onde as fotos dos pets serão armazenadas
// e gera nomes únicos para evitar colisões entre arquivos.
const storage = multer.memoryStorage();
// No serverless, arquivos de ate 5 MB devem usar upload direto S3; o endpoint
// multipart local aceita o mesmo limite sem reduzir arbitrariamente a foto.
const LIMITE_FOTO_BYTES = 5 * 1024 * 1024;


// Aceita somente os formatos utilizados para fotos de pets.
// MIME type e extensão precisam pertencer às listas permitidas.
function filtroArquivo(
  req,
  file,
  cb
) {
  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const extensoesPermitidas = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ];

  const extensao = `.${String(file.originalname || "").split(".").pop().toLowerCase()}`;

  if (
    !tiposPermitidos.includes(
      file.mimetype
    ) ||
    !extensoesPermitidas.includes(
      extensao
    )
  ) {
    return cb(
      new Error(
        "Formato de imagem não permitido. Utilize JPG, JPEG, PNG ou WEBP."
      )
    );
  }

  file.filename = `${Date.now()}-${crypto.randomUUID()}${extensao}`;

  cb(null, true);
}


const uploadPet = multer({
  storage,

  // Memoria permite escolher o adapter local/S3 antes da persistencia.
  limits: {
    fileSize: LIMITE_FOTO_BYTES,
    files: 1,
  },

  fileFilter: filtroArquivo,
});


uploadPet.LIMITE_FOTO_BYTES = LIMITE_FOTO_BYTES;
module.exports = uploadPet;
