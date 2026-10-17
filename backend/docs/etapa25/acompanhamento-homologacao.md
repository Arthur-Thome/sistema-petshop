# Etapa 25 — acompanhamento dos testes manuais

Este tracker é a fonte de acompanhamento humano. Todos os casos começam em **Aguardando teste manual**. Testes automatizados, inspeção de código, build e testes SQL não alteram esse estado. O executor deve preencher erro/observações após cada tentativa; apenas o usuário pode marcar **Aprovado pelo usuário**. Para serviço externo ausente, manter o estado manual pendente e anotar `Pendente externo` nas observações.

| ID | Funcionalidade | Perfil | Print / captura ao concluir | Situação | Erro encontrado | Observações / data / executor |
|---|---|---|---|---|---|---|
| HML-001 | Login válido por perfil | Funcionário, gerente, administrador | HML-001-login-perfis.png | Aguardando teste manual | ____ | ____ |
| HML-002 | Credenciais inválidas e logout | Funcionário | HML-002-login-logout.png | Aguardando teste manual | ____ | ____ |
| HML-003 | Recuperação e redefinição de senha | Funcionário | HML-003-redefinicao.png | Aguardando teste manual | ____ | ____ |
| HML-004 | Dashboard e estado vazio/erro | Todos | HML-004-dashboard.png | Aguardando teste manual | ____ | ____ |
| HML-005 | Cadastrar e pesquisar tutor | Funcionário | HML-005-tutor-lista.png | Aguardando teste manual | ____ | ____ |
| HML-006 | Validações e duplicidade de tutor | Funcionário | HML-006-validacao-tutor.png | Aguardando teste manual | ____ | ____ |
| HML-007 | Editar/inativar tutor e preservar vínculos | Funcionário | HML-007-detalhe-tutor.png | Aguardando teste manual | ____ | ____ |
| HML-008 | Pet, raça livre, porte e foto | Funcionário | HML-008-pet-detalhe.png | Aguardando teste manual | ____ | ____ |
| HML-009 | Complementar raça/porte | Funcionário | HML-009-edicao-raca-porte.png | Aguardando teste manual | ____ | ____ |
| HML-010 | Vínculos e isolamento entre tutores | Funcionário e cliente HML | HML-010-vinculos-pets.png | Aguardando teste manual | ____ | ____ |
| HML-011 | Consultar/cadastrar serviço | Gerente, administrador | HML-011-servicos.png | Aguardando teste manual | ____ | ____ |
| HML-012 | Editar/inativar serviço e snapshots | Gerente, administrador | HML-012-snapshot-servico.png | Aguardando teste manual | ____ | ____ |
| HML-013 | Cadastrar produto e saldo | Gerente, administrador | HML-013-produto.png | Aguardando teste manual | ____ | ____ |
| HML-014 | Entradas, saídas e mínimo de estoque | Gerente, administrador | HML-014-movimentacao-estoque.png | Aprovado pelo usuário | — | 16/10/2026: HML Shampoo Aurora: saldo 5, entrada 2 (7), saída 1 (6), tentativa inválida de saída 7 sem alteração, saída 5 (saldo 1), mínimo 2/alerta baixo; três movimentações válidas com autoria correta. Correção da previsão enganosa validada em `previsaoEstoque.test.js`. |
| HML-015 | Permissões e histórico de estoque | Todos | HML-015-permissoes-estoque.png | Aguardando teste manual | ____ | ____ |
| HML-016 | Entrada na creche | Funcionário | HML-016-entrada-creche.png | Aguardando teste manual | ____ | ____ |
| HML-017 | Saída e histórico da creche | Funcionário | HML-017-historico-creche.png | Aguardando teste manual | ____ | ____ |
| HML-018 | Busca e estados vazios da creche | Funcionário | HML-018-creche-busca.png | Aguardando teste manual | ____ | ____ |
| HML-019 | Criar reserva de hotel | Funcionário | HML-019-reserva-hotel.png | Aguardando teste manual | ____ | ____ |
| HML-020 | Check-in, check-out e histórico hotel | Funcionário | HML-020-hotel-checkin-checkout.png | Aguardando teste manual | ____ | ____ |
| HML-021 | Cancelamento/reativação de reserva | Funcionário/gestão conforme permissão | HML-021-cancelamento-hotel.png | Aguardando teste manual | ____ | ____ |
| HML-022 | Criar atendimento interno | Funcionário | HML-022-atendimento-criado.png | Aguardando teste manual | ____ | ____ |
| HML-023 | Iniciar e finalizar atendimento | Funcionário | HML-023-atendimento-finalizado.png | Aguardando teste manual | ____ | ____ |
| HML-024 | Cancelamento e integridade financeira | Todos, conforme autorização financeira | HML-024-cancelamento-atendimento.png | Aguardando teste manual | ____ | ____ |
| HML-025 | Comprovante PDF | Funcionário | HML-025-comprovante-tela.png | Aguardando teste manual | ____ | ____ |
| HML-026 | Alias legado de Atendimentos | Funcionário | HML-026-alias-atendimentos.png | Aguardando teste manual | ____ | ____ |
| HML-027 | Identificação de tutor existente por e-mail | Cliente HML | HML-027-identificacao-publica.png | Aprovado pelo usuário | — | 16/10/2026: Aurora identificada, código confirmado e somente Nuvem exibido. Automação cobre envio/sink, reenvio, invalidação, uso único, expiração e bloqueio após 5 tentativas. |
| HML-028 | Cadastro público de tutor novo | Cliente HML | HML-028-novo-tutor-verificado.png | Aprovado — evidência mista | — | Fluxo positivo de Brisa/Faísca aprovado manualmente pelo usuário. Em 16/10/2026, Edge headless real confirmou no navegador: raça vazia bloqueada; “Não sei informar” sem porte bloqueado; mensagens nativas em pt-BR; dados mantidos; cadastro corrigido concluído após verificação no SMTP sink local. As negativas são evidência automatizada de navegador, não homologação manual. |
| HML-029 | Adicionar pet e complementar dados públicos | Cliente HML | HML-029-adicionar-pet-publico.png | Aguardando teste manual | ____ | ____ |
| HML-030 | Solicitação pública ponta a ponta | Cliente HML | HML-030-solicitacao-recebida.png | Aprovado pelo usuário | — | Usuário confirmou os resultados de Nuvem e Faísca na sessão sintética; não houve novo envio real. |
| HML-031 | Fila: confirmar e recusar | Todos os perfis internos | HML-031-fila-confirmacao-recusa.png | Aprovado pelo usuário | — | Usuário confirmou Nuvem como Agendado e Faísca recusada/no Histórico de Atendimentos. Eventos e motivo também foram verificados na auditoria isolada. |
| HML-032 | Concorrência e reutilização de horário | Dois clientes HML e funcionário | HML-032-conflito-horario.png | Aguardando teste manual | ____ | ____ |
| HML-033 | Agenda e alteração de disponibilidade | Todos, autorizador quando aplicável | HML-033-agenda-publica-interna.png | Aguardando teste manual | ____ | ____ |
| HML-034 | Sessão pública expirada | Cliente HML | HML-034-sessao-expirada.png | Aguardando teste manual | ____ | ____ |
| HML-035 | Pagamento/PIX sem transação real | Gestor/admin; funcionário conforme regra | HML-035-pagamento-pix.png | Aguardando teste manual | ____ | ____ |
| HML-036 | Pendências financeiras e autorização | Gerente, administrador e tentativa de funcionário | HML-036-pagamentos-pendentes.png | Aguardando teste manual | ____ | ____ |
| HML-037 | Estorno e cancelamento | Gerente/admin; funcionário com autorização válida | HML-037-estorno.png | Aguardando teste manual | ____ | ____ |
| HML-038 | WhatsApp manual sem envio real | Funcionário | HML-038-whatsapp-manual.png | Aguardando teste manual | ____ | ____ |
| HML-039 | WhatsApp Business simulado | Gerente/admin autorizado | HML-039-whatsapp-simulado.png | Aguardando teste manual | ____ | Meta real é pendência externa; não enviar mensagem real. |
| HML-040 | Notificações e preferência exclusiva | Todos | HML-040-central-notificacoes.png | Aguardando teste manual | ____ | ____ |
| HML-041 | Relatórios operacionais | Funcionário/gerência conforme conteúdo | HML-041-relatorio-operacional.png | Aguardando teste manual | ____ | ____ |
| HML-042 | Relatório financeiro e bloqueio | Gerente, administrador; tentativa funcionário | HML-042-relatorio-financeiro.png | Aguardando teste manual | ____ | ____ |
| HML-043 | Exportar CSV e imprimir PDF | Gerente/administrador | HML-043-exportacao.png | Aguardando teste manual | ____ | ____ |
| HML-044 | Conteúdo institucional e Home | Gerente/admin; público | HML-044-site-publico.png | Aguardando teste manual | ____ | Conteúdo verdadeiro depende de confirmação da empresa. |
| HML-045 | Premiações e galeria | Gerente/admin; tentativa funcionário | HML-045-galeria-publicada.png | Aguardando teste manual | ____ | Armazenamento cloud real é pendência externa. |
| HML-046 | Administração de usuários | Administrador | HML-046-administracao-usuarios.png | Aguardando teste manual | ____ | ____ |
| HML-047 | Auditoria e histórico | Administrador; tentativa demais perfis | HML-047-auditoria.png | Aguardando teste manual | ____ | ____ |
| HML-048 | Matriz de permissões e API | Todos | HML-048-matriz-permissoes.png | Aguardando teste manual | ____ | Nunca registrar token/cookie na evidência. |
| HML-049 | Responsividade e URLs diretas | Interno e público | HML-049-responsividade.png | Aguardando teste manual | ____ | Anotar navegador e resolução. |
| HML-050 | Erros, validações e recuperação | Funcionário e cliente HML | HML-050-mensagem-erro-recuperacao.png | Aguardando teste manual | ____ | ____ |

