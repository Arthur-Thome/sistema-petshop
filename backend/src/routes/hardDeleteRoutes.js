const express = require("express");
const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");
const controller = require("../controllers/hardDeleteController");

const router = express.Router();
router.use(autenticar, permitirPerfis("super_administrador"));
router.get("/:entidade/:id", controller.verificar);
router.delete("/:entidade/:id", controller.executar);

module.exports = router;
