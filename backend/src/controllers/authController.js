const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

async function login(req, res) {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        mensagem: "E-mail e senha são obrigatórios.",
      });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, senha_hash, perfil, ativo
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        mensagem: "E-mail ou senha inválidos.",
      });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({
        mensagem: "Usuário desativado.",
      });
    }

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        mensagem: "E-mail ou senha inválidos.",
      });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        perfil: usuario.perfil,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    await registrarLog({
  usuarioId: usuario.id,
  acao: "LOGIN",
  entidade: "usuarios",
  registroId: usuario.id,
  ip: req.ip,
});

    return res.status(200).json({
      mensagem: "Login realizado com sucesso.",
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    });
  } catch (erro) {
    console.error("Erro no login:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

module.exports = {
  login,
};