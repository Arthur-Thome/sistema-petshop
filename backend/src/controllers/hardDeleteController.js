const { consultar, excluir } = require("../services/hardDeleteService");

async function verificar(req, res) {
  try {
    return res.status(200).json(await consultar(req.params.entidade, req.params.id));
  } catch (erro) {
    const status = [400, 404].includes(erro.status) ? erro.status : 503;
    return res.status(status).json({ mensagem: erro.status ? erro.message : "Não foi possível verificar o registro." });
  }
}

async function executar(req, res) {
  const id = Number(req.params.id);
  const { motivo, confirmacao, confirmacao_irreversivel: confirmada } = req.body || {};
  const fraseEsperada = `EXCLUIR ${id}`;
  if (!Number.isSafeInteger(id) || id < 1 || typeof motivo !== "string" || motivo.trim().length < 10 || motivo.trim().length > 500
    || confirmacao !== fraseEsperada || confirmada !== true) {
    return res.status(400).json({ mensagem: "A confirmação reforçada, o motivo e a declaração de irreversibilidade são obrigatórios." });
  }
  try {
    const resultado = await excluir({
      entityName: req.params.entidade, id, reason: motivo.trim(), phrase: confirmacao,
      confirmed: confirmada, token: req.get("X-Operation-Authorization"), requesterId: req.usuario.id, ip: req.ip,
    });
    return res.status(resultado.arquivoPendente ? 202 : 200).json({
      mensagem: resultado.arquivoPendente
        ? "Registro excluído. A remoção do arquivo está pendente de nova tentativa operacional."
        : "Registro excluído definitivamente.",
      id,
    });
  } catch (erro) {
    const status = [400, 401, 403, 404, 409].includes(erro.status) ? erro.status : 503;
    if (status === 503) console.error(JSON.stringify({ evento: "hard_delete_unavailable", requestId: req.requestId || null }));
    return res.status(status).json({ mensagem: erro.status ? erro.message : "Não foi possível concluir a exclusão." });
  }
}

module.exports = { verificar, executar };