## Consolidação do Lote 1 — 16/10/2026

O escopo autorizado é PUB-01/02, PUB-04, PROD-01, ATEND-02, EST-01, AGPUB-07, CSP/API same-origin e defeitos diretamente vinculados. Os resultados abaixo se limitam às evidências informadas pelo usuário, ao estado sintético auditado e às execuções automatizadas registradas.

### Evidências por requisito

| Requisito | Evidência automatizada | Evidência manual disponível | Situação |
|---|---|---|---|
| PUB-01/02 — solicitações públicas | `solicitacoesAtendimento.test.js`, `solicitacoesAtendimentoPostgres.test.js` e `lote1ConcorrenciaPostgres.test.js`; transições, reservas, cobrança após confirmação e concorrência cobertas. Edge + API temporária confirmaram criação, reserva, confirmação de Nuvem e recusa de Faísca. | Usuário confirmou Nuvem como Agendado e Faísca recusada. | Aprovado nos cenários observados. |
| PUB-04 — identificação por e-mail | `clientePublicoD2.test.js` e `emailVerificationSmtp.integration.test.js`; solicitação, sink local, reenvio, invalidação do código anterior, uso único, expiração, bloqueio após 5 tentativas e validações do cadastro. Automação Edge confirmou cadastro novo e identificação Aurora no sink local. | HML-027 aprovado pelo usuário; HML-028 positivo aprovado pelo usuário. A única mensagem real autorizada foi recebida no Gmail em 16/10/2026 às 15:13 BRT. | Aprovado; negativas de HML-028 confirmadas por automação de navegador. Nenhum novo e-mail real foi enviado. |
| PROD-01 — detalhes dos produtos | `produtoDetalhes.test.js` e `frontend/tests/produtoRoutes.test.js`; autenticação, 404, permissões e rota da ficha cobertas. | Usuário confirmou ficha de Condicionador — Homologação e HML Shampoo Aurora, produto inexistente, permissões visuais de Funcionário/Gerente, informações, saldo, mínimo, valor, três movimentações/autoria e alerta baixo. | Aprovado pelo usuário, limitado aos cenários descritos. |
| ATEND-02 — histórico operacional | `historico.test.js`, `solicitacoesAtendimento.test.js`, PostgreSQL temporário e Edge; ordem, autoria, motivo, ausência de pagamento na recusa e snapshot R$ 45,00 foram validados. Nuvem possui pagamento pendente após confirmação. | Usuário confirmou Faísca no Histórico de Atendimentos. | Aprovado: interface automatizada exibiu recebimento antes da confirmação/recusa e apresentou o motivo junto à recusa. |
| EST-01 — integridade do estoque | `estoqueD1.test.js`, `produtoDetalhes.test.js`, `lote1ConcorrenciaPostgres.test.js` e novos testes da previsão de saída; backend recusa saída acima do saldo. | Usuário aprovou entrada 2, saída 1, rejeição de saída 7 sem alteração, saída 5, saldo 1, mínimo 2, alerta e autoria das três movimentações válidas. | Aprovado pelo usuário. |
| AGPUB-07 — proteção da Agenda Pública | `agendaProtecaoHorariosD1.test.js` e `lote1ConcorrenciaPostgres.test.js`; horário reservado/ocupado preservado em alterações. | Usuário aprovou tentativa de excluir horário reservado, que foi recusada. | Aprovado pelo usuário. |
| Correção CSP/API same-origin | `resolverBaseApi`, testes de URL/proxy, build, lint e Edge na porta aleatória da sessão; requisições do fluxo público permaneceram na origem atual, sem chamadas à porta 3001. CSP local preservou `connect-src 'self'` e permitiu a API. | Verificação manual anterior no Edge cobriu login, rotas autenticadas e ciclos online/offline sem bloqueio CSP. | Aprovada; bundle atual servido pelo backend temporário. |
| SMTP e credenciais privadas | Sink de homologação, ACL, pepper persistente e inicialização segura cobertos nas etapas anteriores. | Recebimento Gmail confirmado pelo usuário após a única tentativa real autorizada. | Aprovado; nenhum envio adicional autorizado ou realizado. |

