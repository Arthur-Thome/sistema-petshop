import axios from "axios";
import { resolverBaseApi } from "../utils/resolverBaseApi";

const origemPagina = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
const baseURL = resolverBaseApi(import.meta.env.VITE_API_URL, origemPagina);
const segmentosApiConhecidos = new Set([
  "api", "auth", "login", "me", "esqueci-senha", "redefinir-senha", "usuarios", "tutores", "pets",
  "dashboard", "resumo", "produtos", "estoque", "creche", "hotel", "atendimentos", "servicos", "auditoria",
  "agenda-publica", "agendamento-publico", "site-conteudo", "relatorios", "notificacoes", "comunicacao",
  "ativos", "pendentes", "solicitacoes", "confirmar", "recusar", "cancelar", "pagamento", "estornar-pagamento",
  "status", "foto", "tutor", "por-tutor", "historico", "disponibilidade", "dias", "horarios",
]);

// Instância central do Axios.
// A URL da API vem do .env para permitir ambientes diferentes
// sem alterar o código-fonte.
const api = axios.create({
  // Homologação local e produção servem frontend e API na mesma origem.
  // O valor explícito de ambiente continua permitindo URLs dedicadas.
  baseURL,
});

// Inclui automaticamente o JWT nas requisições autenticadas.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const origem = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
    let destino;
    try {
      destino = new URL(error.config?.url || "/api", new URL(error.config?.baseURL || baseURL, origem));
    } catch {
      destino = new URL("/api", origem);
    }
    const rotaSegura = destino.pathname
      .split("/")
      .map((segmento) => (!segmento || segmentosApiConhecidos.has(segmento.toLowerCase()) ? segmento : ":param"))
      .join("/");
    const requestId = error.response?.headers?.["x-request-id"];
    console.warn(JSON.stringify({
      evento: "api_request_failed",
      metodo: String(error.config?.method || "GET").toUpperCase(),
      origem: destino.origin,
      rota: rotaSegura,
      status: error.response?.status || null,
      codigo: typeof error.code === "string" && /^[A-Z0-9_]{2,32}$/.test(error.code) ? error.code : "NETWORK_ERROR",
      requestId: typeof requestId === "string" && /^[a-f0-9-]{36}$/i.test(requestId) ? requestId : null,
      horario: new Date().toISOString(),
    }));
    return Promise.reject(error);
  }
);

export default api;
