const express = require("express");
const autenticar = require("../middleware/authMiddleware");
const controller = require("../controllers/operationAuthorizationController");
const { authorizationIpLimiter, authorizationAccountLimiter } = require("../middleware/rateLimitMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");

const router = express.Router();
router.get("/autorizadores", autenticar, permitirPerfis("gerente", "funcionario"), controller.listarAutorizadores);
router.post("/", autenticar, authorizationIpLimiter, authorizationAccountLimiter, controller.criar);

module.exports = router;