HML-028 foi validado no formulário real do Edge headless: ambas as condições inválidas bloquearam o envio, mantiveram os campos preenchidos e mostraram a mensagem nativa em português; ao corrigir raça/porte, o código chegou ao sink local, foi confirmado e o cadastro Tutor/Pet foi concluído. O cadastro positivo manual previamente informado pelo usuário continua registrado separadamente. Nenhuma mensagem real foi enviada.

### Verificações técnicas desta auditoria

- Backend completo: 32 suítes aprovadas; 2 ignoradas; 226 testes aprovados e 4 ignorados.
- Frontend: 33 testes aprovados; ESLint aprovado; build Vite aprovado com 188 módulos.
- PostgreSQL descartável: 4 suítes e 27 testes aprovados; cluster temporário validado e removido. A primeira tentativa de `initdb` foi bloqueada pelo token restrito do sandbox; a repetição aprovada fora do sandbox concluiu normalmente.
- Edge headless + sessão descartável: HML-028 negativo/positivo e ATEND-02 passaram; duas mensagens foram aceitas somente pelo sink sintético; teste confirmou o fallback de Pet sem foto, solicitação de Nuvem com pagamento pendente, Faísca recusada sem cobrança e snapshot de R$ 45,00, saldo e mínimo de estoque intactos e zero movimentações.
- Soma dos testes automatizados de backend, frontend e PostgreSQL: 286 aprovados, 4 ignorados, 0 falhas na execução final. A automação Edge passou além desses contadores de suíte.
- Nenhuma verificação acessou ou alterou `sistema_petshop` ou `amores_pet_homologacao`; não havia mudança de schema que exigisse leitura desses bancos.

