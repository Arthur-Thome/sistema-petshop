const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

/*
 * O servidor não deve iniciar sem uma chave JWT adequada.
 *
 * A validação acontece na inicialização para evitar que uma
 * configuração insegura passe despercebida.
 */
if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  console.error(
    "JWT_SECRET ausente ou muito curta. Utilize pelo menos 32 caracteres."
  );

  process.exit(1);
}

const authRoutes = require("./src/routes/authRoutes");
const usuarioRoutes = require("./src/routes/usuarioRoutes");
const tutorRoutes = require("./src/routes/tutorRoutes");
const petRoutes = require("./src/routes/petRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const produtoRoutes = require("./src/routes/produtoRoutes");
const estoqueRoutes = require("./src/routes/estoqueRoutes");
const crecheRoutes = require("./src/routes/crecheRoutes");
const hotelRoutes = require("./src/routes/hotelRoutes");
const banhoTosaRoutes = require("./src/routes/banhoTosaRoutes");
const servicoRoutes = require("./src/routes/servicoRoutes");
const auditoriaRoutes = require("./src/routes/auditoriaRoutes");
const path = require("path");

const app = express();

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
  "http://localhost:5173";

let frontendUrlValidada;

try {
  frontendUrlValidada =
    new URL(frontendUrl);

  if (
    frontendUrlValidada.protocol !== "http:" &&
    frontendUrlValidada.protocol !== "https:"
  ) {
    throw new Error(
      "Protocolo inválido."
    );
  }
} catch (erro) {
  console.error(
    "FRONTEND_URL inválida. Utilize uma URL HTTP ou HTTPS válida."
  );

  process.exit(1);
}

app.use(
  cors({
    origin: frontendUrl,
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

// Disponibiliza publicamente somente os arquivos da pasta uploads.
// Exemplo:
// /uploads/pets/nome-da-imagem.jpg
app.use(
  "/uploads",
  express.static(
    path.resolve(__dirname, "src/uploads")
  )
);


// Rotas principais da API.
// Cada módulo mantém suas próprias regras e endpoints.
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/tutores", tutorRoutes);
app.use("/api/pets", petRoutes);
app.use("/api/dashboard" , dashboardRoutes);
app.use("/api/produtos", produtoRoutes);
app.use("/api/estoque", estoqueRoutes);
app.use("/api/creche", crecheRoutes);
app.use("/api/hotel", hotelRoutes);
app.use("/api/atendimentos", banhoTosaRoutes);
app.use("/api/banho-tosa", banhoTosaRoutes);
app.use("/api/servicos", servicoRoutes);
app.use("/api/auditoria", auditoriaRoutes);



// Rota simples utilizada para verificar se a API está funcionando.
app.get("/", (req, res) => {
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

  return res.status(500).json({
    mensagem: "Erro interno do servidor.",
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});