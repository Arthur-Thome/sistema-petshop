# Etapa 21 — Bloco D5: cancelamento e reutilização segura de horários

## Cancelamento operacional

`PATCH /api/atendimentos/:id/cancelar` aceita `AGUARDANDO_CONFIRMACAO` e `AGENDADO` para funcionário, gerente e administrador, com autenticação e perfil conferidos no backend. Exige `motivo_cancelamento` não vazio de até 2.000 caracteres, grava responsável e hora em `cancelado_em`, e acrescenta `ATENDIMENTO_CANCELADO` ao histórico D1 na mesma transação. Atendimentos em execução, finalizados ou já encerrados não são alterados.

O cancelamento aceita ausência de cobrança. Uma cobrança `PENDENTE` passa a `CANCELADO` preservando o registro. `PAGO` retorna `409 PAGAMENTO_EXIGE_ESTORNO`, sem mudanças; após estorno autorizado, `ESTORNADO` é preservado integralmente. Cobrança duplicada ou estado financeiro incompatível retorna conflito antes de qualquer alteração. O cancelamento não concede acesso à confirmação financeira; os perfis da rota de pagamento e as regras próprias de estorno continuam iguais.

## Reuso e histórico

Migration `029_reutilizacao_segura_horarios.sql` substitui os índices únicos absolutos conhecidos do bootstrap (`idx_banho_tosa_agenda_publica_horario`) e da migration 022 (`idx_banho_tosa_agenda_publica_horario_unique`) por um único índice parcial. A unicidade se aplica aos atendimentos vinculados cujo estado não seja `RECUSADO` ou `CANCELADO`; portanto `AGUARDANDO_CONFIRMACAO`, `AGENDADO`, `EM_ATENDIMENTO` e `FINALIZADO` continuam ocupando o slot. A migration não reclassifica nem remove linhas. Se encontrar duas ocupações ativas para o mesmo slot, falha sem corrigir dados.

Na recusa ou no cancelamento, o slot só volta a `DISPONIVEL` quando dia e publicação estão ativos e a data/hora ainda é futura em `America/Sao_Paulo`. Caso contrário fica `BLOQUEADO`. A operação bloqueia em ordem dia → slot → atendimento → cobrança; depois revalida estado, autoria/vínculo e pagamento. A agenda administrativa usa o mesmo lock do dia. Substituição/remoção preserva slots que têm qualquer atendimento histórico, bloqueia históricos inativos fora da oferta e impede remover horários ainda ocupados/reservados ou ligados a atendimento ativo.

## Instalação e ativação

Instalação nova inclui 029 após 028 e antes de 030/031. Upgrade existente deve aplicar explicitamente, em transação (`psql -1`), migrations ainda ausentes em ordem: 027, 028, 029, 030 e 031. O código não executa migrations na inicialização. Antes de aplicar 029, conferir o destino e o estado das migrations. A migration não reclassifica nem remove atendimentos: ela libera apenas slots `RESERVADO`/`OCUPADO` vinculados exclusivamente a atendimentos recusados/cancelados sem cobrança pendente ou paga; mantém o slot disponível somente se o dia continuar aberto, publicado e futuro; nos demais casos o bloqueia. O índice único é substituído dentro da mesma transação e a migration falha sem alterar dados quando encontra ocupações ativas duplicadas. A alteração exige lock breve e falhará se não obtiver lock em 5 segundos.

## Validação

Testes essenciais cobrem transições financeiras e operacionais por HTTP, autorização dos três perfis, bloqueio de pagamentos pagos, preservação de estorno, liberação condicional, histórico e unicidade parcial após recusa/cancelamento. Testes SQL de instalação executam somente em banco novo de cluster temporário isolado. A bateria de integração concorrente deve continuar usando cluster temporário; a suite Jest usa pool simulado e não comprova concorrência real do PostgreSQL.
