const service = require("../src/services/whatsappBusinessService");

const env = {
  WHATSAPP_TRANSPORT: "meta_cloud",
  WHATSAPP_GRAPH_API_VERSION: "v99.0",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_ACCESS_TOKEN: "fake-test-token",
};

test("transporte manual nao faz fallback nem requisicao", async () => {
  const fetch = jest.fn();
  await expect(service.enviarTexto({ telefone: "11987654321", texto: "Oi" }, { env: { WHATSAPP_TRANSPORT: "manual" }, fetch }))
    .rejects.toMatchObject({ code: "WHATSAPP_NAO_CONFIGURADO" });
  expect(fetch).not.toHaveBeenCalled();
});

test("Meta Cloud recebe destino normalizado e texto, sem expor credencial na resposta", async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: "wamid.fake" }] }) });
  const result = await service.enviarTexto({ telefone: "(11) 98765-4321", texto: "Mensagem de teste" }, { env, fetch });
  expect(result).toEqual({ messageId: "wamid.fake" });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fake-test-token");
  expect(JSON.parse(fetch.mock.calls[0][1].body).to).toBe("5511987654321");
});

test("falha do provedor não repassa corpo ou dados sensíveis", async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: false, text: async () => "secret provider response" });
  await expect(service.enviarTexto({ telefone: "5511987654321", texto: "Oi" }, { env, fetch }))
    .rejects.toMatchObject({ code: "WHATSAPP_ENVIO_REJEITADO" });
});

test("destino e conteúdo inválidos são rejeitados antes do transporte", async () => {
  const fetch = jest.fn();
  await expect(service.enviarTexto({ telefone: "abc", texto: "Oi" }, { env, fetch })).rejects.toMatchObject({ code: "DESTINO_INVALIDO" });
  await expect(service.enviarTexto({ telefone: "5511987654321", texto: " " }, { env, fetch })).rejects.toMatchObject({ code: "MENSAGEM_INVALIDA" });
  expect(fetch).not.toHaveBeenCalled();
});

test("envia PDF como midia oficial e depois o referencia na mensagem", async () => {
  const fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "media-test" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: "wamid-doc-test" }] }) });
  const documento = Buffer.from("%PDF-1.4\nconteudo ficticio\n%%EOF\n");
  const result = await service.enviarDocumento({ telefone: "11987654321", documento, nomeArquivo: "comprovante teste.pdf" }, { env, fetch });
  expect(result).toEqual({ messageId: "wamid-doc-test" });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer fake-test-token");
  expect(fetch.mock.calls[0][1].body.get("messaging_product")).toBe("whatsapp");
  expect(fetch.mock.calls[0][1].body.get("file").type).toBe("application/pdf");
  expect(JSON.parse(fetch.mock.calls[1][1].body).document.id).toBe("media-test");
  expect(JSON.parse(fetch.mock.calls[1][1].body).to).toBe("5511987654321");
});

test("PDF invalido ou acima do limite nunca chega ao provedor", async () => {
  const fetch = jest.fn();
  await expect(service.enviarDocumento({ telefone: "5511987654321", documento: Buffer.from("not a pdf") }, { env, fetch }))
    .rejects.toMatchObject({ code: "DOCUMENTO_INVALIDO" });
  await expect(service.enviarDocumento({ telefone: "5511987654321", documento: Buffer.alloc(4 * 1024 * 1024 + 1) }, { env, fetch }))
    .rejects.toMatchObject({ code: "DOCUMENTO_INVALIDO" });
  expect(fetch).not.toHaveBeenCalled();
});
