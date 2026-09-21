const jwt = require("jsonwebtoken");
const pool = require("../database/connection");


// Valida o JWT enviado no cabeçalho Authorization.
//
// Além de validar o token, consultamos novamente o usuário
// no banco em cada requisição protegida. Dessa forma,
// alterações de perfil ou desativação de conta passam a
// valer imediatamente, mesmo que exista um JWT ainda válido.

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      mensagem: "Token não informado.",
    });
  }

  const partes = authHeader.split(" ");

  if (partes.length !== 2 || partes[0] !== "Bearer") {
    return res.status(401).json({
      mensagem: "Token inválido.",
    });
  }

  const token = partes[1];

  try {
    // Verifica assinatura e expiração do token.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // O banco é a fonte atual da situação e das permissões do usuário.
    const resultado = await pool.query(
      `SELECT id, nome, email, perfil, ativo, versao_sessao
       FROM usuarios
       WHERE id = $1`,
      [decoded.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({
        mensagem: "Usuário desativado.",
      });
    }

    /*
    * Tokens emitidos antes de uma alteração de segurança
    * deixam de ser aceitos quando a versão da sessão muda.
    */
    if (
      decoded.versaoSessao !==
      usuario.versao_sessao
    ) {
      return res.status(401).json({
        mensagem:
          "Sua sessão não é mais válida. Faça login novamente.",
      });
    }

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
    };

    return next();
  } catch (erro) {
    return res.status(401).json({
      mensagem: "Token inválido ou expirado.",
    });
  }
}

module.exports = autenticar;