const crypto = require("crypto");
const pool = require("../database/connection");


const DURACAO_SESSAO_HORAS = 2;


/*
 * Nunca armazenamos o token original no banco.
 *
 * Caso o banco seja acessado indevidamente, os tokens
 * existentes não poderão ser utilizados diretamente.
 */
function gerarHash(valor) {
  return crypto
    .createHash("sha256")
    .update(valor)
    .digest("hex");
}


/*
 * Cria uma credencial temporária para o fluxo público.
 *
 * O token original é entregue somente uma vez ao navegador.
 */
async function criarSessaoCliente(
  tutorId,
  client = pool
) {
  const token =
    crypto.randomBytes(32).toString("hex");

  const tokenHash =
    gerarHash(token);


  const resultado =
    await client.query(
      `
        INSERT INTO sessoes_cliente_publico
        (
          tutor_id,
          token_hash,
          expira_em
        )

        VALUES
        (
          $1,
          $2,
          CURRENT_TIMESTAMP
            + ($3 * INTERVAL '1 hour')
        )

        RETURNING
          id,
          tutor_id,
          expira_em
      `,
      [
        tutorId,
        tokenHash,
        DURACAO_SESSAO_HORAS,
      ]
    );


  return {
    token,
    sessao: resultado.rows[0],
  };
}


/*
 * Recupera uma sessão somente quando:
 *
 * - o token existe;
 * - não foi revogado;
 * - ainda não expirou;
 * - o Tutor continua ativo.
 */
async function buscarSessaoCliente(
  token,
  client = pool
) {
  if (
    typeof token !== "string" ||
    !token.trim()
  ) {
    return null;
  }


  const tokenHash =
    gerarHash(token.trim());


  const resultado =
    await client.query(
      `
        SELECT
          s.id,
          s.tutor_id,
          s.expira_em,

          t.nome AS tutor_nome,
          t.ativo AS tutor_ativo

        FROM sessoes_cliente_publico s

        INNER JOIN tutores t
          ON t.id = s.tutor_id

        WHERE
          s.token_hash = $1
          AND s.revogado_em IS NULL
          AND s.expira_em >
              CURRENT_TIMESTAMP
          AND t.ativo = TRUE

        LIMIT 1
      `,
      [tokenHash]
    );


  return resultado.rows[0] || null;
}


module.exports = {
  criarSessaoCliente,
  buscarSessaoCliente,
};