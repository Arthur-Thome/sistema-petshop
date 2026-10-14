function obterConfiguracao(env = process.env) {
  const modo = env.WHATSAPP_TRANSPORT || "manual";
  if (modo === "manual") return { modo, configurado: false };
  if (modo !== "meta_cloud") throw new Error("WHATSAPP_TRANSPORT invalido.");
  const versao = env.WHATSAPP_GRAPH_API_VERSION;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = env.WHATSAPP_ACCESS_TOKEN;
  if (!/^v\d+\.\d+$/.test(versao || "") || !/^\d+$/.test(phoneNumberId || "") || !accessToken) {
    const erro = new Error("WhatsApp Business nao configurado.");
    erro.code = "WHATSAPP_NAO_CONFIGURADO";
    throw erro;
  }
  return { modo, versao, phoneNumberId, accessToken };
}

function normalizarDestino(valor) {
  let numero = String(valor || "").replace(/\D/g, "");
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  if (!/^\d{12,15}$/.test(numero)) {
    const erro = new Error("Informe um WhatsApp válido com código do país.");
    erro.code = "DESTINO_INVALIDO";
    throw erro;
  }
  return numero;
}

async function enviarTexto({ telefone, texto }, deps = {}) {
  const config = obterConfiguracao(deps.env || process.env);
  if (!config.configurado && config.modo === "manual") {
    const erro = new Error("Envio oficial por WhatsApp nao esta ativado.");
    erro.code = "WHATSAPP_NAO_CONFIGURADO";
    throw erro;
  }
  const conteudo = typeof texto === "string" ? texto.trim() : "";
  if (!conteudo || conteudo.length > 4096) {
    const erro = new Error("A mensagem deve conter de 1 a 4096 caracteres.");
    erro.code = "MENSAGEM_INVALIDA";
    throw erro;
  }
  const destino = normalizarDestino(telefone);
  const fetchFn = deps.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") throw new Error("Transporte HTTP indisponivel.");
  let resposta;
  try {
    resposta = await fetchFn(`https://graph.facebook.com/${config.versao}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destino, type: "text", text: { preview_url: false, body: conteudo } }),
    });
  } catch (_) {
    const erro = new Error("Nao foi possivel conectar ao provedor de WhatsApp.");
    erro.code = "WHATSAPP_PROVEDOR_INDISPONIVEL";
    throw erro;
  }
  if (!resposta.ok) {
    const erro = new Error("O provedor recusou o envio. Verifique a janela de atendimento e as regras de modelo aprovadas pela Meta.");
    erro.code = "WHATSAPP_ENVIO_REJEITADO";
    throw erro;
  }
  const payload = await resposta.json().catch(() => ({}));
  const messageId = payload.messages?.[0]?.id;
  if (typeof messageId !== "string" || !messageId) {
    const erro = new Error("O provedor nao confirmou o envio.");
    erro.code = "WHATSAPP_ENVIO_INDETERMINADO";
    throw erro;
  }
  return { messageId };
}

async function enviarDocumento({ telefone, documento, nomeArquivo, legenda = "Comprovante do atendimento Amores Pet." }, deps = {}) {
  const config = obterConfiguracao(deps.env || process.env);
  if (!config.configurado && config.modo === "manual") {
    const erro = new Error("Envio oficial por WhatsApp nao esta ativado.");
    erro.code = "WHATSAPP_NAO_CONFIGURADO";
    throw erro;
  }
  const destino = normalizarDestino(telefone);
  if (!Buffer.isBuffer(documento) || documento.length < 8 || documento.length > 4 * 1024 * 1024 ||
      documento.subarray(0, 5).toString("ascii") !== "%PDF-" || !documento.subarray(-1024).toString("latin1").includes("%%EOF")) {
    const erro = new Error("O documento deve ser um PDF valido de ate 4 MB.");
    erro.code = "DOCUMENTO_INVALIDO";
    throw erro;
  }
  const nome = String(nomeArquivo || "comprovante-amores-pet.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const caption = String(legenda || "").trim().slice(0, 1024);
  const fetchFn = deps.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
    throw new Error("Transporte HTTP indisponivel.");
  }
  const base = `https://graph.facebook.com/${config.versao}`;
  let mediaResponse;
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", new Blob([documento], { type: "application/pdf" }), nome);
    mediaResponse = await fetchFn(`${base}/${config.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form,
    });
  } catch (_) {
    const erro = new Error("Nao foi possivel enviar o documento ao provedor de WhatsApp.");
    erro.code = "WHATSAPP_PROVEDOR_INDISPONIVEL";
    throw erro;
  }
  if (!mediaResponse.ok) {
    const erro = new Error("O provedor recusou o documento.");
    erro.code = "WHATSAPP_ENVIO_REJEITADO";
    throw erro;
  }
  const media = await mediaResponse.json().catch(() => ({}));
  if (!media.id) {
    const erro = new Error("O provedor nao confirmou o documento.");
    erro.code = "WHATSAPP_ENVIO_REJEITADO";
    throw erro;
  }
  let sendResponse;
  try {
    sendResponse = await fetchFn(`${base}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: destino,
        type: "document", document: { id: media.id, filename: nome, caption } }),
    });
  } catch (_) {
    const erro = new Error("Nao foi possivel concluir o envio do documento.");
    erro.code = "WHATSAPP_PROVEDOR_INDISPONIVEL";
    throw erro;
  }
  if (!sendResponse.ok) {
    const erro = new Error("O provedor recusou o envio do documento. Verifique a janela de atendimento e as regras aprovadas pela Meta.");
    erro.code = "WHATSAPP_ENVIO_REJEITADO";
    throw erro;
  }
  const payload = await sendResponse.json().catch(() => ({}));
  const messageId = payload.messages?.[0]?.id;
  if (typeof messageId !== "string" || !messageId) {
    const erro = new Error("O provedor nao confirmou o envio do documento.");
    erro.code = "WHATSAPP_ENVIO_INDETERMINADO";
    throw erro;
  }
  return { messageId };
}

module.exports = { obterConfiguracao, normalizarDestino, enviarTexto, enviarDocumento };
