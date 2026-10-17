export function formatarTelefone(valor) {
  const numeros = String(valor || "")
    .replace(/\D/g, "")
    .slice(0, 11);

  if (numeros.length <= 10) {
    return numeros
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return numeros
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function validarTelefoneBrasileiro(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");

  if (numeros.length !== 10 && numeros.length !== 11) {
    return "Informe um telefone com DDD e 8 ou 9 dígitos.";
  }

  const ddd = numeros.slice(0, 2);
  const assinante = numeros.slice(2);

  if (!/^[1-9][1-9]$/.test(ddd)) {
    return "Informe um DDD válido, diferente de 00.";
  }

  if (/^(\d)\1+$/.test(numeros) || /^(\d)\1+$/.test(assinante)) {
    return "Informe um telefone válido; sequências repetidas não são aceitas.";
  }

  if (numeros.length === 11 && assinante[0] !== "9") {
    return "Telefone celular deve começar com 9 após o DDD.";
  }

  if (numeros.length === 10 && !/[2-5]/.test(assinante[0])) {
    return "Telefone fixo deve começar com um número de 2 a 5 após o DDD.";
  }

  return "";
}

export function interpretarRespostaCep(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return { status: "invalid-response" };
  }

  if (dados.erro === true) {
    return { status: "not-found" };
  }

  if (
    typeof dados.localidade !== "string" ||
    !dados.localidade.trim() ||
    typeof dados.uf !== "string" ||
    !/^[A-Z]{2}$/i.test(dados.uf)
  ) {
    return { status: "invalid-response" };
  }

  return {
    status: "found",
    address: {
      endereco: typeof dados.logradouro === "string" ? dados.logradouro.trim() : "",
      bairro: typeof dados.bairro === "string" ? dados.bairro.trim() : "",
      cidade: dados.localidade.trim(),
      estado: dados.uf.trim().toUpperCase(),
    },
  };
}

export function prepararConsultaCep(valor) {
  const cep = String(valor || "").replace(/\D/g, "");
  if (!cep) return { status: "empty", cep };
  if (cep.length !== 8) return { status: "incomplete", cep };
  return { status: "ready", cep };
}

export function mesclarEnderecoCep(formAtual, enderecoCep, valoresAutoPreenchidos = {}) {
  const resultado = { ...formAtual };
  const novosValoresAutoPreenchidos = {};

  for (const campo of ["endereco", "bairro", "cidade", "estado"]) {
    const valorAtual = String(formAtual[campo] || "");
    const valorAnteriorAuto = valoresAutoPreenchidos[campo];
    const podeAtualizar = !valorAtual.trim() || valorAtual === valorAnteriorAuto;
    const valorCep = String(enderecoCep[campo] || "");

    if (podeAtualizar) {
      resultado[campo] = valorCep;
      if (valorCep) novosValoresAutoPreenchidos[campo] = valorCep;
    }
  }

  return { form: resultado, valoresAutoPreenchidos: novosValoresAutoPreenchidos };
}

export function iniciarConsultaCep(controle) {
  controle.current += 1;
  return controle.current;
}

export function invalidarConsultaCep(controle) {
  controle.current += 1;
}

export function consultaCepEstaAtual(controle, versao) {
  return versao === controle.current;
}

export async function consultarCep(valor, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  signal: signalExterno,
} = {}) {
  const consulta = prepararConsultaCep(valor);
  if (consulta.status !== "ready") return { status: consulta.status };

  const controller = new AbortController();
  const abortarPorSolicitacaoAtual = () => controller.abort();
  if (signalExterno?.aborted) {
    return { status: "cancelled" };
  }
  signalExterno?.addEventListener("abort", abortarPorSolicitacaoAtual, { once: true });
  let timeoutId;
  let timeoutExpirou = false;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutExpirou = true;
      controller.abort();
      const erro = new Error("CEP lookup timed out");
      erro.name = "TimeoutError";
      reject(erro);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          const erro = new Error("CEP lookup was cancelled");
          erro.name = "AbortError";
          throw erro;
        }
        return fetchImpl(
          `https://viacep.com.br/ws/${consulta.cep}/json/`,
          { signal: controller.signal },
        );
      }),
      timeout,
    ]);

    if (!response?.ok) return { status: "service-unavailable" };

    let data;
    try {
      data = await Promise.race([response.json(), timeout]);
    } catch {
      if (timeoutExpirou) return { status: "timeout" };
      return { status: "invalid-response" };
    }

    return interpretarRespostaCep(data);
  } catch (error) {
    if (signalExterno?.aborted) return { status: "cancelled" };
    if (timeoutExpirou || error?.name === "TimeoutError" || error?.name === "AbortError") {
      return { status: "timeout" };
    }
    return { status: "network" };
  } finally {
    clearTimeout(timeoutId);
    signalExterno?.removeEventListener("abort", abortarPorSolicitacaoAtual);
  }
}
