const express = require("express");
const controller = require("../controllers/siteConteudoController");
const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");
const { siteUploadLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();
const adminGerente = permitirPerfis("administrador", "gerente");

router.get("/publico", controller.consultarPublico);
router.get("/imagens/:id", controller.servirImagemPublica);

router.use(autenticar, adminGerente);

router.get("/admin", controller.consultarAdmin);
router.put("/admin/configuracoes", controller.salvarConfiguracoes);
router.post("/admin/premiacoes", controller.criarPremiacao);
router.put("/admin/premiacoes/:id", controller.atualizarPremiacao);
router.delete("/admin/premiacoes/:id", controller.removerPremiacao);
router.post("/admin/galeria", siteUploadLimiter, controller.executarUpload, controller.enviarImagem);
router.post("/admin/galeria/upload-direto", siteUploadLimiter, controller.criarUploadDireto);
router.post("/admin/galeria/finalizar-upload-direto", siteUploadLimiter, controller.finalizarUploadDireto);
router.get("/admin/galeria/:id/imagem", controller.servirImagemAdmin);
router.put("/admin/galeria/:id", controller.atualizarImagem);
router.delete("/admin/galeria/:id", controller.removerImagem);

module.exports = router;
