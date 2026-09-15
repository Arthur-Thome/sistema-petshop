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

const autenticar = require(
  "../middleware/authMiddleware"
);

const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);

// Converte erros de upload em respostas amigáveis para o frontend.
function receberFotoPet(req, res, next) {
  uploadPet.single("foto")(
    req,
    res,
    (erro) => {
      if (erro instanceof multer.MulterError) {
        if (
          erro.code === "LIMIT_FILE_SIZE"
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

const uploadPet = require(
  "../middleware/uploadPetMiddleware"
);

const router = express.Router();


// Todas as operações relacionadas aos pets exigem
// que exista um usuário autenticado.
router.use(autenticar);

router.get(
  "/tutor/:tutorId",
  listarPetsPorTutor
);

router.get("/", listarPets);
router.get("/:id", buscarPetPorId);

// Consultas.
router.get("/", listarPets);
router.get("/:id", buscarPetPorId);

// Cadastro e edição.
router.post("/", cadastrarPet);
router.put("/:id", atualizarPet);

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