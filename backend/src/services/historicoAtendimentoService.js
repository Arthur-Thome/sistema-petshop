const { EVENTOS, TRANSICOES, validarMotivo } = require('../contracts/atendimentoPublico');

// Exige o mesmo PoolClient de BEGIN/COMMIT do chamador. Nao usa pool global,
// nao confirma transacao e nao absorve falhas: erro deve provocar ROLLBACK.
async function registrarEventoAtendimento(client, evento) {
  if (!client || typeof client.query !== 'function' || typeof client.release !== 'function') {
    throw new TypeError('Informe o PoolClient da transacao, nunca o Pool global.');
  }
  const { atendimentoId, tipo, estadoAnterior = null, estadoNovo,
    usuarioId = null, tutorId = null, motivo = null } = evento;
  const idValido = id => Number.isSafeInteger(id) && id > 0;
  if (!idValido(atendimentoId) || !EVENTOS.includes(tipo)) throw new TypeError('Evento invalido.');
  const criado = tipo === 'SOLICITACAO_CRIADA';
  if (criado ? (!idValido(tutorId) || usuarioId !== null) : (!idValido(usuarioId) || tutorId !== null)) {
    throw new TypeError('Ator do evento invalido.');
  }
  const acoes = { SOLICITACAO_CONFIRMADA: 'CONFIRMAR', SOLICITACAO_RECUSADA: 'RECUSAR', ATENDIMENTO_CANCELADO: 'CANCELAR' };
  const destinos = TRANSICOES[acoes[tipo]];
  if (criado ? (estadoAnterior !== null || estadoNovo !== 'AGUARDANDO_CONFIRMACAO')
    : (!Object.hasOwn(destinos, estadoAnterior) || destinos[estadoAnterior] !== estadoNovo)) {
    throw new TypeError('Transicao do evento invalida.');
  }
  const motivoNormalizado = ['SOLICITACAO_RECUSADA', 'ATENDIMENTO_CANCELADO'].includes(tipo)
    ? validarMotivo(motivo) : null;
  // Lista fechada de campos: tokens e objetos arbitrarios nunca sao persistidos.
  const resultado = await client.query(`
    INSERT INTO historico_atendimentos
      (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, tutor_id, motivo)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, criado_em`,
  [atendimentoId, tipo, estadoAnterior, estadoNovo, usuarioId, tutorId, motivoNormalizado]);
  return resultado.rows[0];
}
module.exports = { registrarEventoAtendimento };
