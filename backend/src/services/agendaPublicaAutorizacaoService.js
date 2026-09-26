const bcrypt = require("bcrypt");
const pool = require("../database/connection");


/*
 * ============================================================
 * AUTORIZAÇÃO PARA ALTERAÇÕES NA AGENDA PÚBLICA
 * ============================================================
 *
 * REGRAS:
 *
 * ADMINISTRADOR
 *     Pode alterar a agenda diretamente.
 *
 * GERENTE
 *     Pode alterar a agenda diretamente.
 *
 * FUNCIONÁRIO
 *     Pode alterar a agenda somente mediante autorização
 *     pela senha de um Administrador ou Gerente ativo.
 *
 * IMPORTANTE:
 *
 * Diferentemente do fluxo de estorno, o Funcionário NÃO
 * precisa selecionar quem está autorizando.
 *
 * O backend recebe somente a senha de autorização e identifica
 * a qual Administrador/Gerente ativo aquela senha pertence.
 *
 * A senha nunca deve ser armazenada no banco, logs ou respostas.
 * ============================================================
 */


const PERFIS_AUTORIZADORES_AGENDA = [
  "administrador",
  "gerente",
];


/*
 * Normaliza o perfil recebido do usuário autenticado.
 */
function normalizarPerfil(perfil) {
  return String(perfil || "")
    .trim()
    .toLowerCase();
}


/*
 * ============================================================
 * VERIFICAR AUTORIZAÇÃO
 * ============================================================
 *
 * Administrador/Gerente:
 *
 * {
 *   autorizado: true,
 *   autorizadoPor: null
 * }
 *
 *
 * Funcionário autorizado:
 *
 * {
 *   autorizado: true,
 *   autorizadoPor: {
 *     id,
 *     nome,
 *     perfil
 *   }
 * }
 */
async function verificarAutorizacaoAgenda({
  usuarioLogado,
  senhaAutorizacao,
}) {

  if (!usuarioLogado) {
    const erro = new Error(
      "Usuário autenticado não identificado."
    );

    erro.status = 401;
    erro.codigo = "USUARIO_NAO_AUTENTICADO";

    throw erro;
  }


  const perfil =
    normalizarPerfil(usuarioLogado.perfil);


  /*
   * Administradores e Gerentes possuem autorização
   * direta para alterar a agenda.
   */
  if (
    PERFIS_AUTORIZADORES_AGENDA.includes(
      perfil
    )
  ) {
    return {
      autorizado: true,
      autorizadoPor: null,
    };
  }


  /*
   * A autorização especial da agenda é concedida
   * somente ao perfil Funcionário.
   *
   * Caso futuramente surja outro perfil, ele não ganhará
   * essa permissão automaticamente.
   */
  if (perfil !== "funcionario") {
    const erro = new Error(
      "Seu perfil não possui permissão para alterar a agenda."
    );

    erro.status = 403;
    erro.codigo = "PERFIL_SEM_PERMISSAO";

    throw erro;
  }


  /*
   * Funcionários precisam obrigatoriamente fornecer
   * uma senha de autorização.
   */
  if (
    typeof senhaAutorizacao !== "string" ||
    !senhaAutorizacao
  ) {
    const erro = new Error(
      "Esta alteração precisa da autorização de um Gerente ou Administrador."
    );

    erro.status = 403;
    erro.codigo = "AUTORIZACAO_NECESSARIA";

    throw erro;
  }


  /*
   * Buscamos SOMENTE Administradores e Gerentes ativos.
   *
   * Não buscamos funcionários nem usuários inativos.
   */
  const resultado =
    await pool.query(
      `
        SELECT
          id,
          nome,
          perfil,
          senha_hash

        FROM usuarios

        WHERE
          ativo = TRUE
          AND perfil IN (
            'administrador',
            'gerente'
          )

        ORDER BY
          id ASC
      `
    );


  /*
   * A senha recebida é comparada com os hashes dos
   * possíveis autorizadores.
   *
   * O frontend não informa a identidade do autorizador.
   * A identificação acontece exclusivamente aqui.
   */
  for (
    const usuarioAutorizador
    of resultado.rows
  ) {

    const senhaCorreta =
      await bcrypt.compare(
        senhaAutorizacao,
        usuarioAutorizador.senha_hash
      );


    if (senhaCorreta) {
      return {
        autorizado: true,

        autorizadoPor: {
          id:
            usuarioAutorizador.id,

          nome:
            usuarioAutorizador.nome,

          perfil:
            usuarioAutorizador.perfil,
        },
      };
    }
  }


  /*
   * A mensagem é propositalmente genérica.
   *
   * Não revelamos se:
   *
   * - a senha pertence a outro perfil;
   * - o usuário está inativo;
   * - a senha simplesmente não existe.
   */
  const erro = new Error(
    "Senha de autorização inválida."
  );

  erro.status = 403;
  erro.codigo = "AUTORIZACAO_INVALIDA";

  throw erro;
}


module.exports = {
  verificarAutorizacaoAgenda,
};