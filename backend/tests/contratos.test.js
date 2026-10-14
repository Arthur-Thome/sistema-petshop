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
  const pgIntegrationEnabled = process.env.AMORES_PG_CONCURRENCY_TEST === '1';
  const pgIntegration = pgIntegrationEnabled ? test : test.skip;
  pgIntegration('PostgreSQL isolado: duas confirmacoes/reservas concorrentes e rollback transacional', () => {
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const args = ['src/database/tests/concorrencia_publica.cjs',
      '--host', process.env.AMORES_PG_HOST,
      '--port', process.env.AMORES_PG_PORT,
      '--user', process.env.AMORES_PG_USER,
      '--database', process.env.AMORES_PG_DATABASE,
      '--data-directory', process.env.AMORES_PG_DATA_DIRECTORY,
      '--pg-ctl', process.env.AMORES_PG_CTL];
    const childEnv = { ...process.env, NODE_ENV: 'development', AMORES_TEST_DB_PASSWORD: process.env.AMORES_PG_PASSWORD };
    delete childEnv.JEST_WORKER_ID;
    const result = spawnSync(process.execPath, args, {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true, timeout: 90000,
      env: childEnv,
    });
    expect(result.error).toBeUndefined();
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.stdout + result.stderr).toContain('PASS: concorrencia HTTP');
  }, 100000);
});
