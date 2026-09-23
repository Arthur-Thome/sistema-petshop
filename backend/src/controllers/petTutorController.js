const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");


/*
 * Converte e valida IDs recebidos pelas rotas.
 * Centralizar esta regra evita diferenças de validação
 * entre as operações de vínculo Pet <-> Tutor.
 */
function validarId(valor) {
  const id = Number(valor);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}


/*
 * Falhas exclusivamente na auditoria não devem desfazer
 * um vínculo que já foi confirmado pelo banco.
 */
async function registrarLogSeguro(dados) {
  try {
    await registrarLog(dados);
  } catch (erro) {
    console.error(
      "Operação Pet/Tutor concluída, mas houve erro ao registrar auditoria:",
      erro
    );
  }
}


/*
 * Lista todos os tutores vinculados a determinado pet.
 *
 * O tutor principal aparece primeiro.
 */
async function listarTutoresDoPet(req, res) {
  try {
    const petId =
      validarId(req.params.id);

    if (!petId) {
      return res.status(400).json({
        mensagem: "ID de pet inválido.",
      });
    }


    const resultadoPet =
      await pool.query(
        `SELECT id
         FROM pets
         WHERE id = $1`,
        [petId]
      );


    if (
      resultadoPet.rows.length === 0
    ) {
      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }


    const resultado =
      await pool.query(
        `SELECT
           t.id,
           t.nome,
           t.cpf,
           t.telefone,
           t.email,
           t.ativo,
           pt.principal,
           pt.criado_em AS vinculado_em

         FROM pet_tutores pt

         INNER JOIN tutores t
           ON t.id = pt.tutor_id

         WHERE pt.pet_id = $1

         ORDER BY
           pt.principal DESC,
           t.nome ASC,
           t.id ASC`,
        [petId]
      );


    return res.status(200).json(
      resultado.rows
    );

  } catch (erro) {
    console.error(
      "Erro ao listar tutores do pet:",
      erro
    );

    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });
  }
}


/*
 * Vincula um tutor existente a um pet.
 *
 * Não permitimos:
 * - pet inexistente;
 * - tutor inexistente;
 * - tutor inativo;
 * - vínculo duplicado.
 *
 * Caso seja o primeiro tutor do pet, ele se torna
 * automaticamente o principal.
 */
