require("dotenv").config();

// A configuracao de producao e validada no entrypoint, nao ao importar app.js.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET ausente ou muito curta. Utilize pelo menos 32 caracteres.");
  process.exit(1);
}

const app = require("./app");
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
