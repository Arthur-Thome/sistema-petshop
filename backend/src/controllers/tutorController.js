const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const {
  validarCPF,
  formatarCPF,
} = require("../utils/cpf");

// Cadastra o responsável pelo pet.
// CPF é opcional, mas quando informado deve passar pela
// validação e normalização antes de chegar ao banco.
async function cadastrarTutor(req, res) {
  try {
    const {
      nome,
      cpf,
      telefone,
      email,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      observacoes,
    } = req.body;

    if (!nome || !telefone || !endereco) {
      return res.status(400).json({
        mensagem: "Nome, telefone e endereço são obrigatórios.",
      });
    }

    // CPF é opcional, mas, quando informado, precisa ser válido.
    if (cpf && !validarCPF(cpf)) {
      return res.status(400).json({
        mensagem: "CPF inválido.",
      });
    }

    const cpfFormatado = cpf
      ? formatarCPF(cpf)
      : null;

    if (cpfFormatado) {
      const cpfExistente = await pool.query(
        "SELECT id FROM tutores WHERE cpf = $1",
        [cpfFormatado]
    );

      if (cpfExistente.rows.length > 0) {
        return res.status(409).json({
          mensagem: "Já existe um tutor cadastrado com este CPF.",
        });
      }
    }

    const resultado = await pool.query(
      `INSERT INTO tutores
      (
        nome,
        cpf,
        telefone,
        email,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep,
        observacoes
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        nome,
        cpfFormatado,
        telefone,
        email || null,
        endereco,
        numero || null,
        complemento || null,
        bairro || null,
        cidade || null,
        estado || null,
        cep || null,
        observacoes || null,
      ]
    );

    const tutor = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_TUTOR",
      entidade: "tutores",
      registroId: tutor.id,
      valorNovo: tutor,
      ip: req.ip,
    });

    return res.status(201).json({
      mensagem: "Tutor cadastrado com sucesso.",
      tutor,
    });
  } catch (erro) {
    console.error("Erro ao cadastrar tutor:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

// Lista tutores e permite pesquisa parcial por dados principais.
async function listarTutores(req, res) {
  try {
    const { busca } = req.query;

    let consulta = `
      SELECT *
      FROM tutores
    `;

    const parametros = [];

    if (busca) {
      consulta += `
        WHERE
          nome ILIKE $1
          OR cpf ILIKE $1
          OR telefone ILIKE $1
          OR email ILIKE $1
      `;

      parametros.push(`%${busca}%`);
    }

    consulta += " ORDER BY nome ASC";

    const resultado = await pool.query(
      consulta,
      parametros
    );

    return res.status(200).json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao listar tutores:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

// Recupera a ficha completa utilizada na página de detalhes
// e no preenchimento do formulário de edição.
async function buscarTutorPorId(req, res) {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `SELECT *
       FROM tutores
       WHERE id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Tutor não encontrado.",
      });
    }

    return res.status(200).json(resultado.rows[0]);
  } catch (erro) {
    console.error("Erro ao buscar tutor:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

// Atualiza os dados e registra os estados anterior e novo
// para manter uma trilha completa da alteração.
async function atualizarTutor(req, res) {
  try {
    const { id } = req.params;

    const {
      nome,
      cpf,
      telefone,
      email,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      observacoes,
    } = req.body;

    if (!nome || !telefone || !endereco) {
      return res.status(400).json({
        mensagem: "Nome, telefone e endereço são obrigatórios.",
      });
    }

    // Aplica exatamente a mesma regra utilizada no cadastro.
    if (cpf && !validarCPF(cpf)) {
      return res.status(400).json({
        mensagem: "CPF inválido.",
      });
    }

    const cpfFormatado = cpf
      ? formatarCPF(cpf)
      : null;

    const resultadoAnterior = await pool.query(
      `SELECT *
       FROM tutores
       WHERE id = $1`,
      [id]
    );

    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Tutor não encontrado.",
      });
    }

    if (cpfFormatado) {
        const cpfExistente = await pool.query(
          `SELECT id
          FROM tutores
          WHERE cpf = $1
            AND id <> $2`,
          [cpfFormatado, id]
      );

      if (cpfExistente.rows.length > 0) {
        return res.status(409).json({
          mensagem: "Já existe outro tutor cadastrado com este CPF.",
        });
      }
    }

    const anterior = resultadoAnterior.rows[0];

    const resultado = await pool.query(
      `UPDATE tutores
       SET
         nome = $1,
         cpf = $2,
         telefone = $3,
         email = $4,
         endereco = $5,
         numero = $6,
         complemento = $7,
         bairro = $8,
         cidade = $9,
         estado = $10,
         cep = $11,
         observacoes = $12,
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [
        nome,
        cpfFormatado,
        telefone,
        email || null,
        endereco,
        numero || null,
        complemento || null,
        bairro || null,
        cidade || null,
        estado || null,
        cep || null,
        observacoes || null,
        id,
      ]
    );

    const atualizado = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "ALTERAR_TUTOR",
      entidade: "tutores",
      registroId: atualizado.id,
      valorAnterior: anterior,
      valorNovo: atualizado,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem: "Tutor atualizado com sucesso.",
      tutor: atualizado,
    });
  } catch (erro) {
    console.error("Erro ao atualizar tutor:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

// Tutores não são excluídos fisicamente.
// A inativação preserva histórico e futuros vínculos com pets,
// hospedagens, atendimentos e demais registros.
async function alterarStatusTutor(req, res) {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem: "O campo ativo deve ser true ou false.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT *
       FROM tutores
       WHERE id = $1`,
      [id]
    );

    if (resultadoAnterior.rows.length === 0) {
      return res.status(404).json({
        mensagem: "Tutor não encontrado.",
      });
    }

    const anterior = resultadoAnterior.rows[0];

    if (anterior.ativo === ativo) {
      return res.status(400).json({
        mensagem: ativo
          ? "Este tutor já está ativo."
          : "Este tutor já está inativo.",
      });
    }

    const resultado = await pool.query(
      `UPDATE tutores
       SET
         ativo = $1,
         atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [ativo, id]
    );

    const atualizado = resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: ativo ? "ATIVAR_TUTOR" : "DESATIVAR_TUTOR",
      entidade: "tutores",
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
        ? "Tutor ativado com sucesso."
        : "Tutor inativado com sucesso.",
      tutor: atualizado,
    });
  } catch (erro) {
    console.error("Erro ao alterar status do tutor:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

module.exports = {
  cadastrarTutor,
  listarTutores,
  buscarTutorPorId,
  atualizarTutor,
  alterarStatusTutor,
};