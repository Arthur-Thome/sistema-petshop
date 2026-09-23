const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const {
  validarCPF,
  formatarCPF,
} = require("../utils/cpf");

/*
 * Normaliza os campos textuais de um tutor antes
 * das validações e da gravação no banco.
 *
 * Senhas não existem neste cadastro, portanto todos
 * os campos tratados aqui podem ter espaços externos
 * removidos com segurança.
 */
function normalizarDadosTutor(dados) {
  const normalizarTexto = (valor) => {
    if (typeof valor !== "string") {
      return "";
    }

    return valor.trim();
  };

  return {
    nome: normalizarTexto(dados.nome),
    cpf: normalizarTexto(dados.cpf),
    telefone: normalizarTexto(dados.telefone),

    email: normalizarTexto(
      dados.email
    ).toLowerCase(),

    endereco: normalizarTexto(dados.endereco),
    numero: normalizarTexto(dados.numero),
    complemento: normalizarTexto(
      dados.complemento
    ),
    bairro: normalizarTexto(dados.bairro),
    cidade: normalizarTexto(dados.cidade),

    estado: normalizarTexto(
      dados.estado
    ).toUpperCase(),

    cep: normalizarTexto(dados.cep),
    observacoes: normalizarTexto(
      dados.observacoes
    ),
  };
}

/*
 * Mantém as mesmas regras de tamanho no cadastro
 * e na edição de tutores.
 */
function validarDadosTutor(dados) {
  if (
    !dados.nome ||
    !dados.telefone ||
    !dados.endereco
  ) {
    return "Nome, telefone e endereço são obrigatórios.";
  }

  const limites = [
    ["nome", 150, "Nome"],
    ["cpf", 20, "CPF"],
    ["telefone", 30, "Telefone"],
    ["email", 255, "E-mail"],
    ["endereco", 255, "Endereço"],
    ["numero", 30, "Número"],
    ["complemento", 150, "Complemento"],
    ["bairro", 150, "Bairro"],
    ["cidade", 150, "Cidade"],
    ["estado", 2, "Estado"],
    ["cep", 20, "CEP"],
    ["observacoes", 2000, "Observações"],
  ];

  for (const [
    campo,
    limite,
    nomeCampo,
  ] of limites) {
    if (
      dados[campo] &&
      dados[campo].length > limite
    ) {
      return `${nomeCampo} deve possuir no máximo ${limite} caracteres.`;
    }
  }

  /*
   * Quando o estado for informado, exigimos uma UF
   * brasileira no formato de duas letras.
   *
   * Neste momento validamos o formato; não estamos
   * alterando a lógica do formulário/ViaCEP.
   */
  if (
    dados.estado &&
    !/^[A-Z]{2}$/.test(dados.estado)
  ) {
    return "Estado deve ser informado com uma UF de 2 letras.";
  }

  return null;
}

// Cadastra o responsável pelo pet.
// CPF é opcional, mas quando informado deve passar pela
// validação e normalização antes de chegar ao banco.
async function cadastrarTutor(req, res) {
  try {
    const dados =
      normalizarDadosTutor(req.body);

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
    } = dados;

    const erroValidacao =
      validarDadosTutor(dados);

    if (erroValidacao) {
      return res.status(400).json({
        mensagem: erroValidacao,
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
    /*
    * O banco também protege a unicidade do CPF.
    * Esta verificação trata inclusive duas tentativas
    * simultâneas de cadastrar o mesmo documento.
    */
    if (erro.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Já existe um tutor cadastrado com este CPF.",
      });
    }
    console.error("Erro ao cadastrar tutor:", erro);

    return res.status(500).json({
      mensagem: "Erro interno do servidor.",
    });
  }
}

// Lista tutores e permite pesquisa parcial por dados principais.
async function listarTutores(req, res) {
  try {
    let { busca } = req.query;

    /*
    * A busca é opcional, mas quando informada removemos
    * espaços externos e limitamos seu tamanho para evitar
    * consultas desnecessariamente grandes.
    */
    if (typeof busca === "string") {
      busca = busca.trim();

      if (busca.length > 100) {
        return res.status(400).json({
          mensagem:
            "A busca deve possuir no máximo 100 caracteres.",
        });
      }
    } else {
      busca = "";
    }

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
    /*
    * IDs recebidos pela URL precisam representar
    * números inteiros positivos.
    */
    const tutorId = Number(req.params.id);

    if (
      !Number.isInteger(tutorId) ||
      tutorId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de tutor inválido.",
      });
    }

    const resultado = await pool.query(
      `SELECT *
       FROM tutores
       WHERE id = $1`,
      [tutorId]
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
    const tutorId = Number(req.params.id);

    if (
      !Number.isInteger(tutorId) ||
      tutorId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de tutor inválido.",
      });
    }
      const dados =
        normalizarDadosTutor(req.body);

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
      } = dados;

      const erroValidacao =
        validarDadosTutor(dados);

      if (erroValidacao) {
        return res.status(400).json({
          mensagem: erroValidacao,
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
      [tutorId]
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
          [cpfFormatado, tutorId]
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
        tutorId,
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
    if (erro.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Já existe outro tutor cadastrado com este CPF.",
      });
    }
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
    const tutorId = Number(req.params.id);
    const { ativo } = req.body;

    if (
      !Number.isInteger(tutorId) ||
      tutorId <= 0
    ) {
      return res.status(400).json({
        mensagem: "ID de tutor inválido.",
      });
    }

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem: "O campo ativo deve ser true ou false.",
      });
    }

    const resultadoAnterior = await pool.query(
      `SELECT *
       FROM tutores
       WHERE id = $1`,
      [tutorId]
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
      [ativo, tutorId]
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