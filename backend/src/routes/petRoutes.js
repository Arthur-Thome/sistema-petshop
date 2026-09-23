const express = require("express");
const multer = require("multer");

const {
  cadastrarPet,
  listarPets,
  buscarPetPorId,
  atualizarPet,
  alterarStatusPet,
  atualizarFotoPet,
  listarPetsPorTutor,
} = require("../controllers/petController");

const {
  listarTutoresDoPet,
  vincularTutorAoPet,
  definirTutorPrincipal,
  desvincularTutorDoPet,
} = require("../controllers/petTutorController");

const autenticar = require(
  "../middleware/authMiddleware"
);

const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);

const uploadPet = require(
  "../middleware/uploadPetMiddleware"
);


// Converte erros de upload em respostas amigáveis para o frontend.
function receberFotoPet(req, res, next) {
  uploadPet.single("foto")(
    req,
    res,
    (erro) => {
      if (
        erro instanceof
        multer.MulterError
      ) {
        if (
          erro.code ===
          "LIMIT_FILE_SIZE"
        ) {
          return res.status(400).json({
            mensagem:
              "A imagem deve ter no máximo 5 MB.",
          });
        }

        return res.status(400).json({
          mensagem:
            "Não foi possível enviar a imagem.",
        });
      }


      if (erro) {
        return res.status(400).json({
          mensagem: erro.message,
        });
      }


      next();
    }
  );
}


const router = express.Router();


// Todas as operações relacionadas aos pets exigem
// que exista um usuário autenticado.
router.use(autenticar);


/*
 * Consulta os pets associados a determinado tutor.
 *
 * Esta rota precisa permanecer antes de "/:id" para que
 * "tutor" não seja interpretado como ID de pet.
 */
router.get(
  "/tutor/:tutorId",
  listarPetsPorTutor
);


/*
 * Gerenciamento dos vários tutores vinculados ao pet.
 *
 * Durante a migração, estas rotas convivem com
 * pets.tutor_id, que continua representando o
 * tutor principal para módulos ainda não migrados.
 */
router.get(
  "/:id/tutores",
  listarTutoresDoPet
);

router.post(
  "/:id/tutores",
  vincularTutorAoPet
);

router.patch(
  "/:id/tutores/:tutorId/principal",
  definirTutorPrincipal
);

router.delete(
  "/:id/tutores/:tutorId",
  desvincularTutorDoPet
);


// Consultas.
router.get(
  "/",
  listarPets
);

router.get(
  "/:id",
  buscarPetPorId
);


// Cadastro e edição.
router.post(
  "/",
  cadastrarPet
);

router.put(
  "/:id",
  atualizarPet
);


// Recebe uma única imagem no campo "foto".
router.post(
  "/:id/foto",
  receberFotoPet,
  atualizarFotoPet
);


// Alterar o status é uma operação crítica.
// Por isso, além do JWT, exigimos novamente a senha atual.
router.patch(
  "/:id/status",
  confirmarOperacaoCritica,
  alterarStatusPet
);


module.exports = router;