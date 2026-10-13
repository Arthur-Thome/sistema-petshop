const { registrarEventoAtendimento } = require('../src/services/historicoAtendimentoService');
const evento = { atendimentoId: 1, tipo: 'SOLICITACAO_RECUSADA', estadoAnterior: 'AGUARDANDO_CONFIRMACAO',
  estadoNovo: 'RECUSADO', usuarioId: 2, motivo: ' Sem capacidade ' };
test('historico usa client recebido e campos fechados; nao faz COMMIT', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }] }), release: jest.fn() };
  await registrarEventoAtendimento(client, { ...evento, token: 'nao-persistir' });
  expect(client.query).toHaveBeenCalledTimes(1);
  expect(client.query.mock.calls[0][1]).toEqual([1, 'SOLICITACAO_RECUSADA', 'AGUARDANDO_CONFIRMACAO', 'RECUSADO', 2, null, 'Sem capacidade']);
  expect(client.release).not.toHaveBeenCalled();
});
test('falha de historico propaga para rollback do chamador', async () => {
  const client = { query: jest.fn().mockRejectedValue(new Error('Falha SQL')), release: jest.fn() };
  await expect(registrarEventoAtendimento(client, evento)).rejects.toThrow('Falha SQL');
});
test('rejeita pool global, ator ambiguo e transicao invalida', async () => {
  await expect(registrarEventoAtendimento({ query() {} }, evento)).rejects.toThrow('PoolClient');
  const client = { query: jest.fn(), release() {} };
  await expect(registrarEventoAtendimento(client, { ...evento, tutorId: 3 })).rejects.toThrow('Ator');
  await expect(registrarEventoAtendimento(client, { ...evento, estadoAnterior: 'FINALIZADO' })).rejects.toThrow('Transicao');
  expect(client.query).not.toHaveBeenCalled();
});
