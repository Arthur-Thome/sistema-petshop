// Cria um middleware reutilizável de autorização por perfil.
//
// Exemplo:
// permitirPerfis("administrador", "gerente")
//
// Esconder opções no frontend melhora a interface, mas não
// substitui esta validação no backend.

function permitirPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        mensagem: "Usuário não autenticado.",
      });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        mensagem: "Você não possui permissão para realizar esta ação.",
      });
    }

    return next();
  };
}

module.exports = permitirPerfis;