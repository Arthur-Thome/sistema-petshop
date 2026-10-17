# Etapa 21 — Bloco D6: integração final do agendamento público

## Integração e correções

O endpoint público de disponibilidade omite horários cujo instante já passou em `America/Sao_Paulo`, inclusive no dia atual. O backend de criação valida novamente a raça e, para `Não sei informar`, o porte do pet associado à sessão, mesmo em chamadas diretas à API. A validação da interface exige porte somente para raça não identificada. Respostas de conflito agora carregam códigos estáveis para o frontend orientar o cliente à etapa de pet, serviços ou agenda. Ao recomeçar a identificação, o portal remove a sessão pública anterior; campos de cadastro continuam preservados durante a navegação e a recuperação de sessão expirada.

As respostas internas de fila, lista e detalhe convertem `agendado_para` (timestamp sem fuso no banco) para o instante correspondente em `America/Sao_Paulo`; as telas internas formatam esse instante no mesmo fuso. A fila e os detalhes continuam exibindo raça/porte, tutor, serviços, valores, observações e histórico operacional. A confirmação continua criando cobrança somente após decisão da equipe; recusa/cancelamento e regras financeiras permanecem nos contratos D4/D5.

## Ativação em ambiente definitivo

Antes de ativar o código, aplicar explicitamente em transação somente as migrations ausentes, nesta ordem: `027_estados_confirmacao_publica.sql`, `028_historico_atendimentos.sql`, `029_reutilizacao_segura_horarios.sql`, `030_verificacao_email_publico.sql` e `031_porte_gigante_pet.sql`. Não há migration runner na inicialização; a instalação limpa segue a mesma ordem em `schema.sql`. Nunca aplicar essas migrations pelo processo de inicialização da aplicação.

O canal de verificação requer SMTP funcional via `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER` e `EMAIL_PASSWORD`, e `CLIENTE_PUBLICO_PEPPER` com pelo menos 32 bytes aleatórios, idêntico em todas as instâncias que compartilham desafios. O inicializador local mantém pepper persistente no armazenamento privado e encaminha e-mails somente ao SMTP sink em loopback. Testes automatizados usam SMTP local capturador e fixtures de banco simuladas; não entregam mensagens externas. O teste com o provedor real continua separado e exige autorização antes do envio.

Ressalva preservada: o bootstrap histórico de `pg_dump` 18.6 contém `\restrict`/`\unrestrict`, metacomandos incompatíveis com o cliente local `psql` 17.0. A estrutura foi validada em cópia temporária sem essas linhas; a compatibilidade do bootstrap original com esse cliente continua pendente. O bootstrap histórico não foi alterado.

## Validação e limites

Os testes D6 essenciais cobrem filtros de horário passado, validação de raça/porte no backend e continuidade de solicitação para raça conhecida sem porte. As suítes D2–D5 cobrem verificação, cadastro, decisões de equipe, financeiro e histórico. Build e verificações sintáticas são executadas na validação desta etapa. Testes automatizados não enviam e-mails e os testes SQL devem usar cluster PostgreSQL temporário comprovadamente isolado; a concorrência real precisa ser validada nesse ambiente antes da ativação.
