const fs = require("fs");
const multer = require("multer");
const uploadPet = require("./uploadPetMiddleware");

function apagarFoto(req) {
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
}

function receberPetPublico(req, res, next) {
  uploadPet.single("foto")(req, res, (erro) => {
    if (erro) {
      const mensagem = erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE"
        ? "A imagem deve ter no máximo 5 MB."
        : erro.message || "Não foi possível enviar a imagem.";
      return res.status(400).json({ codigo: "FOTO_INVALIDA", mensagem });
    }

    if (req.file) res.once("finish", () => { if (res.statusCode >= 400) apagarFoto(req); });

    if (req.body?.pet && typeof req.body.pet === "string") {
      try {
        req.body.pet = JSON.parse(req.body.pet);
      } catch (_) {
        apagarFoto(req);
        return res.status(400).json({ codigo: "DADOS_INVALIDOS", mensagem: "Os dados do pet são inválidos." });
      }
    }
    if (req.body?.tutor && typeof req.body.tutor === "string") {
      try {
        req.body.tutor = JSON.parse(req.body.tutor);
      } catch (_) {
        apagarFoto(req);
        return res.status(400).json({ codigo: "DADOS_INVALIDOS", mensagem: "Os dados do tutor são inválidos." });
      }
    }
    next();
  });
}

module.exports = { apagarFoto, receberPetPublico };
