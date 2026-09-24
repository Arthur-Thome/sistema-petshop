/*
 * Centraliza a abertura do WhatsApp para evitar que
 * regras de telefone e montagem da URL sejam repetidas
 * em várias páginas do sistema.
 *
 * Nesta etapa utilizamos o WhatsApp pelo navegador.
 * Nenhuma mensagem é enviada automaticamente:
 * o operador ainda confirma o envio no WhatsApp.
 */


/*
 * Mantém somente os números do telefone.
 *
 * Para números brasileiros adicionamos o código 55
 * quando ele ainda não estiver presente.
 */
export function prepararTelefoneWhatsApp(
  telefone
) {
  if (!telefone) {
    return null;
  }

  let numero =
    String(telefone).replace(
      /\D/g,
      ""
    );

  if (!numero) {
    return null;
  }

  if (!numero.startsWith("55")) {
    numero = `55${numero}`;
  }

  return numero;
}


/*
 * Abre uma nova conversa no WhatsApp com uma
 * mensagem previamente preenchida.
 *
 * Retornamos false quando não existe telefone válido.
 * Assim cada tela pode decidir como avisar o operador.
 */
export function abrirWhatsApp({
  telefone,
  mensagem,
}) {
  const numero =
    prepararTelefoneWhatsApp(
      telefone
    );

  if (!numero) {
    return false;
  }

  const url =
    `https://wa.me/${numero}` +
    `?text=${encodeURIComponent(
      mensagem || ""
    )}`;

  window.open(
    url,
    "_blank",
    "noopener,noreferrer"
  );

  return true;
}


/*
 * Mensagem utilizada para lembrar o tutor sobre
 * um atendimento que ainda está agendado.
 */
export function mensagemLembreteAtendimento({
  tutorNome,
  petNome,
  agendadoPara,
}) {
  return (
    `Olá, ${tutorNome || "cliente"}! \n\n` +
    `Passando para lembrar do atendimento de ` +
    `${petNome || "seu pet"}.\n\n` +
    `Data e horário: ${agendadoPara || "-"}.\n\n` +
    `Qualquer dúvida, estamos à disposição!`
  );
}


/*
 * Mensagem utilizada quando o atendimento foi
 * concluído e o pet já pode seguir o fluxo definido
 * pelo estabelecimento.
 */
export function mensagemAtendimentoConcluido({
  tutorNome,
  petNome,
}) {
  return (
    `Olá, ${tutorNome || "cliente"}! \n\n` +
    `O atendimento de ${petNome || "seu pet"} ` +
    `foi concluído.\n\n` +
    `Agradecemos pela preferência!`
  );
}


/*
 * Mensagem de cobrança amigável para atendimentos
 * que ainda possuem pagamento pendente.
 *
 * O valor é apenas informativo. A confirmação do
 * pagamento continua sendo feita dentro do sistema.
 */
export function mensagemPagamentoPendente({
  tutorNome,
  petNome,
  valor,
}) {
  return (
    `Olá, ${tutorNome || "cliente"}! \n\n` +
    `Identificamos que o atendimento de ` +
    `${petNome || "seu pet"} possui um pagamento ` +
    `pendente no valor de ${valor || "-"}.\n\n` +
    `Se o pagamento já foi realizado, por favor ` +
    `desconsidere esta mensagem.\n\n` +
    `Qualquer dúvida, estamos à disposição!`
  );
}


/*
 * Mensagem genérica para iniciar um contato com
 * o tutor sem assumir um motivo específico.
 */
export function mensagemContatoTutor({
  tutorNome,
  petNome,
}) {
  return (
    `Olá, ${tutorNome || "cliente"}! \n\n` +
    `Estamos entrando em contato sobre ` +
    `${petNome || "seu pet"}.\n\n` +
    `Como podemos ajudar?`
  );
}