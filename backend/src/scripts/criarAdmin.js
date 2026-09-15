require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../database/connection");

async function criarAdministrador() {
  const nome = process.env.ADMIN_NOME;
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;

  if (!nome || !email || !senha) {
    console.error(
      "Defina ADMIN_NOME, ADMIN_EMAIL e ADMIN_SENHA no arquivo .env."
    );

    process.exit(1);
  }

  try {
    const usuarioExistente = await pool.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (usuarioExistente.rows.length > 0) {
      console.log("Já existe um usuário com esse e-mail.");
      return;
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    await pool.query(
      `INSERT INTO usuarios
       (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4)`,
      [nome, email, senhaHash, "administrador"]
    );

    console.log("Administrador criado com sucesso.");
  } catch (erro) {
    console.error("Erro ao criar administrador:", erro);
  } finally {
    await pool.end();
  }
}

criarAdministrador();