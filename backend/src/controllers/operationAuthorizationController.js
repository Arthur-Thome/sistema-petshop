const { emitirAutorizacao } = require("../services/operationAuthorizationService");
const pool = require("../database/connection");

async function listarAutorizadores(req, res) {
  if (!["gerente", "funcionario"].includes(req.usuario.perfil)) {
    return res.status(403).json({ mensagem: "Este perfil não solicita autorização da Galeria." });
  }
  try {
    const result = await pool.query(`SELECT id, nome, email, perfil FROM usuarios
      WHERE ativo=TRUE AND perfil IN ('administrador','super_administrador')
      ORDER BY nome, id`);
    return res.status(200).json(result.rows);
  } catch (_) {
    return res.status(503).json({ mensagem: "Não foi possível consultar os autorizadores agora." });
  }
}

async function criar(req, res) {
  const { operacao, entidade, registro_id: registroId, contexto, autorizador_id: autorizadorId, senha } = req.body || {};
  try {
    const resultado = await emitirAutorizacao({
      requesterId: req.usuario.id,
      authorizerId: Number(autorizadorId),
      password: senha,
      operation: operacao,
      entity: entidade || null,
      resourceId: registroId ?? null,
      context: contexto ?? null,
      ip: req.ip,
    });
    return res.status(201).json({ autorizacao: resultado.token, expira_em_segundos: resultado.expira_em_segundos });
  } catch (erro) {
    const status = [400, 401, 403].includes(erro.status) ? erro.status : 503;
    if (status === 503) {
      console.error(JSON.stringify({ evento: "operation_authorization_unavailable", requestId: req.requestId || null }));
    }
    return res.status(status).json({ mensagem: status === 503 ? "Não foi possível autorizar a operação agora." : erro.message });
  }
}

module.exports = { criar, listarAutorizadores };