async function vincularTutorAoPet(req, res) {
  const petId =
    validarId(req.params.id);

  const tutorId =
    validarId(req.body.tutor_id);


  if (!petId) {
    return res.status(400).json({
      mensagem: "ID de pet inválido.",
    });
  }


  if (!tutorId) {
    return res.status(400).json({
      mensagem: "ID de tutor inválido.",
    });
  }


  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");


    /*
     * O lock no pet serializa alterações simultâneas
     * nos seus vínculos de tutores.
     */
    const resultadoPet =
      await client.query(
        `SELECT id, tutor_id
         FROM pets
         WHERE id = $1
         FOR UPDATE`,
        [petId]
      );


    if (
      resultadoPet.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }


    const resultadoTutor =
      await client.query(
        `SELECT id, nome, ativo
         FROM tutores
         WHERE id = $1`,
        [tutorId]
      );


    if (
      resultadoTutor.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem: "Tutor não encontrado.",
      });
    }


    if (!resultadoTutor.rows[0].ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Não é possível vincular um tutor inativo.",
      });
    }


    const vinculoExistente =
      await client.query(
        `SELECT
           pet_id,
           tutor_id,
           principal
         FROM pet_tutores
         WHERE pet_id = $1
           AND tutor_id = $2`,
        [
          petId,
          tutorId,
        ]
      );


    if (
      vinculoExistente.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem:
          "Este tutor já está vinculado ao pet.",
      });
    }


    const quantidade =
      await client.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM pet_tutores
         WHERE pet_id = $1`,
        [petId]
      );


    const primeiroTutor =
      quantidade.rows[0].total === 0;


    const resultadoVinculo =
      await client.query(
        `INSERT INTO pet_tutores
         (
           pet_id,
           tutor_id,
           principal
         )
         VALUES ($1, $2, $3)
         RETURNING
           pet_id,
           tutor_id,
           principal,
           criado_em`,
        [
          petId,
          tutorId,
          primeiroTutor,
        ]
      );


    /*
     * Enquanto pets.tutor_id ainda existir, mantemos
     * essa coluna sincronizada com o tutor principal.
     *
     * Isso preserva Creche, Hotel, Atendimentos e outras
     * partes ainda não migradas para pet_tutores.
     */
    if (primeiroTutor) {
      await client.query(
        `UPDATE pets
         SET
           tutor_id = $1,
           atualizado_em =
             CURRENT_TIMESTAMP
         WHERE id = $2`,
        [
          tutorId,
          petId,
        ]
      );
    }


    await client.query("COMMIT");


    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao: "VINCULAR_TUTOR_PET",
      entidade: "pet_tutores",
      registroId: petId,

      valorNovo: {
        pet_id: petId,
        tutor_id: tutorId,
        principal:
          resultadoVinculo
            .rows[0]
            .principal,
      },

      ip: req.ip,
    });


    return res.status(201).json({
      mensagem:
        "Tutor vinculado ao pet com sucesso.",

      vinculo:
        resultadoVinculo.rows[0],
    });

  } catch (erro) {
    await client.query("ROLLBACK");

    console.error(
      "Erro ao vincular tutor ao pet:",
      erro
    );


    if (erro.code === "23505") {
      return res.status(409).json({
        mensagem:
          "Este tutor já está vinculado ao pet.",
      });
    }


    return res.status(500).json({
      mensagem:
        "Erro interno do servidor.",
    });

  } finally {
    client.release();
  }
}


/*
 * Define qual tutor será considerado principal.
 *
 * A operação acontece em uma transação para garantir
 * que nunca existam dois tutores principais para o pet.
 */
async function definirTutorPrincipal(
  req,
  res
) {
  const petId =
    validarId(req.params.id);

  const tutorId =
    validarId(
      req.params.tutorId
    );


  if (!petId) {
    return res.status(400).json({
      mensagem: "ID de pet inválido.",
    });
  }


  if (!tutorId) {
    return res.status(400).json({
      mensagem: "ID de tutor inválido.",
    });
  }


  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");


    const resultadoPet =
      await client.query(
        `SELECT id, tutor_id
         FROM pets
         WHERE id = $1
         FOR UPDATE`,
        [petId]
      );


    if (
      resultadoPet.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }


    const resultadoVinculo =
      await client.query(
        `SELECT
           pt.pet_id,
           pt.tutor_id,
           pt.principal,
           t.nome,
           t.ativo

         FROM pet_tutores pt

         INNER JOIN tutores t
           ON t.id = pt.tutor_id

         WHERE pt.pet_id = $1
           AND pt.tutor_id = $2`,
        [
          petId,
          tutorId,
        ]
      );


    if (
      resultadoVinculo.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem:
          "O tutor não está vinculado a este pet.",
      });
    }


    const tutor =
      resultadoVinculo.rows[0];


    if (!tutor.ativo) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "Um tutor inativo não pode ser definido como principal.",
      });
    }


    if (tutor.principal) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        mensagem:
          "Este tutor já é o tutor principal do pet.",
      });
    }


    /*
     * Primeiro retiramos o principal atual e depois
     * promovemos o tutor escolhido.
     */
    await client.query(
      `UPDATE pet_tutores
       SET principal = FALSE
       WHERE pet_id = $1
         AND principal = TRUE`,
      [petId]
    );


    await client.query(
      `UPDATE pet_tutores
       SET principal = TRUE
       WHERE pet_id = $1
         AND tutor_id = $2`,
      [
        petId,
        tutorId,
      ]
    );


    /*
     * Compatibilidade temporária com o modelo antigo.
     * pets.tutor_id sempre aponta para o principal.
     */
    await client.query(
      `UPDATE pets
       SET
         tutor_id = $1,
         atualizado_em =
           CURRENT_TIMESTAMP
       WHERE id = $2`,
      [
        tutorId,
        petId,
      ]
    );


    await client.query("COMMIT");


    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao:
        "ALTERAR_TUTOR_PRINCIPAL_PET",
      entidade: "pet_tutores",
      registroId: petId,

      valorAnterior: {
        tutor_id:
          resultadoPet.rows[0]
            .tutor_id,
      },

      valorNovo: {
        tutor_id: tutorId,
      },

      ip: req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Tutor principal alterado com sucesso.",

      pet_id: petId,
      tutor_id: tutorId,
    });

  } catch (erro) {
    await client.query("ROLLBACK");

    console.error(
      "Erro ao definir tutor principal:",
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


/*
 * Remove somente o relacionamento.
 *
 * O cadastro do pet e o cadastro do tutor continuam
 * existindo normalmente.
 *
 * O último tutor do pet não pode ser removido.
 */
async function desvincularTutorDoPet(
  req,
  res
) {
  const petId =
    validarId(req.params.id);

  const tutorId =
    validarId(
      req.params.tutorId
    );


  if (!petId) {
    return res.status(400).json({
      mensagem: "ID de pet inválido.",
    });
  }


  if (!tutorId) {
    return res.status(400).json({
      mensagem: "ID de tutor inválido.",
    });
  }


  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");


    const resultadoPet =
      await client.query(
        `SELECT id, tutor_id
         FROM pets
         WHERE id = $1
         FOR UPDATE`,
        [petId]
      );


    if (
      resultadoPet.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem: "Pet não encontrado.",
      });
    }


    const resultadoVinculo =
      await client.query(
        `SELECT
           pet_id,
           tutor_id,
           principal
         FROM pet_tutores
         WHERE pet_id = $1
           AND tutor_id = $2`,
        [
          petId,
          tutorId,
        ]
      );


    if (
      resultadoVinculo.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        mensagem:
          "O tutor não está vinculado a este pet.",
      });
    }


    const quantidade =
      await client.query(
        `SELECT COUNT(*)::INTEGER AS total
         FROM pet_tutores
         WHERE pet_id = $1`,
        [petId]
      );


    if (
      quantidade.rows[0].total <= 1
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        mensagem:
          "O último tutor do pet não pode ser removido.",
      });
    }


    const vinculo =
      resultadoVinculo.rows[0];


    /*
     * Se o tutor removido for o principal, escolhemos
     * outro vínculo antes da remoção.
     *
     * Isso mantém pets.tutor_id válido durante toda a
     * fase de compatibilidade com o modelo antigo.
     */
    let novoPrincipal = null;


    if (vinculo.principal) {
      const resultadoNovoPrincipal =
        await client.query(
          `SELECT
             pt.tutor_id

           FROM pet_tutores pt

           INNER JOIN tutores t
             ON t.id = pt.tutor_id

           WHERE pt.pet_id = $1
             AND pt.tutor_id <> $2
             AND t.ativo = TRUE

           ORDER BY
             pt.criado_em ASC,
             pt.tutor_id ASC

           LIMIT 1`,
          [
            petId,
            tutorId,
          ]
        );


      if (
        resultadoNovoPrincipal.rows
          .length === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          mensagem:
            "Não existe outro tutor ativo que possa assumir como principal.",
        });
      }


      novoPrincipal =
        resultadoNovoPrincipal
          .rows[0]
          .tutor_id;


      /*
       * Retiramos a marcação do principal atual antes
       * de promover o próximo, respeitando o índice único.
       */
      await client.query(
        `UPDATE pet_tutores
         SET principal = FALSE
         WHERE pet_id = $1
           AND tutor_id = $2`,
        [
          petId,
          tutorId,
        ]
      );


      await client.query(
        `UPDATE pet_tutores
         SET principal = TRUE
         WHERE pet_id = $1
           AND tutor_id = $2`,
        [
          petId,
          novoPrincipal,
        ]
      );


      await client.query(
        `UPDATE pets
         SET
           tutor_id = $1,
           atualizado_em =
             CURRENT_TIMESTAMP
         WHERE id = $2`,
        [
          novoPrincipal,
          petId,
        ]
      );
    }


    await client.query(
      `DELETE FROM pet_tutores
       WHERE pet_id = $1
         AND tutor_id = $2`,
      [
        petId,
        tutorId,
      ]
    );


    await client.query("COMMIT");


    await registrarLogSeguro({
      usuarioId: req.usuario.id,
      acao:
        "DESVINCULAR_TUTOR_PET",
      entidade: "pet_tutores",
      registroId: petId,

      valorAnterior: {
        pet_id: petId,
        tutor_id: tutorId,
        principal:
          vinculo.principal,
      },

      valorNovo: novoPrincipal
        ? {
            novo_tutor_principal:
              novoPrincipal,
          }
        : null,

      ip: req.ip,
    });


    return res.status(200).json({
      mensagem:
        "Tutor desvinculado do pet com sucesso.",

      novo_tutor_principal:
        novoPrincipal,
    });

  } catch (erro) {
    await client.query("ROLLBACK");

    console.error(
      "Erro ao desvincular tutor do pet:",
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
  listarTutoresDoPet,
  vincularTutorAoPet,
  definirTutorPrincipal,
  desvincularTutorDoPet,
};