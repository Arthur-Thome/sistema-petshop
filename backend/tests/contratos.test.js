const c = require('../src/contracts/atendimentoPublico');
describe('Contrato D1 (sem persistencia operacional)', () => {
  test.each(c.PERFIS_DECISAO)('%s decide diretamente', perfil => {
    expect(c.validarDecisao({ perfil, acao: 'CONFIRMAR', estado: 'AGUARDANDO_CONFIRMACAO', horarioFuturo: true })).toBe('AGENDADO');
    expect(c.validarDecisao({ perfil, acao: 'RECUSAR', estado: 'AGUARDANDO_CONFIRMACAO', motivo: 'Sem capacidade' })).toBe('RECUSADO');
    expect(c.validarDecisao({ perfil, acao: 'CANCELAR', estado: 'AGENDADO', motivo: 'Desistencia', pagamento: 'ESTORNADO' })).toBe('CANCELADO');
  });
  test.each(['RECUSADO', 'CANCELADO', 'FINALIZADO', 'EM_ATENDIMENTO', 'AGENDADO'])('nao confirma %s', estado => {
    expect(() => c.validarDecisao({ perfil: 'funcionario', acao: 'CONFIRMAR', estado, horarioFuturo: true })).toThrow('ESTADO_INCOMPATIVEL');
  });
  test.each([
    [{ perfil: null }, 'NAO_AUTENTICADO'],
    [{ perfil: 'cliente' }, 'PERFIL_NAO_PERMITIDO'],
    [{ horarioFuturo: false }, 'HORARIO_PASSADO'],
    [{ pagamento: 'PENDENTE' }, 'FINANCEIRO_INCONSISTENTE'],
    [{ acao: 'RECUSAR', motivo: ' \n\t' }, 'MOTIVO_OBRIGATORIO'],
    [{ acao: 'CANCELAR', estado: 'AGENDADO', motivo: 'Teste', pagamento: 'PAGO' }, 'PAGAMENTO_EXIGE_ESTORNO'],
  ])('rejeita decisao invalida %#', (alteracoes, codigo) => {
    expect(() => c.validarDecisao({ perfil: 'funcionario', acao: 'CONFIRMAR', estado: 'AGUARDANDO_CONFIRMACAO', horarioFuturo: true, ...alteracoes })).toThrow(codigo);
  });
  test('raca livre respeita coluna real de 100 caracteres e sinaliza conferencia', () => {
    expect(c.validarRaca(' SRD ')).toEqual({ raca: 'SRD', conferir: false });
    expect(c.validarRaca('Não sei informar').conferir).toBe(true);
    expect(() => c.validarRaca(' ')).toThrow('RACA_OBRIGATORIA');
    expect(() => c.validarRaca('x'.repeat(101))).toThrow('RACA_INVALIDA');
  });
  test.each([[true, true, 'DISPONIVEL'], [true, false, 'BLOQUEADO'], [false, true, 'BLOQUEADO'], [false, false, 'BLOQUEADO']])('liberacao %s/%s', (aberto, publicado, esperado) => {
    expect(c.estadoAposLiberacao({ aberto, publicado })).toBe(esperado);
  });
  test.todo('HTTP operacional: solicitar sem cobranca, confirmar e reservar atomicamente');
  test.todo('PostgreSQL isolado: duas confirmacoes/reservas concorrentes');
  test.todo('HTTP operacional: recusa/cancelamento, estorno e reutilizacao (029)');
  test.todo('HTTP operacional: complementar raca somente de pet vinculado');
  test.todo('HTTP operacional: dashboard, PIX e pagamentos rejeitam pendentes/recusados');
});
