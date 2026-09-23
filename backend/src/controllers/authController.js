const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../database/connection");
const crypto = require("crypto");
const { registrarLog } = require("../services/logService");
const { enviarEmail } = require("../services/emailService");
const {
  validarSenha,
} = require("../utils/validarSenha");
const {
  escapeHtml,
} = require("../utils/escapeHtml");


// Autentica o usuário e gera um JWT quando as credenciais
// estiverem corretas e a conta estiver ativa.
async function login(req, res) {
  try {
    let {
      email,
      senha,
    } = req.body;

    email = email
      ?.trim()
      .toLowerCase();

    if (!email || !senha) {
      return res.status(400).json({
        mensagem: "E-mail e senha são obrigatórios.",
      });
    }

    if (email.length > 255) {
      return res.status(400).json({
        mensagem:
          "O e-mail deve possuir no máximo 255 caracteres.",
      });
    }

    const resultado = await pool.query(
      `SELECT id, nome, email, senha_hash, perfil, ativo, versao_sessao
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

    /*
    * A versão escapada é utilizada somente no HTML.
    *
    * No conteúdo de texto simples podemos continuar usando
    * o nome original do usuário.
    */
    const nomeUsuarioHtml =
      escapeHtml(usuario.nome);

    if (!usuario.ativo) {
      return res.status(403).json({
        mensagem: "Usuário desativado.",
      });
    }

    // A senha recebida é comparada diretamente com o hash.
    // A senha original nunca é armazenada.
    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        mensagem: "E-mail ou senha inválidos.",
      });
    }
    /*
    * A versão da sessão permite invalidar JWTs já emitidos.
    * Se ela mudar no banco, tokens antigos deixam de ser aceitos.
    */
    const token = jwt.sign(
      {
        id: usuario.id,
        perfil: usuario.perfil,
        versaoSessao: usuario.versao_sessao,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:
          process.env.JWT_EXPIRES_IN || "8h",
        algorithm: "HS256",
      }
    );
    // Registra o login bem-sucedido para fins de auditoria.
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

/*
 * Inicia a recuperação de senha.
 *
 * A resposta é propositalmente a mesma independentemente
 * de o e-mail existir ou não. Isso evita que a rota seja
 * utilizada para descobrir contas cadastradas no sistema.
 */
async function solicitarRecuperacaoSenha(req, res) {
  try {
    let {
      email,
    } = req.body;

    email = email
      ?.trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        mensagem: "E-mail é obrigatório.",
      });
    }

    if (email.length > 255) {
      return res.status(400).json({
        mensagem:
          "O e-mail deve possuir no máximo 255 caracteres.",
      });
    }

    const mensagemResposta =
      "Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.";

    const resultado = await pool.query(
      `SELECT id, nome, email, ativo
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    /*
     * Não informamos ao solicitante se a conta existe,
     * está desativada ou não pode utilizar a recuperação.
     */
    if (
      resultado.rows.length === 0 ||
      !resultado.rows[0].ativo
    ) {
      return res.status(200).json({
        mensagem: mensagemResposta,
      });
    }

    const usuario = resultado.rows[0];

    /*
    * O nome escapado é utilizado somente no conteúdo HTML
    * do e-mail para impedir interpretação de tags HTML.
    */
    const nomeUsuarioHtml =
      escapeHtml(usuario.nome);

    /*
     * Gera um token aleatório criptograficamente seguro.
     *
     * O token original será enviado somente por e-mail.
     * No banco armazenamos apenas o SHA-256 dele.
     */
    const token = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    /*
     * Tokens anteriores ainda não utilizados são
     * invalidados quando uma nova recuperação é solicitada.
     */
    await pool.query(
      `UPDATE recuperacoes_senha
       SET utilizado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = $1
         AND utilizado_em IS NULL`,
      [usuario.id]
    );

    /*
     * O token será válido por 30 minutos.
     */
    await pool.query(
      `INSERT INTO recuperacoes_senha
       (
         usuario_id,
         token_hash,
         expira_em
       )
       VALUES (
         $1,
         $2,
         CURRENT_TIMESTAMP + INTERVAL '30 minutes'
       )`,
      [
        usuario.id,
        tokenHash,
      ]
    );

    const frontendUrl =
      process.env.FRONTEND_URL ||
      "http://localhost:5173";

    const linkRecuperacao =
      `${frontendUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;

    try {
      await enviarEmail({
        para: usuario.email,

        assunto:
          "Redefinição de senha - Sistema Pet Shop",

        texto:
          `Olá, ${nomeUsuarioHtml}.\n\n` +
          `Recebemos uma solicitação para redefinir sua senha.\n\n` +
          `Acesse o link abaixo:\n${linkRecuperacao}\n\n` +
          `O link é válido por 30 minutos e pode ser utilizado apenas uma vez.\n\n` +
          `Se você não solicitou a alteração, ignore este e-mail.`,

        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Redefinição de senha</h2>

            <p>
              Olá, ${usuario.nome}.
            </p>

            <p>
              Recebemos uma solicitação para redefinir
              sua senha no Sistema Pet Shop.
            </p>

            <p>
              <a
                href="${linkRecuperacao}"
                style="
                  display: inline-block;
                  padding: 12px 18px;
                  background: #333333;
                  color: #ffffff;
                  text-decoration: none;
                  border-radius: 6px;
                "
              >
                Redefinir minha senha
              </a>
            </p>

            <p>
              Este link é válido por
              <strong>30 minutos</strong> e pode ser
              utilizado apenas uma vez.
            </p>

            <p>
              Se você não solicitou a alteração,
              ignore este e-mail.
            </p>
          </div>
        `,
      });
    } catch (erroEmail) {
      /*
       * Se o envio falhar, invalidamos o token criado.
       * Assim não deixamos uma recuperação válida que
       * nunca chegou ao usuário.
       */
      await pool.query(
        `UPDATE recuperacoes_senha
         SET utilizado_em = CURRENT_TIMESTAMP
         WHERE token_hash = $1
           AND utilizado_em IS NULL`,
        [tokenHash]
      );

      console.error(
        "Erro ao enviar recuperação de senha:",
        erroEmail
      );

      /*
       * Mantemos a resposta genérica para não revelar
       * informações sobre a existência da conta.
       */
      return res.status(200).json({
        mensagem: mensagemResposta,
      });
    }

    /*
     * Registramos a solicitação sem salvar o token
     * original ou seu hash na trilha de auditoria.
     */
    await registrarLog({
      usuarioId: usuario.id,
      acao: "SOLICITAR_RECUPERACAO_SENHA",
      entidade: "usuarios",
      registroId: usuario.id,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem: mensagemResposta,
    });
  } catch (erro) {
    console.error(
      "Erro ao solicitar recuperação de senha:",
      erro
    );

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

/*
 * Redefine a senha utilizando um token temporário.
 *
 * O token recebido nunca é procurado diretamente no banco.
 * Calculamos seu SHA-256 e comparamos com o hash armazenado.
 *
 * A operação utiliza transação para garantir que a alteração
 * da senha e o consumo do token aconteçam juntas.
 */
async function redefinirSenha(req, res) {
  const client = await pool.connect();

  try {
    const {
      token,
      nova_senha,
    } = req.body;

    const validacaoSenha =
      validarSenha(nova_senha);

    if (!validacaoSenha.valida) {
      return res.status(400).json({
        mensagem:
          validacaoSenha.mensagem,
      });
    }

    if (!token || !nova_senha) {
      return res.status(400).json({
        mensagem:
          "Token e nova senha são obrigatórios.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await client.query("BEGIN");

    /*
     * FOR UPDATE bloqueia este registro durante a transação.
     *
     * Isso evita que duas requisições simultâneas consigam
     * utilizar o mesmo token de recuperação.
     */
    const resultado =
      await client.query(
        `SELECT
           r.id,
           r.usuario_id,
           r.expira_em,
           r.utilizado_em,
           u.ativo
         FROM recuperacoes_senha r
         INNER JOIN usuarios u
           ON u.id = r.usuario_id
         WHERE r.token_hash = $1
         FOR UPDATE`,
        [tokenHash]
      );

    if (resultado.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Link de redefinição inválido ou expirado.",
      });
    }

    const recuperacao =
      resultado.rows[0];

    /*
     * Um token utilizado, expirado ou pertencente a uma
     * conta desativada não pode alterar a senha.
     */
    const expirado =
      new Date(recuperacao.expira_em) <=
      new Date();

    if (
      recuperacao.utilizado_em ||
      expirado ||
      !recuperacao.ativo
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Link de redefinição inválido ou expirado.",
      });
    }

    /*
     * A senha nunca é armazenada em texto puro.
     */
    const novoHash =
      await bcrypt.hash(
        nova_senha,
        12
      );

    /*
    * Além de trocar a senha, incrementamos a versão da sessão.
    * Todos os JWTs emitidos anteriormente para este usuário
    * passam a ser inválidos imediatamente.
    */
    await client.query(
      `UPDATE usuarios
      SET
        senha_hash = $1,
        versao_sessao = versao_sessao + 1,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $2`,
      [
        novoHash,
        recuperacao.usuario_id,
      ]
    );

    /*
     * O token utilizado é marcado dentro da mesma transação.
     * Dessa forma ele não poderá ser reutilizado.
     */
    await client.query(
      `UPDATE recuperacoes_senha
       SET utilizado_em = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [recuperacao.id]
    );

    /*
     * Também invalidamos qualquer outra recuperação aberta
     * para este usuário.
     */
    await client.query(
      `UPDATE recuperacoes_senha
       SET utilizado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = $1
         AND utilizado_em IS NULL`,
      [recuperacao.usuario_id]
    );

    await client.query("COMMIT");

    /*
     * Nunca registramos a senha nova, seu hash ou o token
     * nos logs de auditoria.
     */
    await registrarLog({
      usuarioId:
        recuperacao.usuario_id,
      acao:
        "REDEFINIR_SENHA",
      entidade:
        "usuarios",
      registroId:
        recuperacao.usuario_id,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Senha redefinida com sucesso.",
    });
  } catch (erro) {
    try {
      await client.query("ROLLBACK");
    } catch (erroRollback) {
      console.error(
        "Erro ao desfazer transação:",
        erroRollback
      );
    }

    console.error(
      "Erro ao redefinir senha:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  } finally {
    client.release();
  }
}

module.exports = {
  login,
  solicitarRecuperacaoSenha,
  redefinirSenha,
};