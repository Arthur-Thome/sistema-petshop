const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./src/database/connection");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    mensagem: "API do sistema pet shop funcionando",
  });
});

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