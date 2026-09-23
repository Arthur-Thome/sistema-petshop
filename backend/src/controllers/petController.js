const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const fs = require("fs");
const path = require("path");

/*
 * Remove somente arquivos localizados dentro da pasta
 * destinada às fotos dos pets.
 *
 * path.basename impede que um caminho armazenado no banco
 * seja utilizado para acessar diretórios externos.
 */
function removerArquivoFoto(caminhoFoto) {
  if (!caminhoFoto) {
    return;
  }

  try {
    const nomeArquivo =
      path.basename(caminhoFoto);

    const caminhoCompleto =
      path.resolve(
        __dirname,
        "../uploads/pets",
        nomeArquivo
      );

    if (fs.existsSync(caminhoCompleto)) {
      fs.unlinkSync(caminhoCompleto);
    }
  } catch (error) {
    console.error(
      "Não foi possível remover arquivo de foto:",
      error
    );
  }
}


/*
 * Normaliza os campos textuais antes das validações
 * e da gravação no banco.
 *
 * Campos opcionais vazios são mantidos como string vazia
 * durante a validação e convertidos para null no INSERT/UPDATE.
 */
function normalizarDadosPet(dados) {
  const normalizarTexto = (valor) => {
    if (typeof valor !== "string") {
      return "";
    }

    return valor.trim();
  };

  return {
    tutor_id: dados.tutor_id,

    nome:
      normalizarTexto(dados.nome),

    especie:
      normalizarTexto(dados.especie),

    raca:
      normalizarTexto(dados.raca),

    sexo:
      normalizarTexto(
        dados.sexo
      ).toLowerCase(),

    data_nascimento:
      normalizarTexto(
        dados.data_nascimento
      ),

    peso:
      dados.peso,

    cor:
      normalizarTexto(dados.cor),

    observacoes:
      normalizarTexto(
        dados.observacoes
      ),
  };
}


/*
 * Valida uma data no formato YYYY-MM-DD sem depender
 * apenas da conversão automática feita pelo JavaScript.
 */
function dataValida(data) {
  if (!data) {
    return true;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data)
  ) {
    return false;
  }

  const [
    ano,
    mes,
    dia,
  ] = data
    .split("-")
    .map(Number);

  const dataCriada =
    new Date(
      Date.UTC(
        ano,
        mes - 1,
        dia
      )
    );

  return (
    dataCriada.getUTCFullYear() === ano &&
    dataCriada.getUTCMonth() ===
      mes - 1 &&
    dataCriada.getUTCDate() === dia
  );
}


/*
 * Impede datas de nascimento futuras.
 *
 * A comparação utiliza somente YYYY-MM-DD para evitar
 * diferenças causadas por horário ou fuso.
 */
function dataNascimentoFutura(data) {
  if (!data) {
    return false;
  }

  const hoje =
    new Date()
      .toISOString()
      .slice(0, 10);

  return data > hoje;
}


/*
 * Mantém as mesmas regras de validação tanto no cadastro
 * quanto na edição do pet.
 */
function validarDadosPet(dados) {
  const tutorId =
    Number(dados.tutor_id);

  if (
    !Number.isInteger(tutorId) ||
    tutorId <= 0
  ) {
    return {
      erro: "ID de tutor inválido.",
    };
  }

  if (
    !dados.nome ||
    !dados.especie
  ) {
    return {
      erro:
        "Tutor, nome e espécie são obrigatórios.",
    };
  }

  const limites = [
    ["nome", 150, "Nome"],
    ["especie", 100, "Espécie"],
    ["raca", 150, "Raça"],
    ["cor", 100, "Cor"],
    [
      "observacoes",
      2000,
      "Observações",
    ],
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
      return {
        erro:
          `${nomeCampo} deve possuir no máximo ${limite} caracteres.`,
      };
    }
  }

  const sexosPermitidos = [
    "macho",
    "femea",
  ];

  if (
    dados.sexo &&
    !sexosPermitidos.includes(
      dados.sexo
    )
  ) {
    return {
      erro: "Sexo inválido.",
    };
  }

  if (
    dados.data_nascimento &&
    !dataValida(
      dados.data_nascimento
    )
  ) {
    return {
      erro:
        "Data de nascimento inválida.",
    };
  }

  if (
    dados.data_nascimento &&
    dataNascimentoFutura(
      dados.data_nascimento
    )
  ) {
    return {
      erro:
        "A data de nascimento não pode ser futura.",
    };
  }

  let pesoNormalizado = null;

  if (
    dados.peso !== null &&
    dados.peso !== undefined &&
    dados.peso !== ""
  ) {
    pesoNormalizado =
      Number(dados.peso);

    if (
      !Number.isFinite(
        pesoNormalizado
      ) ||
      pesoNormalizado <= 0
    ) {
      return {
        erro:
          "O peso deve ser um número válido maior que zero.",
      };
    }

    /*
     * Limite defensivo para impedir valores evidentemente
     * incorretos sem restringir animais de grande porte.
     */
    if (pesoNormalizado > 1000) {
      return {
        erro:
          "O peso informado é inválido.",
      };
    }
  }

  return {
    erro: null,
    tutorId,
    pesoNormalizado,
  };
}


