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

    // O nome enviado pelo usuário não é utilizado como nome
    // físico do arquivo. Isso evita colisões e nomes inseguros.
    const nomeUnico =
      `${Date.now()}-${crypto.randomUUID()}${extensao}`;

    cb(null, nomeUnico);
  },
});


// Somente formatos de imagem utilizados pelo sistema são aceitos.
function filtroArquivo(req, file, cb) {
  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!tiposPermitidos.includes(file.mimetype)) {
    return cb(
      new Error(
        "Formato de imagem não permitido. Utilize JPG, PNG ou WEBP."
      )
    );
  }

  cb(null, true);
}


const uploadPet = multer({
  storage,

  // Limite de 5 MB por foto.
  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: filtroArquivo,
});


module.exports = uploadPet;