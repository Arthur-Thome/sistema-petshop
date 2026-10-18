const nodemailer = require("nodemailer");


/*
 * Centraliza o envio de e-mails do sistema.
 *
 * O transporte recebe configuracao somente pelo ambiente do processo.
 * O launcher de homologacao substitui EMAIL_* pelo SMTP local.
 * Credenciais nunca devem ser colocadas no codigo-fonte ou registradas.
 */
let transporter;
function obterTransporter() {
  if (process.env.AMORES_EMAIL_DISABLED === "1"
      || process.env.AMORES_PET_DATABASE_MODE === "NEON_HOMOLOGACAO") {
    const error = new Error("Envio de e-mail está desativado neste ambiente de homologação.");
    error.code = "EMAIL_DESATIVADO_NO_AMBIENTE";
    throw error;
  }
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD } = process.env;
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASSWORD || !/^\d+$/.test(EMAIL_PORT || "587")) {
    const error = new Error("Configuracao de e-mail indisponivel");
    error.code = "EMAIL_NAO_CONFIGURADO";
    throw error;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: Number(EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === "true",
      auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },
    });
  }
  return transporter;
}


/*
 * Função genérica de envio.
 *
 * Outras funcionalidades poderão reutilizar este serviço
 * futuramente sem precisar conhecer as configurações SMTP.
 */
async function enviarEmail({
  para,
  assunto,
  texto,
  html,
}) {

  return obterTransporter().sendMail({
    from: `"Amores Pet" <${process.env.EMAIL_USER}>`,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });

}


/*
 * Verifica a conexão com o servidor SMTP.
 *
 * Útil durante desenvolvimento para detectar problemas
 * de configuração antes de tentar enviar mensagens.
 */
async function verificarConexaoEmail() {
  await obterTransporter().verify();
}

async function enviarCodigoVerificacao({ para, codigo, contexto }) {
  const assunto = "Seu codigo de verificacao | Amores Pet";
  const uso = contexto === "CADASTRO" ? "concluir a verificacao do seu contato" : "acessar o agendamento publico";
  const texto = `Amores Pet\n\nSeu codigo para ${uso} e: ${codigo}\n\nEle expira em 10 minutos e pode ser usado uma unica vez. Se voce nao solicitou este codigo, ignore esta mensagem.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#222"><h1>Amores Pet</h1><p>Use este codigo para ${uso}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${codigo}</p><p>O codigo expira em 10 minutos e pode ser usado uma unica vez.</p><p>Se voce nao solicitou este codigo, ignore esta mensagem.</p></div>`;
  return enviarEmail({ para, assunto, texto, html });
}


module.exports = {
  enviarEmail,
  enviarCodigoVerificacao,
  verificarConexaoEmail,
};
