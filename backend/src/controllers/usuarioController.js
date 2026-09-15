const bcrypt = require("bcrypt");
const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

async function cadastrarUsuario(req, res) {
  try {
    const { nome, email, senha, perfil } = req.body;

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        mensagem: "Nome, e-mail, senha e perfil são obrigatórios.",
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

    if (senha.length < 8) {
      return res.status(400).json({
        mensagem: "A senha deve possuir pelo menos 8 caracteres.",
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
    const { id } = req.params;
    const { perfil } = req.body;

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

    if (Number(id) === req.usuario.id) {
      return res.status(400).json({
        mensagem: "Você não pode alterar o seu próprio perfil.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT id, nome, email, perfil, ativo
       FROM usuarios
       WHERE id = $1`,
      [id]
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
      [perfil, id]
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
    const { id } = req.params;
    const { ativo } = req.body;

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem: "O campo ativo deve ser true ou false.",
      });
    }

    if (Number(id) === req.usuario.id) {
      return res.status(400).json({
        mensagem: "Você não pode alterar o status da sua própria conta.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT id, nome, email, perfil, ativo
       FROM usuarios
       WHERE id = $1`,
      [id]
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
      [ativo, id]
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

module.exports = {
  cadastrarUsuario,
  listarUsuarios,
  alterarPerfil,
  alterarStatus,
};