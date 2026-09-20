const nodemailer = require("nodemailer");


/*
 * Centraliza o envio de e-mails do sistema.
 *
 * As credenciais ficam exclusivamente no .env e nunca
 * devem ser colocadas diretamente no código-fonte.
 */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,

  port: Number(
    process.env.EMAIL_PORT || 587
  ),

  secure:
    process.env.EMAIL_SECURE === "true",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});


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

  return transporter.sendMail({
    from: `"Sistema Pet Shop" <${process.env.EMAIL_USER}>`,
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

  await transporter.verify();

}


module.exports = {
  enviarEmail,
  verificarConexaoEmail,
};