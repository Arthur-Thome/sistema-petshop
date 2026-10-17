import assert from "node:assert/strict";
import test from "node:test";

import {
  formatarTelefone,
  consultarCep,
  consultaCepEstaAtual,
  interpretarRespostaCep,
  iniciarConsultaCep,
  invalidarConsultaCep,
  mesclarEnderecoCep,
  prepararConsultaCep,
  validarTelefoneBrasileiro,
} from "../src/utils/tutorFormValidation.js";

test("aceita telefone celular e fixo brasileiros estruturalmente válidos", () => {
  assert.equal(validarTelefoneBrasileiro("(11) 98765-4321"), "");
  assert.equal(validarTelefoneBrasileiro("(51) 3333-4444"), "");
});

test("rejeita DDD 00, números incompletos e sequências repetidas", () => {
  assert.match(validarTelefoneBrasileiro("(00) 00000-0000"), /DDD válido/);
  assert.match(validarTelefoneBrasileiro("(11) 1234-567"), /8 ou 9 dígitos/);
  assert.match(validarTelefoneBrasileiro("(11) 99999-9999"), /sequências repetidas/);
  assert.match(validarTelefoneBrasileiro("(51) 3333-3333"), /sequências repetidas/);
});

test("a máscara não transforma dígitos ausentes em um telefone válido", () => {
  const formatado = formatarTelefone("(00) 00000-0000");
  assert.equal(formatado, "(00) 00000-0000");
  assert.notEqual(validarTelefoneBrasileiro(formatado), "");
  assert.match(validarTelefoneBrasileiro(formatarTelefone("1198765")), /8 ou 9 dígitos/);
});

test("interpreta uma resposta válida do ViaCEP", () => {
  assert.deepEqual(
    interpretarRespostaCep({
      logradouro: "Rua Exemplo",
      bairro: "Centro",
      localidade: "Porto Alegre",
      uf: "rs",
    }),
    {
      status: "found",
      address: {
        endereco: "Rua Exemplo",
        bairro: "Centro",
        cidade: "Porto Alegre",
        estado: "RS",
      },
    },
  );
});

test("distingue CEP inexistente de resposta inválida do serviço", () => {
  assert.deepEqual(interpretarRespostaCep({ erro: true }), { status: "not-found" });
  assert.deepEqual(interpretarRespostaCep({ erro: false }), { status: "invalid-response" });
  assert.deepEqual(interpretarRespostaCep(null), { status: "invalid-response" });
});

test("classifica CEP válido, incompleto e vazio antes da consulta", () => {
  assert.deepEqual(prepararConsultaCep("91350-240"), { status: "ready", cep: "91350240" });
  assert.deepEqual(prepararConsultaCep("91350-24"), { status: "incomplete", cep: "9135024" });
  assert.deepEqual(prepararConsultaCep(""), { status: "empty", cep: "" });
});

test("consulta CEP válido pela URL do ViaCEP e normaliza a resposta", async () => {
  let chamada;
  const resultado = await consultarCep("91350-240", {
    fetchImpl: async (url, options) => {
      chamada = { url, options };
      return {
        ok: true,
        json: async () => ({ localidade: "Porto Alegre", uf: "RS", logradouro: "Rua A" }),
      };
    },
  });

  assert.equal(chamada.url, "https://viacep.com.br/ws/91350240/json/");
  assert.ok(chamada.options.signal instanceof AbortSignal);
  assert.equal(resultado.status, "found");
  assert.equal(resultado.address.cidade, "Porto Alegre");
});

test("resposta erro:true do ViaCEP é tratada como CEP inexistente", async () => {
  const resultado = await consultarCep("00000-000", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ erro: true }) }),
  });
  assert.deepEqual(resultado, { status: "not-found" });
});

test("CEP incompleto não chama fetch", async () => {
  let chamadas = 0;
  const resultado = await consultarCep("91350-24", {
    fetchImpl: async () => { chamadas += 1; },
  });
  assert.deepEqual(resultado, { status: "incomplete" });
  assert.equal(chamadas, 0);
});

test("falha de conexão e HTTP indisponível são diferenciadas", async () => {
  const rede = await consultarCep("91350-240", {
    fetchImpl: async () => { throw new TypeError("offline"); },
  });
  const http = await consultarCep("91350-240", {
    fetchImpl: async () => ({ ok: false }),
  });
  assert.deepEqual(rede, { status: "network" });
  assert.deepEqual(http, { status: "service-unavailable" });
});

test("timeout aborta a requisição e retorna estado específico", async () => {
  const resultado = await consultarCep("91350-240", {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        const erro = new Error("aborted");
        erro.name = "AbortError";
        reject(erro);
      }, { once: true });
    }),
  });
  assert.deepEqual(resultado, { status: "timeout" });
});

test("CEP preenche endereço sem sobrescrever campos manuais ou número/complemento", () => {
  const atual = { endereco: "", bairro: "", cidade: "", estado: "", numero: "42", complemento: "Fundos" };
  const primeiraConsulta = mesclarEnderecoCep(atual, {
    endereco: "Rua Adão Baino", bairro: "Cristo Redentor", cidade: "Porto Alegre", estado: "RS",
  });

  assert.deepEqual(primeiraConsulta.form, {
    endereco: "Rua Adão Baino", bairro: "Cristo Redentor", cidade: "Porto Alegre", estado: "RS",
    numero: "42", complemento: "Fundos",
  });

  const segundaConsulta = mesclarEnderecoCep(
    { ...primeiraConsulta.form, endereco: "Endereço digitado manualmente" },
    { endereco: "Outro logradouro", bairro: "Novo bairro", cidade: "Outra cidade", estado: "SP" },
    primeiraConsulta.valoresAutoPreenchidos,
  );
  assert.equal(segundaConsulta.form.endereco, "Endereço digitado manualmente");
  assert.equal(segundaConsulta.form.bairro, "Novo bairro");
  assert.equal(segundaConsulta.form.cidade, "Outra cidade");
  assert.equal(segundaConsulta.form.estado, "SP");
  assert.equal(segundaConsulta.form.numero, "42");
  assert.equal(segundaConsulta.form.complemento, "Fundos");
});

test("uma resposta antiga deixa de ser atual após nova consulta ou edição do CEP", () => {
  const controle = { current: 0 };
  const primeira = iniciarConsultaCep(controle);
  const segunda = iniciarConsultaCep(controle);

  assert.equal(consultaCepEstaAtual(controle, primeira), false);
  assert.equal(consultaCepEstaAtual(controle, segunda), true);
  invalidarConsultaCep(controle);
  assert.equal(consultaCepEstaAtual(controle, segunda), false);
});

test("consulta ViaCEP pode ser cancelada quando o tutor edita o CEP", async () => {
  const edicao = new AbortController();
  const consulta = consultarCep("91350-240", {
    signal: edicao.signal,
    fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        const erro = new Error("aborted");
        erro.name = "AbortError";
        reject(erro);
      }, { once: true });
    }),
  });

  edicao.abort();
  assert.deepEqual(await consulta, { status: "cancelled" });
});
