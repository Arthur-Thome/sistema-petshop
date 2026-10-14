# Etapa 21 — Bloco D4: solicitações públicas e decisão da equipe

## Fluxo público

O endpoint legado `POST /api/agendamento-publico/confirmar` foi preservado por compatibilidade, mas agora cria uma solicitação `AGUARDANDO_CONFIRMACAO`. Na mesma transação grava os snapshots atuais de serviços/preços, altera o slot de `DISPONIVEL` para `RESERVADO` e registra `SOLICITACAO_CRIADA` com o tutor comprovado pela sessão. Não cria pagamento. A resposta informa que a solicitação aguarda confirmação da equipe; o frontend não a apresenta como agendamento confirmado.

Dia e slot são bloqueados em ordem (dia -> horário) antes de validar disponibilidade. O slot reservado impede outra solicitação. A unicidade histórica do slot continua sendo uma segunda barreira contra duplicidade.

## Fila e transições internas

`GET /api/atendimentos/solicitacoes` lista apenas solicitações pendentes, em ordem de recebimento, com dados operacionais do pet, tutor de origem obtido pelo evento de criação, serviços e observações necessárias. `GET /api/atendimentos/:id/historico` expõe somente a trilha operacional D1 a usuários internos autenticados.

`PATCH /api/atendimentos/:id/confirmar` e `PATCH /api/atendimentos/:id/recusar` estão disponíveis aos três perfis internos por autenticação existente. Confirmação exige estado pendente, slot ainda `RESERVADO`, agenda aberta/publicada, pet/tutor ativo e vínculo original preservado, serviços ativos, snapshots válidos e horário futuro interpretado em `America/Sao_Paulo`. Em uma transação única, muda atendimento para `AGENDADO`, slot para `OCUPADO`, cria uma única cobrança `PENDENTE` pelo total dos valores snapshot e grava `SOLICITACAO_CONFIRMADA` com autor real.

Recusa exige motivo não vazio de até 2.000 caracteres, muda somente `AGUARDANDO_CONFIRMACAO` para `RECUSADO` e registra `SOLICITACAO_RECUSADA`, autoria e motivo. Se o dia não estiver aberto e publicado, o slot passa a `BLOQUEADO`. Se estiver aberto e publicado, a solicitação fica recusada, mas o slot permanece `RESERVADO`: o índice único atual é absoluto e impede reutilização segura com histórico. A disponibilização efetiva fica para o D5/migration 029; não se remove vínculo nem se contorna a unicidade nesta etapa.

## Financeiro, operação e dashboard

Atendimentos pendentes não aparecem em ativos ou próximos atendimentos e não têm cobrança. Iniciar/finalizar continuam condicionados aos estados `AGENDADO`/`EM_ATENDIMENTO`; a confirmação de pagamento rejeita estados pendentes/recusados, e as permissões existentes de pagamento/estorno permanecem inalteradas. O dashboard separa a contagem e o alerta de solicitações da contagem de atendimentos do dia. A lista de histórico passou a incluir `RECUSADO`.

## Banco e ativação

Não foi necessária migration D4: estados, constraints e `historico_atendimentos` vêm das migrations 027/028. A instalação existente também precisa conter as migrations D2/D3 (`030` e `031`). Antes de ativar o código em um ambiente existente, confirmar que 027, 028, 030 e 031 foram aplicadas e que `historico_atendimentos`/estados estão presentes; não há execução automática na inicialização. Nenhuma migration foi aplicada nesta implementação.

## Validação

Os testes D4 focam no pedido pendente sem cobrança, reserva temporária, confirmação por funcionário/gerente/administrador, pagamento único, confirmação tardia, recusa com motivo, bloqueio em dia fechado, e bloqueio operacional/financeiro de pendências. Testes com banco real/concor­rência devem usar exclusivamente cluster temporário isolado; a suíte Jest mockada não comprova contenção concorrente PostgreSQL.
