const {
  buscarSessaoCliente,
} = require(
  "../services/sessaoClientePublicoService"
);


/*
 * Autenticação específica do cliente público.
 *
 * Não reutilizamos authMiddleware porque aquele middleware
 * representa usuários internos:
 *
 * Administrador, Gerente e Funcionário.
 *
 * Aqui estamos autenticando um Tutor durante o processo
 * temporário de agendamento.
 */
async function autenticarClientePublico(
  req,
  res,
  next
) {
  try {
    const authorization =
      req.headers.authorization;


    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return res.status(401).json({
        mensagem:
          "Identificação do cliente necessária.",
      });
    }


    const token =
      authorization
        .slice(7)
        .trim();


    if (!token) {
      return res.status(401).json({
        mensagem:
          "Sessão do cliente inválida.",
      });
    }


    const sessao =
      await buscarSessaoCliente(
        token
      );


    if (!sessao) {
      return res.status(401).json({
        mensagem:
          "A identificação expirou ou não é mais válida.",
      });
    }


    /*
     * Controllers públicos nunca recebem tutor_id do
     * navegador como fonte de autorização.
     *
     * A identidade confiável vem desta sessão.
     */
    req.clientePublico = {
      sessaoId: sessao.id,
      tutorId: sessao.tutor_id,
      tutorNome:
        sessao.tutor_nome,
    };


    next();

  } catch (erro) {
    console.error(
      "Erro ao autenticar cliente público:",
      erro
    );


    return res.status(500).json({
      mensagem:
        "Não foi possível validar a identificação do cliente.",
    });
  }
}


module.exports =
  autenticarClientePublico;