### Sessão temporária e encerramento

A sessão antiga foi inspecionada e encerrada pelo helper oficial antes de preservar sua auditoria: ela executava backend anterior, que listava Faísca com total R$ 0,00 embora o snapshot fosse R$ 45,00. A sessão limpa final serviu o bundle atual e o backend atualizado; inspeção oficial confirmou Nuvem `AGENDADO`, total R$ 45,00, pagamento `PENDENTE`, sem método/foto cadastrada; Faísca `RECUSADO`, total histórico e snapshot de R$ 45,00, sem pagamento, eventos de recebimento/decisão e motivo preservados. A automação Edge registrou 2 verificações confirmadas, 2 solicitações (uma agendada e uma recusada), 4 eventos, 2 mensagens exclusivamente sintéticas, zero destinatários externos e zero movimentações de estoque; saldo inicial continuou 5, mínimo 2. O cluster PostgreSQL temporário foi removido pelo encerrador oficial depois da auditoria. O sink aceita somente `@example.invalid` em loopback.

### Pendências obrigatórias para 100%

Nenhuma. As validações negativas de HML-028 e a exibição da linha do tempo/motivo em ATEND-02 foram confirmadas por automação real do navegador. PROD-01 foi reconciliado com o relato manual do usuário. A sessão descartável final foi encerrada com auditoria preservada.

Os estados dos demais casos HML/lotes não foram alterados.

## Formulário de incidente por caso

- **ID do caso / tentativa:**
- **Data e hora local:**
- **Versão da aplicação, branch e ambiente:**
- **Perfil:**
- **Pré-requisitos/dados sintéticos:**
- **Passos reproduzíveis:**
- **Esperado:**
- **Observado:**
- **HTTP/ID de requisição, se disponível (sem headers/token):**
- **Prints associados:**
- **Erro encontrado:**
- **Correção realizada e teste técnico focalizado:**
- **Reteste manual solicitado em:**
- **Situação final pelo usuário:** Aguardando teste manual / Erro encontrado / Correção realizada / Aprovado pelo usuário / Pendente externo
- **Observações:**

## Pendências visuais acumuladas

- **CSS-01 — Padronização visual de botões:** incluir os botões **Cancelar** e **Usar esta foto** do modal “Ajustar enquadramento” na revisão conjunta de estilos. A pendência é somente visual; os controles funcionais permanecem disponíveis.
