const express = require("express");
const controller = require("../controllers/siteConteudoController");
const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");
const { siteUploadLimiter } = require("../middleware/rateLimitMiddleware");
const exigirAutorizacaoOperacao = require("../middleware/exigirAutorizacaoOperacao");
const crypto = require("node:crypto");

const router = express.Router();
const equipeInterna = permitirPerfis("administrador", "gerente", "funcionario");
const administracaoSite = permitirPerfis("administrador");
const contextoUpload = req => ({
  ...req.body,
  content_sha256: req.file?.buffer
    ? crypto.createHash("sha256").update(req.file.buffer).digest("hex")
    : null,
});

router.get("/publico", controller.consultarPublico);
router.get("/imagens/:id", controller.servirImagemPublica);

router.use(autenticar);

router.get("/admin", administracaoSite, controller.consultarAdmin);
router.put("/admin/configuracoes", administracaoSite, controller.salvarConfiguracoes);
router.post("/admin/premiacoes", administracaoSite, controller.criarPremiacao);
router.put("/admin/premiacoes/:id", administracaoSite, controller.atualizarPremiacao);
router.delete("/admin/premiacoes/:id", administracaoSite, controller.removerPremiacao);
router.get("/admin/galeria", equipeInterna, controller.consultarGaleriaAdmin);
router.get("/admin/galeria/:id/imagem", equipeInterna, controller.servirImagemAdmin);
router.post("/admin/galeria", equipeInterna, siteUploadLimiter, controller.executarUpload,
  exigirAutorizacaoOperacao({ operation: "GALERIA_CRIAR", entity: "site_galeria", getContext: contextoUpload }), controller.enviarImagem);
router.post("/admin/galeria/upload-direto", equipeInterna, siteUploadLimiter, controller.criarUploadDireto);
router.post("/admin/galeria/finalizar-upload-direto", equipeInterna, siteUploadLimiter, controller.finalizarUploadDireto);
router.put("/admin/galeria/:id", equipeInterna,
  exigirAutorizacaoOperacao({ operation: "GALERIA_ATUALIZAR", entity: "site_galeria", getResourceId: req => req.params.id, getContext: req => req.body }), controller.atualizarImagem);
router.delete("/admin/galeria/:id", equipeInterna,
  exigirAutorizacaoOperacao({ operation: "GALERIA_REMOVER", entity: "site_galeria", getResourceId: req => req.params.id }), controller.removerImagem);

module.exports = router;
