const bcrypt = require("bcrypt");
const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const {validarSenha,} = require("../utils/validarSenha");

// Cadastro de usuários é restrito pelas rotas aos perfis autorizados.
// A senha é transformada em hash antes de qualquer gravação.
async function cadastrarUsuario(req, res) {
  try {
    let {
      nome,
      email,
      senha,
      perfil,
    } = req.body;


    /*
    * Normalizamos os dados textuais antes das validações
    * e antes de qualquer consulta ao banco.
    *
    * O nome mantém sua capitalização original, enquanto
    * o e-mail é armazenado sempre em letras minúsculas.
    */
    nome = nome?.trim();

    email = email
      ?.trim()
      .toLowerCase();

    perfil = perfil
      ?.trim()
      .toLowerCase();

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        mensagem: "Nome, e-mail, senha e perfil são obrigatórios.",
      });
    }

    /*
    * Os limites também evitam que entradas excessivamente
    * grandes cheguem desnecessariamente ao banco de dados.
    */
    if (nome.length > 150) {
      return res.status(400).json({
        mensagem:
          "O nome deve possuir no máximo 150 caracteres.",
      });
    }

    if (email.length > 255) {
      return res.status(400).json({
        mensagem:
          "O e-mail deve possuir no máximo 255 caracteres.",
      });
    }

    const perfisPermitidos = [
      "administrador",
      "gerente",
      "funcionario",
    ];

    if (!perfisPermitidos.includes(perfil)) {
      return res.status(400).json({
        mensagem: "Perfil inválido.",
      });
    }

    const validacaoSenha =
      validarSenha(senha);

    if (!validacaoSenha.valida) {
      return res.status(400).json({
        mensagem:
          validacaoSenha.mensagem,
      });
    }

    const existente = await pool.query(
      "SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        mensagem: "Já existe um usuário com esse e-mail.",
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const resultado = await pool.query(
      `INSERT INTO usuarios
       (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, perfil, ativo, criado_em`,
      [nome, email, senhaHash, perfil]
    );

    const novoUsuario = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_USUARIO",
      entidade: "usuarios",
      registroId: novoUsuario.id,
      valorNovo: {
        nome: novoUsuario.nome,
        email: novoUsuario.email,
        perfil: novoUsuario.perfil,
        ativo: novoUsuario.ativo,
      },
      ip: req.ip,
    });

    return res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso.",
      usuario: novoUsuario,
    });
  } catch (erro) {
    console.error("Erro ao cadastrar usuário:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

async function listarUsuarios(req, res) {
  try {
    const resultado = await pool.query(
      `SELECT
         id,
         nome,
         email,
         perfil,
         ativo,
         criado_em,
         atualizado_em
       FROM usuarios
       ORDER BY nome`
    );

    return res.status(200).json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao listar usuários:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

async function alterarPerfil(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const { perfil } = req.body;

    /*
    * IDs recebidos pela URL precisam representar
    * um número inteiro positivo válido.
    */
    if (
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de usuário inválido.",
      });
    }

    const perfisPermitidos = [
      "administrador",
      "gerente",
      "funcionario",
    ];

    if (!perfisPermitidos.includes(perfil)) {
      return res.status(400).json({
        mensagem: "Perfil inválido.",
      });
    }

    if (usuarioId === req.usuario.id) {
      return res.status(400).json({
        mensagem: "Você não pode alterar o seu próprio perfil.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT id, nome, email, perfil, ativo
       FROM usuarios
       WHERE id = $1`,
      [usuarioId]
    );

    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    const anterior = resultadoAnterior.rows[0];

    if (
  anterior.perfil === "administrador" &&
  perfil !== "administrador" &&
  anterior.ativo
) {
  const administradores = await pool.query(
    `SELECT COUNT(*) AS total
     FROM usuarios
     WHERE perfil = 'administrador'
       AND ativo = TRUE`
  );

  if (Number(administradores.rows[0].total) <= 1) {
    return res.status(400).json({
      mensagem:
        "Não é possível alterar o perfil do último administrador ativo.",
    });
  }
}

    const resultado = await pool.query(
      `UPDATE usuarios
       SET perfil = $1,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, nome, email, perfil, ativo, atualizado_em`,
      [perfil, usuarioId]
    );

    const atualizado = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "ALTERAR_PERFIL_USUARIO",
      entidade: "usuarios",
      registroId: atualizado.id,
      valorAnterior: {
        perfil: anterior.perfil,
      },
      valorNovo: {
        perfil: atualizado.perfil,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem: "Perfil alterado com sucesso.",
      usuario: atualizado,
    });
  } catch (erro) {
    console.error("Erro ao alterar perfil:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

async function alterarStatus(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const { ativo } = req.body;

    if (
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de usuário inválido.",
      });
    }

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem: "O campo ativo deve ser true ou false.",
      });
    }

    if (usuarioId === req.usuario.id) {
      return res.status(400).json({
        mensagem: "Você não pode alterar o status da sua própria conta.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT id, nome, email, perfil, ativo
       FROM usuarios
       WHERE id = $1`,
      [usuarioId]
    );

    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    const anterior = resultadoAnterior.rows[0];

    if (
  anterior.perfil === "administrador" &&
  anterior.ativo &&
  ativo === false
) {
  const administradores = await pool.query(
    `SELECT COUNT(*) AS total
     FROM usuarios
     WHERE perfil = 'administrador'
       AND ativo = TRUE`
  );

  if (Number(administradores.rows[0].total) <= 1) {
    return res.status(400).json({
      mensagem:
        "Não é possível desativar o último administrador ativo.",
    });
  }
}

    const resultado = await pool.query(
      `UPDATE usuarios
       SET ativo = $1,
           atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, nome, email, perfil, ativo, atualizado_em`,
      [ativo, usuarioId]
    );

    const atualizado = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: ativo ? "ATIVAR_USUARIO" : "DESATIVAR_USUARIO",
      entidade: "usuarios",
      registroId: atualizado.id,
      valorAnterior: {
        ativo: anterior.ativo,
      },
      valorNovo: {
        ativo: atualizado.ativo,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem: ativo
        ? "Usuário ativado com sucesso."
        : "Usuário desativado com sucesso.",
      usuario: atualizado,
    });
  } catch (erro) {
    console.error("Erro ao alterar status:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

/*
 * Permite que um administrador defina uma nova senha para um usuário.
 *
 * A autorização administrativa e a confirmação da senha do próprio
 * administrador são realizadas pelos middlewares da rota.
 *
 * A nova senha nunca é registrada nos logs de auditoria.
 */
async function redefinirSenhaUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const { nova_senha } = req.body;

    if (
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de usuário inválido.",
      });
    }

    const validacaoSenha =
      validarSenha(nova_senha);

    if (!validacaoSenha.valida) {
      return res.status(400).json({
        mensagem:
          validacaoSenha.mensagem,
      });
    }

    const resultadoUsuario = await pool.query(
      `SELECT id, nome, email, perfil, ativo
       FROM usuarios
       WHERE id = $1`,
      [usuarioId]
    );

    if (resultadoUsuario.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    const usuario = resultadoUsuario.rows[0];

    const senhaHash = await bcrypt.hash(
      nova_senha,
      12
    );

    /*
     * Incrementar versao_sessao invalida imediatamente todos
     * os JWTs emitidos anteriormente para este usuário.
     */
    await pool.query(
      `UPDATE usuarios
       SET
         senha_hash = $1,
         versao_sessao = versao_sessao + 1,
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [
        senhaHash,
        usuarioId,
      ]
    );

    /*
     * Tokens de recuperação de senha ainda pendentes também
     * deixam de ser válidos depois da redefinição administrativa.
     */
    await pool.query(
      `UPDATE recuperacoes_senha
       SET utilizado_em = CURRENT_TIMESTAMP
       WHERE usuario_id = $1
         AND utilizado_em IS NULL`,
      [usuarioId]
    );

    /*
     * Registramos quem realizou a operação e qual conta foi
     * afetada, mas nunca a senha ou seu hash.
     */
    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "REDEFINIR_SENHA_USUARIO",
      entidade: "usuarios",
      registroId: usuario.id,
      valorNovo: {
        senha_redefinida: true,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Senha do usuário redefinida com sucesso.",
    });
  } catch (erro) {
    console.error(
      "Erro ao redefinir senha do usuário:",
      erro
    );

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

/*
 * Retorna os dados administrativos de um único usuário.
 *
 * A rota que utiliza esta função é restrita ao administrador,
 * portanto estes dados não ficam disponíveis para os demais perfis.
 */
async function buscarUsuarioPorId(req, res) {
  try {
    const { id } = req.params;

    const usuarioId = Number(id);

    if (
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de usuário inválido.",
      });
    }

    const resultado = await pool.query(
      `SELECT
         id,
         nome,
         email,
         perfil,
         ativo,
         criado_em,
         atualizado_em
       FROM usuarios
       WHERE id = $1`,
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }

    return res.status(200).json({
      usuario: resultado.rows[0],
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar usuário:",
      erro
    );

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

/*
 * Altera os dados básicos de identificação de um usuário.
 *
 * A rota é exclusiva do administrador e exige confirmação
 * da senha do administrador antes de chegar ao controller.
 */
async function alterarDadosUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.id);

    let {
      nome,
      email,
    } = req.body;


    if (
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de usuário inválido.",
      });
    }


    nome = nome?.trim();

    email = email
      ?.trim()
      .toLowerCase();


    if (!nome || !email) {
      return res.status(400).json({
        mensagem:
          "Nome e e-mail são obrigatórios.",
      });
    }


    if (nome.length > 150) {
      return res.status(400).json({
        mensagem:
          "O nome deve possuir no máximo 150 caracteres.",
      });
    }


    if (email.length > 255) {
      return res.status(400).json({
        mensagem:
          "O e-mail deve possuir no máximo 255 caracteres.",
      });
    }


    /*
     * Primeiro buscamos o registro atual para permitir que
     * a auditoria registre o estado anterior da conta.
     */
    const resultadoAtual = await pool.query(
      `SELECT
         id,
         nome,
         email,
         perfil,
         ativo
       FROM usuarios
       WHERE id = $1`,
      [usuarioId]
    );


    if (resultadoAtual.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Usuário não encontrado.",
      });
    }


    const usuarioAnterior =
      resultadoAtual.rows[0];


    /*
     * O e-mail precisa continuar sendo único no sistema.
     * O próprio usuário é excluído da verificação.
     */
    const emailExistente = await pool.query(
      `SELECT id
       FROM usuarios
       WHERE LOWER(email) = LOWER($1)
         AND id <> $2
       LIMIT 1`,
      [
        email,
        usuarioId,
      ]
    );


    if (emailExistente.rows.length > 0) {
      return res.status(409).json({
        mensagem:
          "Já existe um usuário cadastrado com este e-mail.",
      });
    }


    const resultado = await pool.query(
      `UPDATE usuarios
       SET
         nome = $1,
         email = $2,
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING
         id,
         nome,
         email,
         perfil,
         ativo,
         criado_em,
         atualizado_em`,
      [
        nome,
        email,
        usuarioId,
      ]
    );


    const usuarioAtualizado =
      resultado.rows[0];


    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "ALTERAR_DADOS_USUARIO",
      entidade: "usuarios",
      registroId: usuarioId,

      valorAnterior: {
        nome: usuarioAnterior.nome,
        email: usuarioAnterior.email,
      },

      valorNovo: {
        nome: usuarioAtualizado.nome,
        email: usuarioAtualizado.email,
      },

      ip: req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Dados do usuário atualizados com sucesso.",

      usuario: usuarioAtualizado,
    });
  } catch (erro) {
    /*
     * Também tratamos a constraint UNIQUE do PostgreSQL.
     * Isso protege contra duas alterações simultâneas
     * tentando utilizar o mesmo e-mail.
     */
    if (erro.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Já existe um usuário cadastrado com este e-mail.",
      });
    }


    console.error(
      "Erro ao alterar dados do usuário:",
      erro
    );

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

module.exports = {
  cadastrarUsuario,
  listarUsuarios,
  alterarPerfil,
  alterarStatus,
  redefinirSenhaUsuario,
  buscarUsuarioPorId,
  alterarDadosUsuario,
};