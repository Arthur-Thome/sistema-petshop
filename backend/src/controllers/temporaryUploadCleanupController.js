const { limparUploadsTemporarios } = require("../services/temporaryUploadCleanupService");

async function executar(req, res) {
  try {
    const resultado = await limparUploadsTemporarios();
    return res.status(200).json(resultado);
  } catch (_) {
    return res.status(503).json({ mensagem: "A limpeza temporária não pôde ser concluída." });
  }
}

module.exports = { executar };
