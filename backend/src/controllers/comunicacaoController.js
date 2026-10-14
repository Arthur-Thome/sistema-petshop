const { enviarTexto, enviarDocumento, normalizarDestino, obterConfiguracao } = require("../services/whatsappBusinessService");
const pool = require("../database/connection");

async function reservarEnvio(req, atendimentoId, tipo) {
  if (!Number.isSafeInteger(atendimentoId) || atendimentoId < 1 || atendimentoId > 2147483647) {
    const erro = new Error("Atendimento invalido para envio."); erro.code = "ATENDIMENTO_INVALIDO"; throw erro;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 0)", [`whatsapp:${atendimentoId}:${tipo}`]);
    const anterior = await client.query(`SELECT id FROM logs WHERE entidade='atendimentos' AND registro_id=$1
      AND acao IN ('WHATSAPP_ENVIO_INICIADO','WHATSAPP_ENVIO_CONCLUIDO','WHATSAPP_ENVIO_FALHOU')
      AND valor_novo->>'tipo'=$2 LIMIT 1`, [atendimentoId, tipo]);
    if (anterior.rows.length) {
      await client.query("ROLLBACK");
      const erro = new Error("Ja existe uma tentativa de envio para este atendimento. Confira o historico antes de tentar novamente.");
      erro.code = "WHATSAPP_ENVIO_DUPLICADO"; throw erro;
    }
    await client.query(`INSERT INTO logs (usuario_id, acao, entidade, registro_id, valor_novo, ip)
      VALUES ($1,'WHATSAPP_ENVIO_INICIADO','atendimentos',$2,$3::jsonb,$4)`, [req.usuario.id, atendimentoId, JSON.stringify({ tipo, consentimento_confirmado: true }), req.ip]);
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally { client.release(); }
}

function statusWhatsApp(_req, res) {
  try {
    const config = obterConfiguracao();
    return res.status(200).json({ disponivel: config.modo === "meta_cloud" && Boolean(config.accessToken) });
  } catch (_) {
    return res.status(200).json({ disponivel: false });
  }
}

async function registrarResultadoEnvio(req, atendimentoId, tipo, destino, sucesso, codigo) {
  await pool.query(`INSERT INTO logs (usuario_id, acao, entidade, registro_id, valor_novo, ip)
    VALUES ($1,$2,'atendimentos',$3,$4::jsonb,$5)`, [req.usuario.id,
    sucesso ? "WHATSAPP_ENVIO_CONCLUIDO" : "WHATSAPP_ENVIO_FALHOU", atendimentoId,
    JSON.stringify({ tipo, destino_final: String(destino || "").replace(/\D/g, "").slice(-4), codigo: codigo || null }), req.ip]);
}

async function enviarWhatsAppTexto(req, res) {
  const { telefone, texto } = req.body || {};
  const atendimentoId = Number(req.body?.atendimento_id);
  if (req.body?.consentimento_confirmado !== true) return res.status(400).json({ codigo: "CONSENTIMENTO_NECESSARIO", mensagem: "Confirme que o tutor autorizou o contato pelo WhatsApp." });
  try {
    normalizarDestino(telefone);
    if (typeof texto !== "string" || !texto.trim() || texto.trim().length > 4096) throw Object.assign(new Error("Mensagem invalida."), { code: "MENSAGEM_INVALIDA" });
  } catch (erro) { return res.status(400).json({ codigo: erro.code || "MENSAGEM_INVALIDA", mensagem: erro.message }); }
  let reservado = false;
  try {
    if ((process.env.WHATSAPP_TRANSPORT || "manual") === "manual") {
      const erro = new Error("Envio oficial por WhatsApp nao esta ativado."); erro.code = "WHATSAPP_NAO_CONFIGURADO"; throw erro;
    }
    await reservarEnvio(req, atendimentoId, "texto"); reservado = true;
    const resultado = await enviarTexto({ telefone, texto });
    await registrarResultadoEnvio(req, atendimentoId, "texto", telefone, true);
    return res.status(200).json({ mensagem: "Mensagem enviada pelo WhatsApp Business.", messageId: resultado.messageId });
  } catch (erro) {
    if (reservado) await registrarResultadoEnvio(req, atendimentoId, "texto", telefone, false, erro.code || "ENVIO_INDETERMINADO").catch(() => {});
    const status = erro.code === "WHATSAPP_NAO_CONFIGURADO" ? 503 : erro.code === "DESTINO_INVALIDO" || erro.code === "MENSAGEM_INVALIDA" ? 400 : 502;
    if (erro.code === "WHATSAPP_ENVIO_DUPLICADO") return res.status(409).json({ codigo: erro.code, mensagem: erro.message });
    if (erro.code === "ATENDIMENTO_INVALIDO") return res.status(400).json({ codigo: erro.code, mensagem: erro.message });
    return res.status(status).json({ codigo: erro.code || "WHATSAPP_ERRO", mensagem: erro.message || "Nao foi possivel enviar a mensagem." });
  }
}

