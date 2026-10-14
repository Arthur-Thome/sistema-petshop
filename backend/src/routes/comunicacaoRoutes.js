const express = require("express");
const autenticar = require("../middleware/authMiddleware");
const { statusWhatsApp, enviarWhatsAppTexto, enviarWhatsAppDocumento } = require("../controllers/comunicacaoController");
const { whatsappBusinessLimiter } = require("../middleware/rateLimitMiddleware");
const multer = require("multer");

const router = express.Router();
router.use(autenticar);
router.get("/whatsapp/status", statusWhatsApp);
router.post("/whatsapp/texto", whatsappBusinessLimiter, enviarWhatsAppTexto);
const receberPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } }).single("documento");
router.post("/whatsapp/documento", whatsappBusinessLimiter, (req, res, next) => {
  receberPdf(req, res, (erro) => {
    if (!erro) return next();
    return res.status(400).json({ mensagem: erro.code === "LIMIT_FILE_SIZE" ? "O PDF deve ter ate 4 MB." : "Nao foi possivel receber o documento." });
  });
}, enviarWhatsAppDocumento);
module.exports = router;
