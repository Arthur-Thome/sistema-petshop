function normalizarPerfil(perfil) {
  return String(perfil || "").trim().toLowerCase();
}

async function verificarAutorizacaoAgenda({ usuarioLogado }) {
  if (!usuarioLogado) {
    const erro = new Error("Usuário autenticado não identificado.");
    erro.status = 401;
    erro.codigo = "USUARIO_NAO_AUTENTICADO";
    throw erro;
  }

  if (["administrador", "super_administrador"].includes(normalizarPerfil(usuarioLogado.perfil))) {
    return { autorizado: true, autorizadoPor: null };
  }

  const erro = new Error("Somente Administrador ou Super Administrador pode administrar a Agenda Pública.");
  erro.status = 403;
  erro.codigo = "PERFIL_SEM_PERMISSAO";
  throw erro;
}

module.exports = { verificarAutorizacaoAgenda };
