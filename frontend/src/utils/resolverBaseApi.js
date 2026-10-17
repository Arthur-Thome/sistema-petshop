const LOOPBACKS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolverBaseApi(urlConfigurada, origemPagina) {
  const configurada = typeof urlConfigurada === "string" ? urlConfigurada.trim() : "";
  if (!configurada) return "/api";
  if (configurada === "/api" || configurada === "/api/") return "/api";
  if (!/^https?:\/\//i.test(configurada)) return "/api";

  try {
    const pagina = new URL(origemPagina);
    const apiConfigurada = new URL(configurada, pagina.origin);
    const apiLocal = apiConfigurada.protocol === "http:"
      && LOOPBACKS.has(apiConfigurada.hostname.toLowerCase().replace(/^\[|\]$/g, ""))
      && apiConfigurada.port === "3001"
      && apiConfigurada.pathname.replace(/\/$/, "") === "/api";

    // API local sempre passa pela origem da página. No modo Vite, o proxy /api
    // encaminha ao backend; em homologação e produção, frontend e API compartilham
    // a origem. Isso também evita diferenças entre localhost e 127.0.0.1.
    if (apiLocal) return "/api";
    return configurada;
  } catch {
    return "/api";
  }
}
