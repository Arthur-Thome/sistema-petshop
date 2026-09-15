const pool = require("../database/connection");

// Centraliza a gravação da trilha de auditoria do sistema.
//
// valorAnterior e valorNovo permitem identificar exatamente
// o que mudou em operações que alteram registros.
//
// IMPORTANTE:
// Nunca enviar senhas, hashes de senha, JWTs ou outros
// segredos para esta função.
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
    await pool.query(
      `INSERT INTO logs
       (
         usuario_id,
         acao,
         entidade,
         registro_id,
         valor_anterior,
         valor_novo,
         ip
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        usuarioId,
        acao,
        entidade,
        registroId,
        valorAnterior,
        valorNovo,
        ip,
      ]
    );
  } catch (erro) {
    console.error("Erro ao registrar log:", erro);
  }
}

module.exports = {
  registrarLog,
};