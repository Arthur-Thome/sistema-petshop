# Etapa 21 — D1: infraestrutura e contratos

Base: e9c5cf6. Regras aprovadas nesta tarefa substituem o comportamento
anterior descrito no item 20 do AGENTS.md. D1 **nao ativa** o novo fluxo:
controllers, telas e rotas operacionais continuam como antes. Nao publicar
o fluxo novo apenas aplicando 027/028: faltam os blocos seguintes.

## Implementado versus preparado

- `app.js` exporta Express sem listen e sem dotenv. `server.js` permanece
  o ponto de entrada de producao, carrega dotenv e inicia a mesma porta.
- `src/contracts/atendimentoPublico.js`: vocabulario, validacao pura de
  decisoes, motivos, raca (100 caracteres, limite real do schema) e liberacao.
- `historicoAtendimentoService.js`: INSERT por PoolClient fornecido; falhas
  propagam. O chamador deve abrir transacao, validar identidade e fazer rollback.
- 027 amplia CHECKs, sem UPDATE de registros/defaults; 028 cria historico.
  Tutor solicitante fica no evento SOLICITACAO_CRIADA; nao confundir com
  tutor principal atual do pet. Novas consultas devem usar essa autoria.
- Nenhuma rota futura foi registrada. Testes do harness de contrato nao
  comprovam persistencia nem implementacao HTTP operacional.

## Estados e transicoes aprovadas

| Acao | Atendimento | Slot | Financeiro |
|---|---|---|---|
| Solicitar | AGUARDANDO_CONFIRMACAO | DISPONIVEL -> RESERVADO | Sem pagamento; snapshots em banho_tosa_servicos |
| Confirmar | AGUARDANDO_CONFIRMACAO -> AGENDADO | RESERVADO -> OCUPADO | Criar PENDENTE uma vez |
| Recusar | AGUARDANDO_CONFIRMACAO -> RECUSADO | Liberar condicionalmente | Sem pagamento |
| Cancelar | AGUARDANDO_CONFIRMACAO/AGENDADO -> CANCELADO | Liberar condicionalmente | PENDENTE -> CANCELADO; ESTORNADO intacto |
| Iniciar/finalizar | AGENDADO -> EM_ATENDIMENTO -> FINALIZADO | Manter vinculo | Fluxo existente |

Sem expiracao automatica. Recusa/cancelamento exigem motivo nao vazio,
maximo 2000 caracteres, usuario e data/hora. Libera DISPONIVEL somente
quando dia aberto E publicado; senao BLOQUEADO. Estorno nao cancela nem
libera automaticamente. PAGO exige estorno anterior autorizado. Valores,
metodo, data original e dados de ESTORNADO nunca sao sobrescritos.
Antigos e criados internamente mantem seus estados e defaults.

Funcionario, gerente e administrador decidem diretamente (backend).
Confirmacao de pagamento: somente gerente/administrador. Estorno por
funcionario exige autorizador gerente/administrador ativo. Auditoria geral
continua exclusiva do administrador. Autorizacao de manutencao de agenda
nao muda; liberar slot como consequencia da decisao nao e abertura geral.

America/Sao_Paulo e o fuso operacional. Sob lock, comparar o instante do
slot `(data + horario) AT TIME ZONE 'America/Sao_Paulo' > clock_timestamp()`.
Nao usar relogio do navegador nem CURRENT_TIMESTAMP iniciado antes de espera
por lock. Confirmacao tardia retorna HORARIO_PASSADO, exige reagendamento
futuro explicito; nunca alterar data silenciosamente. Sem antecedencia extra.

Raca: texto livre obrigatorio para novos agendamentos, inclusive internos.
Aceitar SRD e Nao sei informar (forma de exibicao: “Não sei informar”);
esta ultima sinaliza conferencia da equipe. Pets antigos sem raca recebem
complementacao no proximo agendamento; UPDATE publico deve validar pet_tutores
com tutor da sessao, nunca ID de tutor do body. Equipe pode corrigir.
Nao impor NOT NULL retroativo nem inventar raca. Endpoints ficam para D2+.

## Contratos HTTP futuros (nao ativos em D1)

| Metodo e rota | Contrato |
|---|---|
| POST /api/agendamento-publico/solicitacoes | Sessao publica; pet_id, horario_id, servicos[], observacoes; 201 com id, status e pagamento=null |
| GET /api/agendamento-publico/solicitacoes/:id | Apenas tutor solicitante; 404 para registro alheio |
| PATCH /api/agendamento-publico/meus-pets/:id/raca | Sessao e vinculo; body {raca}; 200 |
| GET /api/atendimentos/solicitacoes | Tres perfis; paginacao e filtros; fila operacional |
| PATCH /api/atendimentos/:id/confirmar | Tres perfis; estado e horario validados no banco; 200 |
| PATCH /api/atendimentos/:id/recusar | Tres perfis; {motivo}; 200 |
| PATCH /api/atendimentos/:id/cancelar | Rota existente; preservar body {motivo_cancelamento}; ampliar estados em bloco posterior |
| GET /api/atendimentos/:id/historico | Historico operacional, nao acesso a logs administrativos |

Erros novos: `{codigo, mensagem}`. 400 para dados/motivo/raca invalidos;
401 sessao ausente/expirada; 403 perfil proibido; 404 recurso alheio/ausente;
409 ESTADO_INCOMPATIVEL, HORARIO_INDISPONIVEL, HORARIO_PASSADO,
PAGAMENTO_EXIGE_ESTORNO, FINANCEIRO_INCONSISTENTE, SERVICO_INATIVO; 429 limites.
Nao reinterpretar qualquer erro SQL 23505 como conflito de slot.
A rota publica atual /confirmar e o alias interno /api/banho-tosa exigem
adaptacao coordenada, sem rota antiga contornando a confirmacao da equipe.

