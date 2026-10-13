// Contrato D1. Ainda nao ligado aos controllers operacionais.
const ESTADOS_ATENDIMENTO = Object.freeze([
  'AGUARDANDO_CONFIRMACAO', 'AGENDADO', 'EM_ATENDIMENTO',
  'FINALIZADO', 'CANCELADO', 'RECUSADO',
]);
const ESTADOS_HORARIO = Object.freeze(['DISPONIVEL', 'RESERVADO', 'OCUPADO', 'BLOQUEADO']);
const ESTADOS_PAGAMENTO = Object.freeze(['PENDENTE', 'PAGO', 'CANCELADO', 'ESTORNADO']);
const PERFIS_DECISAO = Object.freeze(['funcionario', 'gerente', 'administrador']);
const FUSO_OPERACIONAL = 'America/Sao_Paulo';
const TRANSICOES = Object.freeze({
  CONFIRMAR: Object.freeze({ AGUARDANDO_CONFIRMACAO: 'AGENDADO' }),
  RECUSAR: Object.freeze({ AGUARDANDO_CONFIRMACAO: 'RECUSADO' }),
  CANCELAR: Object.freeze({ AGUARDANDO_CONFIRMACAO: 'CANCELADO', AGENDADO: 'CANCELADO' }),
});
const EVENTOS = Object.freeze(['SOLICITACAO_CRIADA', 'SOLICITACAO_CONFIRMADA', 'SOLICITACAO_RECUSADA', 'ATENDIMENTO_CANCELADO']);
const ERROS = Object.freeze({
  NAO_AUTENTICADO: 401, PERFIL_NAO_PERMITIDO: 403, ESTADO_INCOMPATIVEL: 409,
  MOTIVO_OBRIGATORIO: 400, MOTIVO_INVALIDO: 400, HORARIO_PASSADO: 409,
  HORARIO_INVALIDO: 400, HORARIO_INDISPONIVEL: 409, PAGAMENTO_EXIGE_ESTORNO: 409,
  FINANCEIRO_INCONSISTENTE: 409, RACA_OBRIGATORIA: 400, RACA_INVALIDA: 400,
  PET_NAO_VINCULADO: 404, SERVICO_INATIVO: 409, LIMITE_REQUISICOES: 429,
});
function falhar(codigo) {
  const erro = new Error(codigo);
  erro.codigo = codigo;
  erro.status = ERROS[codigo];
  throw erro;
}
function validarMotivo(motivo) {
  if (typeof motivo !== 'string' || !motivo.trim()) falhar('MOTIVO_OBRIGATORIO');
  if (motivo.trim().length > 2000) falhar('MOTIVO_INVALIDO');
  return motivo.trim();
}
function validarRaca(raca) {
  if (typeof raca !== 'string' || !raca.trim()) falhar('RACA_OBRIGATORIA');
  const texto = raca.trim();
  if (texto.length > 100) falhar('RACA_INVALIDA');
  return { raca: texto, conferir: texto.normalize('NFC').toLocaleLowerCase('pt-BR') === 'não sei informar' };
}
function estadoAposLiberacao({ aberto, publicado }) {
  return aberto === true && publicado === true ? 'DISPONIVEL' : 'BLOQUEADO';
}
// horarioFuturo deve vir da consulta SQL sob lock, nunca do body HTTP.
function validarDecisao({ acao, estado, perfil, motivo, horarioFuturo, pagamento = null }) {
  if (!perfil) falhar('NAO_AUTENTICADO');
  if (!PERFIS_DECISAO.includes(perfil)) falhar('PERFIL_NAO_PERMITIDO');
  const destino = Object.hasOwn(TRANSICOES, acao) && Object.hasOwn(TRANSICOES[acao], estado)
    ? TRANSICOES[acao][estado] : null;
  if (!destino) falhar('ESTADO_INCOMPATIVEL');
  if (acao !== 'CONFIRMAR') validarMotivo(motivo);
  if (acao === 'CONFIRMAR' && horarioFuturo !== true) falhar('HORARIO_PASSADO');
  if (estado === 'AGUARDANDO_CONFIRMACAO' && pagamento !== null) falhar('FINANCEIRO_INCONSISTENTE');
  if (acao === 'CANCELAR' && estado === 'AGENDADO') {
    if (pagamento === 'PAGO') falhar('PAGAMENTO_EXIGE_ESTORNO');
    if (!['PENDENTE', 'ESTORNADO'].includes(pagamento)) falhar('FINANCEIRO_INCONSISTENTE');
  }
  return destino;
}
module.exports = { ESTADOS_ATENDIMENTO, ESTADOS_HORARIO, ESTADOS_PAGAMENTO,
  PERFIS_DECISAO, FUSO_OPERACIONAL, TRANSICOES, EVENTOS, ERROS,
  validarDecisao, validarMotivo, validarRaca, estadoAposLiberacao };
