const pool = require("../database/connection");


/*
 * Campos que nunca devem ser armazenados na trilha
 * de auditoria.
 *
 * Mesmo que algum controller envie acidentalmente
 * esses dados para registrarLog(), o próprio serviço
 * remove as informações sensíveis antes do INSERT.
 */
const CAMPOS_SENSIVEIS = [
  /*
   * Senhas utilizadas pela aplicação.
   */
  "senha",
  "senha_hash",
  "senha_atual",
  "nova_senha",
  "senha_confirmacao",
  "confirmacao_senha",
  "confirm_password",

  /*
   * Variações em inglês que podem aparecer
   * futuramente em integrações ou bibliotecas.
   */
  "password",
  "password_hash",

  /*
   * Tokens de autenticação, recuperação de senha
   * e possíveis integrações futuras.
   */
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "jwt",
  "jwt_secret",
  "authorization",

  /*
   * Credenciais armazenadas em variáveis de ambiente.
   * Estes nomes são protegidos preventivamente caso
   * algum objeto de configuração seja enviado ao log.
   */
  "email_password",
  "db_password",
  "admin_senha",
];


/*
 * Remove informações sensíveis de objetos e arrays
 * antes que sejam armazenadas na tabela de logs.
 *
 * A limpeza é recursiva porque alguns registros podem
 * possuir objetos ou listas dentro de valorAnterior
 * e valorNovo.
 */
function removerDadosSensiveis(valor) {

  if (
    valor === null ||
    valor === undefined
  ) {
    return valor;
  }


  if (Array.isArray(valor)) {

    return valor.map(
      (item) =>
        removerDadosSensiveis(item)
    );

  }


  if (
    typeof valor !== "object"
  ) {
    return valor;
  }


  const resultado = {};


  for (
    const [chave, conteudo]
    of Object.entries(valor)
  ) {

    const chaveNormalizada =
      chave
        .trim()
        .toLowerCase();


    /*
     * O campo inteiro é removido.
     *
     * Não utilizamos "***" porque até a existência
     * desnecessária de determinados campos sensíveis
     * não precisa fazer parte da auditoria.
     */
    if (
      CAMPOS_SENSIVEIS.includes(
        chaveNormalizada
      )
    ) {
      continue;
    }


    resultado[chave] =
      removerDadosSensiveis(
        conteudo
      );

  }


  return resultado;
}


/*
 * Centraliza a gravação da trilha de auditoria.
 *
 * valorAnterior:
 * estado relevante antes da alteração.
 *
 * valorNovo:
 * estado relevante depois da alteração.
 *
 * O serviço também funciona como uma segunda camada
 * de proteção contra armazenamento acidental de
 * senhas, hashes, tokens e outros segredos.
 */
async function registrarLog({
  usuarioId,
  acao,
  entidade,
  registroId = null,
  valorAnterior = null,
  valorNovo = null,
  ip = null,
}) {

  try {

    const valorAnteriorSeguro =
      removerDadosSensiveis(
        valorAnterior
      );


    const valorNovoSeguro =
      removerDadosSensiveis(
        valorNovo
      );


    await pool.query(
      `
        INSERT INTO logs
        (
          usuario_id,
          acao,
          entidade,
          registro_id,
          valor_anterior,
          valor_novo,
          ip
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        usuarioId,
        acao,
        entidade,
        registroId,
        valorAnteriorSeguro,
        valorNovoSeguro,
        ip,
      ]
    );

  } catch (erro) {

    /*
     * Uma falha na auditoria é registrada no servidor,
     * mas não derruba a operação principal.
     *
     * Em uma futura revisão de segurança poderemos
     * tornar determinadas operações críticas
     * transacionais também com a auditoria.
     */
    console.error(
      "Erro ao registrar log:",
      erro
    );

  }
}


module.exports = {
  registrarLog,
};