const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

const authRoutes = require("./src/routes/authRoutes");
const usuarioRoutes = require("./src/routes/usuarioRoutes");
const tutorRoutes = require("./src/routes/tutorRoutes");
const petRoutes = require("./src/routes/petRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const produtoRoutes = require("./src/routes/produtoRoutes");
const estoqueRoutes = require("./src/routes/estoqueRoutes");
const crecheRoutes = require("./src/routes/crecheRoutes");
const hotelRoutes = require("./src/routes/hotelRoutes");
const atendimentoRoutes = require("./src/routes/atendimentoRoutes");
const servicoRoutes = require("./src/routes/servicoRoutes");
const auditoriaRoutes = require("./src/routes/auditoriaRoutes");
const agendaPublicaRoutes = require("./src/routes/agendaPublicaRoutes");
const agendamentoPublicoRoutes = require("./src/routes/agendamentoPublicoRoutes");
const siteConteudoRoutes = require("./src/routes/siteConteudoRoutes");
const relatorioRoutes = require("./src/routes/relatorioRoutes");
const notificacaoRoutes = require("./src/routes/notificacaoRoutes");
const comunicacaoRoutes = require("./src/routes/comunicacaoRoutes");
const operationAuthorizationRoutes = require("./src/routes/operationAuthorizationRoutes");
const hardDeleteRoutes = require("./src/routes/hardDeleteRoutes");

const app = express();

// Identificador correlacionável para diagnóstico sem registrar corpo, cookies ou tokens.
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

/*
 * Adiciona cabeçalhos HTTP de segurança.
 *
 * crossOriginResourcePolicy é configurado como
 * cross-origin porque o frontend e os arquivos de
 * upload são servidos em origens diferentes.
 *
 * Desenvolvimento:
 * frontend -> localhost:5173
 * uploads  -> localhost:3001
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: ["'self'", "https://viacep.com.br"],
        imgSrc: ["'self'", "data:", "blob:"],
      },
    },
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/*
 * Evita divulgar explicitamente que a aplicação
 * utiliza Express através do cabeçalho X-Powered-By.
 */
app.disable("x-powered-by");


/*
 * Permite requisições do frontend configurado.
 *
 * Em desenvolvimento utilizamos localhost:5173.
 * Em produção, FRONTEND_URL deverá apontar para o
 * endereço real em que o frontend estiver publicado.
 */
const frontendUrl =
  process.env.FRONTEND_URL ||
  [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .map((host) => (/^https?:\/\//i.test(host) ? host : `https://${host}`))
    .join(",") || "http://localhost:5173";

const origensFrontend = frontendUrl.split(",").map((origem) => origem.trim()).filter(Boolean);
const origensValidadas = origensFrontend.map((origem) => {
  try {
    const url = new URL(origem);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origem.replace(/\/$/, "")) throw new Error();
    return url.origin;
  } catch (_) {
  console.error(
      "FRONTEND_URL invalida. Informe uma ou mais origens HTTP/HTTPS separadas por virgula."
  );
  process.exit(1);
  }
});

app.use(
  cors({
    origin(origem, callback) {
      if (!origem || origensValidadas.includes(origem)) return callback(null, true);
      const erro = new Error("Origem nao permitida.");
      erro.code = "ORIGEM_NAO_PERMITIDA";
      return callback(erro);
    },
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Confirm-Password",
      "X-Operation-Authorization",
    ],
  })
);


/*
 * Limita o tamanho de corpos JSON recebidos pela API.
 *
 * Uploads de fotos utilizam multipart/form-data e não
 * dependem deste limite.
 */
app.use(
  express.json({
    limit: "1mb",
  })
);

// O launcher Neon deste estágio é deliberadamente somente leitura. A restrição
// fica no backend para cobrir todas as APIs, inclusive chamadas fora da UI.
const modoNeonSomenteLeitura = process.env.AMORES_PET_DATABASE_MODE === "NEON_HOMOLOGACAO";
if (modoNeonSomenteLeitura) {
  const { deveBloquearEscritaNeon } = require("./src/database/neonHomologacao.cjs");
  app.use((req, res, next) => {
    res.setHeader("X-Amores-Pet-Mode", "NEON_HOMOLOGACAO_READ_ONLY");
    if (!deveBloquearEscritaNeon(req.method, req.path)) return next();
    return res.status(423).json({
      erro: "O ambiente Neon de homologação está em modo somente leitura.",
      codigo: "NEON_HOMOLOGACAO_READ_ONLY",
      requestId: req.requestId,
    });
  });
}

// Rotina stateless acionada diariamente pelo cron da plataforma ou manualmente.
app.get(
  "/api/maintenance/temporary-upload-cleanup",
  require("./src/middleware/cronSecretMiddleware"),
  require("./src/controllers/temporaryUploadCleanupController").executar
);

// Fotos de pets são privadas: a rota verifica sessão e vínculo com tutor.
app.get("/uploads/pets/:filename", require("./src/controllers/fotoPetController").servirFotoPet);

app.get("/health/live", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try {
    const pool = require("./src/database/connection");
    await pool.query("SELECT 1");
    const { rows: [estado] } = await pool.query(`
      SELECT
        to_regclass('public.usuarios') IS NOT NULL AS usuarios_disponiveis,
        to_regclass('public.rate_limit_buckets') IS NOT NULL AS rate_limit_disponivel,
        to_regclass('public.operation_authorizations') IS NOT NULL AS autorizacoes_operacionais_disponiveis,
        to_regclass('public.permanent_file_deletion_queue') IS NOT NULL AS fila_exclusoes_disponivel,
        CASE
          WHEN to_regclass('public.rate_limit_buckets') IS NULL THEN FALSE
          ELSE has_table_privilege(
            current_user,
            'public.rate_limit_buckets',
            'SELECT,INSERT,UPDATE,DELETE'
          )
        END AS permissao_rate_limit,
        CASE
          WHEN to_regclass('public.operation_authorizations') IS NULL THEN FALSE
          ELSE has_table_privilege(current_user, 'public.operation_authorizations', 'SELECT,INSERT,UPDATE')
        END AS permissao_autorizacoes,
        CASE
          WHEN to_regclass('public.permanent_file_deletion_queue') IS NULL THEN FALSE
          ELSE has_table_privilege(current_user, 'public.permanent_file_deletion_queue', 'SELECT,INSERT,UPDATE')
        END AS permissao_fila_exclusoes
    `);
    await pool.query(`SELECT id, nome, email, perfil, ativo, versao_sessao FROM public.usuarios LIMIT 0`);
    await pool.query(`SELECT limiter_key, window_start, expires_at, request_count FROM public.rate_limit_buckets LIMIT 0`);
    await pool.query(`SELECT token_hash, requester_user_id, authorizer_user_id, operation, context_hash, expires_at, consumed_at FROM public.operation_authorizations LIMIT 0`);
    await pool.query(`SELECT id, resource_kind, object_key, attempts, completed_at FROM public.permanent_file_deletion_queue LIMIT 0`);
    if (!estado?.usuarios_disponiveis || !estado?.rate_limit_disponivel || !estado?.permissao_rate_limit
      || !estado?.autorizacoes_operacionais_disponiveis || !estado?.fila_exclusoes_disponivel
      || !estado?.permissao_autorizacoes || !estado?.permissao_fila_exclusoes) {
      return res.status(503).json({ status: "unavailable" });
    }
    return res.status(200).json({ status: "ready" });
  } catch (erro) {
    const codigo = typeof erro?.code === "string" && /^[A-Z0-9]{2,10}$/.test(erro.code)
      ? erro.code
      : "DB_OR_SCHEMA_ERROR";
    console.error(JSON.stringify({
      evento: "readiness_unavailable",
      requestId: _req.requestId || null,
      codigo,
      horario: new Date().toISOString(),
    }));
    return res.status(503).json({ status: "unavailable" });
  }
});


// Rotas principais da API.
// Cada módulo mantém suas próprias regras e endpoints.
app.use("/api/auth", authRoutes);
app.use("/api/operacoes/autorizacoes", operationAuthorizationRoutes);
app.use("/api/exclusoes-definitivas", hardDeleteRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/tutores", tutorRoutes);
app.use("/api/pets", petRoutes);
app.use("/api/dashboard" , dashboardRoutes);
app.use("/api/produtos", produtoRoutes);
app.use("/api/estoque", estoqueRoutes);
app.use("/api/creche", crecheRoutes);
app.use("/api/hotel", hotelRoutes);
app.use("/api/atendimentos", atendimentoRoutes);
app.use("/api/banho-tosa", atendimentoRoutes); // alias historico para clientes antigos
app.use("/api/servicos", servicoRoutes);
app.use("/api/auditoria", auditoriaRoutes);
/*
 * Agenda pública.
 *
 * Por enquanto estamos registrando as rotas administrativas
 * autenticadas do módulo.
 *
 * Mais adiante este mesmo módulo também receberá endpoints
 * públicos de leitura de disponibilidade, sem expor as rotas
 * administrativas.
 */
app.use("/api/agenda-publica", agendaPublicaRoutes);
app.use("/api/agendamento-publico", agendamentoPublicoRoutes);
app.use("/api/site-conteudo", siteConteudoRoutes);
app.use("/api/relatorios", relatorioRoutes);
app.use("/api/notificacoes", notificacaoRoutes);
app.use("/api/comunicacao", comunicacaoRoutes);

// O launcher local serve o build Vite na mesma origem da API. Opt-in, sem
// ativacao na Vercel ou nos testes por padrao.
const servirFrontendLocal = (process.env.AMORES_PET_HOMOLOGACAO === "1"
  || process.env.AMORES_PET_DATABASE_MODE === "NEON_HOMOLOGACAO")
  && process.env.SERVIR_FRONTEND_LOCAL === "1";
const frontendDist = path.resolve(__dirname, "../frontend/dist");
if (servirFrontendLocal) {
  const indexFrontend = path.join(frontendDist, "index.html");
  if (!fs.existsSync(indexFrontend)) {
    throw new Error("Build do frontend ausente. Execute a preparacao da homologacao.");
  }

  app.use(express.static(frontendDist, { index: false, fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")
      || path.extname(req.path) || !req.accepts("html")) {
      return next();
    }
    return res.sendFile(indexFrontend);
  });
}



// Rota simples utilizada para verificar se a API está funcionando.
app.get("/", (req, res) => {
  if (servirFrontendLocal) return res.sendFile(path.join(frontendDist, "index.html"));
  res.json({
    mensagem: "API do sistema pet shop funcionando",
  });
});

/*
 * Qualquer endereço que não corresponda às rotas
 * existentes recebe uma resposta JSON controlada.
 *
 * Isso evita que o Express devolva sua resposta HTML
 * padrão para endpoints inexistentes.
 */
app.use((req, res) => {
  return res.status(404).json({
    mensagem: "Rota não encontrada.",
  });
});

/*
 * Tratamento final para erros que chegarem até o Express
 * sem terem sido tratados pelo módulo responsável.
 *
 * Detalhes internos não são enviados ao cliente.
 */
app.use((erro, req, res, next) => {
  console.error(
    "Erro não tratado pela aplicação:",
    erro
  );

    /*
    * JSON malformado é um erro da requisição e não uma
    * falha interna do servidor.
    */
  if (
      erro instanceof SyntaxError &&
      erro.status === 400 &&
      "body" in erro
  ) {
      return res.status(400).json({
        mensagem:
          "O corpo JSON da requisição é inválido.",
      });
    }

  if (res.headersSent) {
    return next(erro);
  }

  if (erro.code === "ORIGEM_NAO_PERMITIDA") {
    return res.status(403).json({ mensagem: "Origem nao permitida." });
  }

  return res.status(500).json({
    mensagem: "Erro interno do servidor.",
  });
});

module.exports = app;