Eventos fechados: SOLICITACAO_CRIADA (ator tutor), SOLICITACAO_CONFIRMADA,
SOLICITACAO_RECUSADA, ATENDIMENTO_CANCELADO (ator usuario). Estado anterior,
novo, motivo e criado_em TIMESTAMPTZ; FKs RESTRICT preservam autoria/historico.
Nao expor UPDATE/DELETE de eventos. Sem objetos arbitrarios, tokens ou senhas.

## Ordem transacional para D2+

1. Resolver IDs sem confiar no body; obter locks em ordem dia -> slot ->
   atendimento -> pet/vinculo -> pagamento, IDs crescentes em operacoes em massa.
2. Reconsultar vinculos/estado apos locks; se mudaram, retornar conflito.
3. Validar tutor/pet, raca, servicos, aberto/publicado e horario futuro.
4. Gravar atendimento, snapshots, slot, pagamento quando aplicavel e evento
   usando o MESMO client entre BEGIN/COMMIT. Falha de evento exige ROLLBACK.
5. Envio externo so depois do commit. Nunca abrir segunda transacao para
   historico obrigatorio; logService atual absorve erros e nao o substitui.

Alinhar cancelar, confirmar pagamento, estornar e operacoes da agenda a essa
ordem. Dois pedidos/duas decisoes: lock + UPDATE condicionado + indice unico.
Indice atual continua absoluto em D1. **029 adiada**: reutilizacao exige indice
parcial que exclua RECUSADO/CANCELADO e protecao de slots historicos na exclusao
em massa, alem de revalidacao financeira. Mudar so o indice seria incompleto.

## Impactos pendentes obrigatorios

- Dashboard: substituir status <> CANCELADO por conjuntos explicitos; separar
  fila de pedidos de atendimentos confirmados. Receita somente PAGO.
- Listagens/historico: incluir novos estados; pagamento ausente nao e gratuito.
- PIX/pagamento/iniciar: rejeitar AGUARDANDO_CONFIRMACAO e RECUSADO no backend.
- Agenda: RESERVADO protegido como OCUPADO; nao excluir slots com historico.
- Cancelamento: preencher cancelado_em; permitir sem pagamento quando pendente;
  preservar ESTORNADO e bloquear PAGO ate estorno autorizado.
- Frontend/PDF: rotulos de solicitacao versus confirmacao, motivos e autoria;
  nenhuma tela completa e modificada em D1.
- Envio real de codigo, limitadores e recuperacao de sessao: blocos posteriores.

## Executar testes com seguranca

`cd backend` e `npm.cmd test` (Windows) executa Jest/Supertest sem banco,
sem SMTP e sem dotenv. Connection padrao recusa NODE_ENV=test/JEST_WORKER_ID.
Suite atual usa middleware real, JWT ficticio e pool simulado. `test.todo`
marca endpoints operacionais/concorrencia ainda nao implementados.

`tests/support/bancoIsolado.js` e opt-in para suites futuras, nao utilizado
pelo npm test para conexao real. Antes de abrir socket SQL exige `pg_ctl status`
no diretorio solicitado e confere PID, diretorio, porta e endereco no
`postmaster.pid`. O instalador aplica o mesmo preflight local antes de chamar
psql. Exige configuracao explicita (host literal
loopback, porta dedicada diferente de 5432, banco amores_pet_http_test_<32hex>,
usuario amores_test_*, senha exclusiva e dataDirectory dentro do temporario
amores-pet-test-<32hex>/data). Recusa variaveis PG*/PSQL*/DB_*/DATABASE_URL
herdadas. Antes de retornar a conexao verifica identidade real, ausencia do
banco sistema_petshop no cluster, usuario nao-superuser e banco sem objetos.
A role temporaria precisa poder ler data_directory; falta de acesso recusa.
Nenhuma criacao, limpeza, migration ou acesso ao banco principal e automatica.
Usar cluster temporario provisionado separadamente; nunca credenciais reais.
Nao reutilizar banco populado. Operacoes destrutivas exigem aprovacao explicita.

Instalacao estrutural continua via tests/instalacao.cjs, apenas em cluster
isolado, porta nao padrao, sem sistema_petshop e banco vazio. Essa suite grava
estrutura e executa mutacoes revertidas: executar somente com autorizacao
explicita do ambiente de teste. Na validacao final do D1, a instalacao, as
migrations 027/028, verificacao estrutural, integridade e rollback passaram em
PostgreSQL 17 temporario, usando uma copia temporaria do diretorio de banco.

Ressalva do cliente PostgreSQL: o bootstrap original foi gerado por
pg_dump 18.6 e contem os metacomandos `\restrict` e `\unrestrict`, que o
psql local 17.0 nao aceita. O SQL foi validado com uma copia temporaria sem
essas linhas; a compatibilidade do bootstrap original com o cliente local
continua pendente. O bootstrap historico nao foi modificado.

027/028 devem ser aplicadas explicitamente em ordem, em transacao para upgrade
(psql -1), depois de revisar o destino. 028 recusa reexecucao/tabela preexistente;
nao existe migration runner. Instalador novo inclui ambas atomicamente.
Nenhuma migration e aplicada ao iniciar app. Verificador e para instalacao
nova; testes SQL complementam semantica das constraints do historico.

Proximos blocos: D2 fluxo publico/reserva; D3 decisoes e financeiro; D4
reutilizacao/agenda e concorrencia; D5 telas/relatorios e regressao. Parar no D1.
