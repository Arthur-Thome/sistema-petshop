const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./src/database/connection");

const authRoutes = require("./src/routes/authRoutes");
const usuarioRoutes = require("./src/routes/usuarioRoutes");
const tutorRoutes = require("./src/routes/tutorRoutes");

const app = express();


// Permite que o frontend faça requisições para esta API.
// Em produção, poderemos restringir o CORS ao domínio do sistema.
app.use(cors());


// Converte automaticamente requisições JSON para req.body.
app.use(express.json());


// Rotas principais da API.
// Cada módulo mantém suas próprias regras e endpoints.
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/tutores", tutorRoutes);


// Rota simples utilizada para verificar se a API está funcionando.
app.get("/", (req, res) => {
  res.json({
    mensagem: "API do sistema pet shop funcionando",
  });
});


// Rota temporária de diagnóstico da conexão com PostgreSQL.
// Poderemos remover esta rota antes de publicar o sistema em produção.
app.get("/teste-banco", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT NOW()");

    res.json({
      mensagem: "Conexão com PostgreSQL funcionando",
      horarioBanco: resultado.rows[0].now,
    });
  } catch (erro) {
    console.error("Erro ao conectar ao banco:", erro);

    res.status(500).json({
      mensagem: "Erro ao conectar ao banco de dados",
    });
  }
});


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});