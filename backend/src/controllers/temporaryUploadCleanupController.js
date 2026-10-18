const { limparUploadsTemporarios } = require("../services/temporaryUploadCleanupService");
const { limparArquivosExcluidos } = require("../services/permanentFileDeletionService");

async function executar(req, res) {
  try {
    const resultado = await limparUploadsTemporarios();
    const arquivos = await limparArquivosExcluidos();
    return res.status(200).json({ ...resultado, arquivosExcluidos: arquivos });
  } catch (_) {
    return res.status(503).json({ mensagem: "A limpeza temporária não pôde ser concluída." });
  }
}

module.exports = { executar };
