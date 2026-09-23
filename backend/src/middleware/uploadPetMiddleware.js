const multer = require("multer");
const path = require("path");
const crypto = require("crypto");


// Define onde as fotos dos pets serão armazenadas
// e gera nomes únicos para evitar colisões entre arquivos.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const pastaUploads = path.resolve(
      __dirname,
      "../uploads/pets"
    );

    cb(null, pastaUploads);
  },

  filename: (req, file, cb) => {
    const extensao = path
      .extname(file.originalname)
      .toLowerCase();

    /*
     * O nome original enviado pelo usuário nunca é utilizado
     * como nome físico do arquivo.
     */
    const nomeUnico =
      `${Date.now()}-${crypto.randomUUID()}${extensao}`;

    cb(null, nomeUnico);
  },
});


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

  const extensao = path
    .extname(file.originalname)
    .toLowerCase();

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

  cb(null, true);
}


const uploadPet = multer({
  storage,

  // Uma única foto pode ocupar no máximo 5 MB.
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: filtroArquivo,
});


module.exports = uploadPet;