async function enviarWhatsAppDocumento(req, res) {
  const telefone = req.body?.telefone;
  const atendimentoId = Number(req.body?.atendimento_id);
  if (req.body?.consentimento_confirmado !== "true" && req.body?.consentimento_confirmado !== true) return res.status(400).json({ codigo: "CONSENTIMENTO_NECESSARIO", mensagem: "Confirme que o tutor autorizou o envio do documento pelo WhatsApp." });
  if (!req.file || req.file.mimetype !== "application/pdf") {
    return res.status(400).json({ mensagem: "Anexe um comprovante PDF valido de ate 4 MB." });
  }
  try {
    normalizarDestino(telefone);
    const buffer = req.file.buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > 4 * 1024 * 1024 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-" || !buffer.subarray(-1024).toString("latin1").includes("%%EOF")) {
      return res.status(400).json({ codigo: "DOCUMENTO_INVALIDO", mensagem: "O comprovante deve ser um PDF valido de ate 4 MB." });
    }
  } catch (erro) { return res.status(400).json({ codigo: erro.code || "DESTINO_INVALIDO", mensagem: erro.message }); }
  let reservado = false;
  try {
    if ((process.env.WHATSAPP_TRANSPORT || "manual") === "manual") {
      const erro = new Error("Envio oficial por WhatsApp nao esta ativado."); erro.code = "WHATSAPP_NAO_CONFIGURADO"; throw erro;
    }
    await reservarEnvio(req, atendimentoId, "documento_pdf"); reservado = true;
    const resultado = await enviarDocumento({
      telefone,
      documento: req.file.buffer,
      nomeArquivo: req.file.originalname,
      legenda: req.body?.legenda,
    });
    await registrarResultadoEnvio(req, atendimentoId, "documento_pdf", telefone, true);
    return res.status(200).json({ mensagem: "Documento enviado pelo WhatsApp Business.", messageId: resultado.messageId });
  } catch (erro) {
    if (reservado) await registrarResultadoEnvio(req, atendimentoId, "documento_pdf", telefone, false, erro.code || "ENVIO_INDETERMINADO").catch(() => {});
    const status = erro.code === "WHATSAPP_NAO_CONFIGURADO" ? 503 :
      erro.code === "DESTINO_INVALIDO" || erro.code === "DOCUMENTO_INVALIDO" ? 400 : 502;
    if (erro.code === "WHATSAPP_ENVIO_DUPLICADO") return res.status(409).json({ codigo: erro.code, mensagem: erro.message });
    if (erro.code === "ATENDIMENTO_INVALIDO") return res.status(400).json({ codigo: erro.code, mensagem: erro.message });
    return res.status(status).json({ codigo: erro.code || "WHATSAPP_ERRO", mensagem: erro.message || "Nao foi possivel enviar o documento." });
  }
}

module.exports = { statusWhatsApp, enviarWhatsAppTexto, enviarWhatsAppDocumento };