// Cadastra um pet e obrigatoriamente o relaciona a um tutor.
// O vínculo tutor-pet é validado no backend, portanto não
// dependemos apenas das opções apresentadas pelo frontend.
async function cadastrarPet(req, res) {
  try {
    const dados =
      normalizarDadosPet(req.body);

    const validacao =
      validarDadosPet(dados);

    if (validacao.erro) {
      return res.status(400).json({
        mensagem: validacao.erro,
      });
    }

    const {
      tutorId,
      pesoNormalizado,
    } = validacao;

    // Confirma que o tutor realmente existe antes de criar
    // o relacionamento entre os registros.
    const resultadoTutor =
      await pool.query(
        `SELECT id, nome, ativo
         FROM tutores
         WHERE id = $1`,
        [tutorId]
      );

    if (
      resultadoTutor.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Tutor não encontrado.",
      });
    }

    const tutor =
      resultadoTutor.rows[0];

    // Não permitimos novos pets em um tutor inativo.
    if (!tutor.ativo) {
      return res.status(400).json({
        mensagem:
          "Não é possível cadastrar um pet para um tutor inativo.",
      });
    }

    const resultado =
      await pool.query(
        `INSERT INTO pets
        (
          tutor_id,
          nome,
          especie,
          raca,
          sexo,
          data_nascimento,
          peso,
          cor,
          observacoes
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *`,
        [
          tutorId,
          dados.nome,
          dados.especie,
          dados.raca || null,
          dados.sexo || null,
          dados.data_nascimento ||
            null,
          pesoNormalizado,
          dados.cor || null,
          dados.observacoes || null,
        ]
      );

    const pet =
      resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "CRIAR_PET",
      entidade: "pets",
      registroId: pet.id,
      valorNovo: pet,
      ip: req.ip,
    });

    return res.status(201).json({
      mensagem:
        "Pet cadastrado com sucesso.",
      pet,
    });
  } catch (erro) {
    console.error(
      "Erro ao cadastrar pet:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


// Lista os pets juntamente com informações básicas do tutor.
// A pesquisa permite localizar pelo nome do pet, raça,
// espécie ou nome do tutor.
async function listarPets(req, res) {
  try {
    let { busca } = req.query;

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
      SELECT
        p.id,
        p.tutor_id,
        p.nome,
        p.especie,
        p.raca,
        p.sexo,
        p.data_nascimento,
        p.peso,
        p.cor,
        p.foto,
        p.ativo,
        p.criado_em,

        t.nome AS tutor_nome,
        t.telefone AS tutor_telefone

      FROM pets p

      INNER JOIN tutores t
        ON t.id = p.tutor_id
    `;

    const parametros = [];

    if (busca) {
      consulta += `
        WHERE
          p.nome ILIKE $1
          OR p.raca ILIKE $1
          OR p.especie ILIKE $1
          OR t.nome ILIKE $1
      `;

      parametros.push(
        `%${busca}%`
      );
    }

    consulta += `
      ORDER BY p.nome ASC
    `;

    const resultado =
      await pool.query(
        consulta,
        parametros
      );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar pets:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


// Recupera a ficha completa de um pet e também os dados
// principais do tutor responsável por ele.
async function buscarPetPorId(req, res) {
  try {
    const petId =
      Number(req.params.id);

    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de pet inválido.",
      });
    }

    const resultado =
      await pool.query(
        `SELECT
           p.*,

           t.nome AS tutor_nome,
           t.telefone AS tutor_telefone,
           t.email AS tutor_email,
           t.ativo AS tutor_ativo

         FROM pets p

         INNER JOIN tutores t
           ON t.id = p.tutor_id

         WHERE p.id = $1`,
        [petId]
      );

    if (
      resultado.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }

    return res.status(200).json({
      pet: resultado.rows[0],
    });
  } catch (erro) {
    console.error(
      "Erro ao buscar pet:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


// Atualiza os dados cadastrais do pet.
//
// Caso o tutor seja alterado durante a edição, o novo tutor
// também precisa existir e estar ativo.
async function atualizarPet(req, res) {
  try {
    const petId =
      Number(req.params.id);

    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de pet inválido.",
      });
    }

    const dados =
      normalizarDadosPet(req.body);

    const validacao =
      validarDadosPet(dados);

    if (validacao.erro) {
      return res.status(400).json({
        mensagem: validacao.erro,
      });
    }

    const {
      tutorId,
      pesoNormalizado,
    } = validacao;

    // Recuperamos o estado anterior para registrar
    // exatamente o que foi alterado no log.
    const resultadoAnterior =
      await pool.query(
        `SELECT *
         FROM pets
         WHERE id = $1`,
        [petId]
      );

    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }

    const petAnterior =
      resultadoAnterior.rows[0];

    // Confirma que o tutor selecionado existe.
    const resultadoTutor =
      await pool.query(
        `SELECT id, nome, ativo
         FROM tutores
         WHERE id = $1`,
        [tutorId]
      );

    if (
      resultadoTutor.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Tutor não encontrado.",
      });
    }

    const tutor =
      resultadoTutor.rows[0];

    /*
     * Permitimos manter o mesmo tutor de um cadastro antigo,
     * mas não transferir o pet para outro tutor inativo.
     */
    if (
      !tutor.ativo &&
      tutorId !==
        Number(
          petAnterior.tutor_id
        )
    ) {
      return res.status(400).json({
        mensagem:
          "Não é possível transferir o pet para um tutor inativo.",
      });
    }

    const resultado =
      await pool.query(
        `UPDATE pets
         SET
           tutor_id = $1,
           nome = $2,
           especie = $3,
           raca = $4,
           sexo = $5,
           data_nascimento = $6,
           peso = $7,
           cor = $8,
           observacoes = $9,
           atualizado_em = CURRENT_TIMESTAMP

         WHERE id = $10

         RETURNING *`,
        [
          tutorId,
          dados.nome,
          dados.especie,
          dados.raca || null,
          dados.sexo || null,
          dados.data_nascimento ||
            null,
          pesoNormalizado,
          dados.cor || null,
          dados.observacoes || null,
          petId,
        ]
      );

    const petAtualizado =
      resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: "ALTERAR_PET",
      entidade: "pets",
      registroId:
        petAtualizado.id,
      valorAnterior: petAnterior,
      valorNovo: petAtualizado,
      ip: req.ip,
    });

    return res.status(200).json({
      mensagem:
        "Pet atualizado com sucesso.",
      pet: petAtualizado,
    });
  } catch (erro) {
    console.error(
      "Erro ao atualizar pet:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


// Pets são inativados em vez de excluídos fisicamente.
//
// Essa estratégia preserva o histórico do animal e será
// importante para atendimentos, creche, hotel e demais
// registros vinculados ao animal.
async function alterarStatusPet(req, res) {
  try {
    const petId =
      Number(req.params.id);

    const { ativo } = req.body;

    if (
      !Number.isInteger(petId) ||
      petId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de pet inválido.",
      });
    }

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        mensagem:
          "O campo ativo deve ser verdadeiro ou falso.",
      });
    }

    const resultadoAnterior =
      await pool.query(
        `SELECT *
         FROM pets
         WHERE id = $1`,
        [petId]
      );

    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }

    const petAnterior =
      resultadoAnterior.rows[0];

    if (
      petAnterior.ativo === ativo
    ) {
      return res.status(400).json({
        mensagem: ativo
          ? "O pet já está ativo."
          : "O pet já está inativo.",
      });
    }

    const resultado =
      await pool.query(
        `UPDATE pets
         SET
           ativo = $1,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [ativo, petId]
      );

    const petAtualizado =
      resultado.rows[0];

    await registrarLog({
      usuarioId: req.usuario.id,
      acao: ativo
        ? "ATIVAR_PET"
        : "DESATIVAR_PET",
      entidade: "pets",
      registroId:
        petAtualizado.id,

      valorAnterior: {
        ativo: petAnterior.ativo,
      },

      valorNovo: {
        ativo:
          petAtualizado.ativo,
      },

      ip: req.ip,
    });

    return res.status(200).json({
      mensagem: ativo
        ? "Pet reativado com sucesso."
        : "Pet inativado com sucesso.",

      pet: petAtualizado,
    });
  } catch (erro) {
    console.error(
      "Erro ao alterar status do pet:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


// Atualiza a foto de um pet.
//
// Quando já existe uma foto anterior, ela é removida somente
// depois que o banco aceita a nova referência.
async function atualizarFotoPet(req, res) {
  const petId =
    Number(req.params.id);

  /*
   * O Multer executa antes do controller.
   * Portanto, quando chegamos aqui, o arquivo já foi
   * validado e armazenado no servidor.
   */
  if (!req.file) {
    return res.status(400).json({
      mensagem:
        "Nenhuma foto foi enviada.",
    });
  }

  const novaFoto =
    `/uploads/pets/${req.file.filename}`;

  /*
   * Como o arquivo já foi gravado pelo Multer,
   * precisamos removê-lo caso o ID seja inválido.
   */
  if (
    !Number.isInteger(petId) ||
    petId <= 0
  ) {
    removerArquivoFoto(novaFoto);

    return res.status(400).json({
      mensagem:
        "ID de pet inválido.",
    });
  }

  let bancoAtualizado = false;

  try {
    const resultadoAnterior =
      await pool.query(
        `SELECT *
         FROM pets
         WHERE id = $1`,
        [petId]
      );

    if (
      resultadoAnterior.rows.length ===
      0
    ) {
      removerArquivoFoto(
        novaFoto
      );

      return res.status(404).json({
        mensagem:
          "Pet não encontrado.",
      });
    }

    const petAnterior =
      resultadoAnterior.rows[0];

    const resultado =
      await pool.query(
        `UPDATE pets
         SET
           foto = $1,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [
          novaFoto,
          petId,
        ]
      );

    const petAtualizado =
      resultado.rows[0];

    /*
     * A partir deste ponto o banco já aponta para
     * a nova imagem. Ela não deve mais ser removida
     * pelo tratamento de erro.
     */
    bancoAtualizado = true;

    /*
     * A foto antiga somente é apagada depois que a nova
     * referência foi salva com sucesso no banco.
     */
    if (
      petAnterior.foto &&
      petAnterior.foto !==
        novaFoto
    ) {
      removerArquivoFoto(
        petAnterior.foto
      );
    }

    /*
     * Uma falha exclusivamente na auditoria não deve
     * desfazer uma troca de foto já concluída.
     */
    try {
      await registrarLog({
        usuarioId: req.usuario.id,
        acao:
          "ALTERAR_FOTO_PET",
        entidade: "pets",
        registroId:
          petAtualizado.id,

        valorAnterior: {
          foto: petAnterior.foto,
        },

        valorNovo: {
          foto:
            petAtualizado.foto,
        },

        ip: req.ip,
      });
    } catch (erroLog) {
      console.error(
        "Foto alterada, mas houve erro ao registrar auditoria:",
        erroLog
      );
    }

    return res.status(200).json({
      mensagem:
        "Foto do pet atualizada com sucesso.",
      pet: petAtualizado,
    });
  } catch (error) {
    /*
     * Se o banco não passou a utilizar a nova foto,
     * removemos o arquivo recebido para não deixar
     * arquivos órfãos no servidor.
     */
    if (!bancoAtualizado) {
      removerArquivoFoto(
        novaFoto
      );
    }

    console.error(
      "Erro ao atualizar foto do pet:",
      error
    );

    return res.status(500).json({
      mensagem:
        "Erro interno ao atualizar a foto do pet.",
    });
  }
}


// Lista todos os pets vinculados a um tutor específico.
// Essa consulta alimenta a seção "Pets deste tutor".
async function listarPetsPorTutor(
  req,
  res
) {
  try {
    const tutorId =
      Number(req.params.tutorId);

    if (
      !Number.isInteger(tutorId) ||
      tutorId <= 0
    ) {
      return res.status(400).json({
        mensagem:
          "ID de tutor inválido.",
      });
    }

    // Primeiro confirmamos se o tutor existe.
    const resultadoTutor =
      await pool.query(
        `SELECT id
         FROM tutores
         WHERE id = $1`,
        [tutorId]
      );

    if (
      resultadoTutor.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem:
          "Tutor não encontrado.",
      });
    }

    const resultado =
      await pool.query(
        `SELECT
           id,
           tutor_id,
           nome,
           especie,
           raca,
           sexo,
           data_nascimento,
           peso,
           cor,
           foto,
           ativo
         FROM pets
         WHERE tutor_id = $1
         ORDER BY nome ASC`,
        [tutorId]
      );

    return res.status(200).json(
      resultado.rows
    );
  } catch (erro) {
    console.error(
      "Erro ao listar pets do tutor:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


module.exports = {
  cadastrarPet,
  listarPets,
  buscarPetPorId,
  atualizarPet,
  alterarStatusPet,
  atualizarFotoPet,
  listarPetsPorTutor,
};