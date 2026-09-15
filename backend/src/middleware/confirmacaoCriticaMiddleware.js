const bcrypt = require("bcrypt");
const pool = require("../database/connection");

async function confirmarOperacaoCritica(req, res, next) {
  try {
    const senhaConfirmacao = req.headers["x-confirm-password"];

    if (!senhaConfirmacao) {
      return res.status(400).json({
        mensagem:
          "Esta operação é crítica. Confirme sua senha para continuar.",
        confirmacaoNecessaria: true,
      });
    }

    const resultado = await pool.query(
      `SELECT senha_hash
       FROM usuarios
       WHERE id = $1 AND ativo = TRUE`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        mensagem: "Usuário não encontrado ou desativado.",
      });
    }

    const senhaCorreta = await bcrypt.compare(
      senhaConfirmacao,
      resultado.rows[0].senha_hash
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        mensagem: "Senha de confirmação incorreta.",
        confirmacaoNecessaria: true,
      });
    }

    next();
  } catch (erro) {
    console.error("Erro na confirmação da operação crítica:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

module.exports = confirmarOperacaoCritica;