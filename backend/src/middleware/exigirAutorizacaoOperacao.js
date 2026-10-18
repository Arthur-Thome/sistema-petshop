const pool = require("../database/connection");
const { consumirAutorizacao } = require("../services/operationAuthorizationService");

function exigirAutorizacaoOperacao({ operation, entity, getResourceId, getContext }) {
  return async function validarAutorizacao(req, res, next) {
    if (["administrador", "super_administrador"].includes(req.usuario?.perfil)) return next();
    const token = req.get("X-Operation-Authorization");
    try {
      const autorizacao = await consumirAutorizacao({
        token,
        requesterId: req.usuario.id,
        operation,
        entity,
        resourceId: getResourceId ? getResourceId(req) : null,
        context: getContext ? getContext(req) : null,
        ip: req.ip,
      }, pool);
      req.autorizacaoOperacao = autorizacao;
      return next();
    } catch (erro) {
      const status = [401, 403, 409].includes(erro.status) ? erro.status : 503;
      if (status === 503) console.error(JSON.stringify({ evento: "operation_authorization_unavailable", requestId: req.requestId || null }));
      return res.status(status).json({ mensagem: status === 503 ? "Não foi possível validar a autorização agora." : erro.message });
    }
  };
}

module.exports = exigirAutorizacaoOperacao;
