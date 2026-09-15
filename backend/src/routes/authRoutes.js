const express = require("express");

const { login } = require("../controllers/authController");
const autenticar = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);

router.get("/me", autenticar, (req, res) => {
  return res.status(200).json({
    mensagem: "Usuário autenticado.",
    usuario: req.usuario,
  });
});

module.exports = router;