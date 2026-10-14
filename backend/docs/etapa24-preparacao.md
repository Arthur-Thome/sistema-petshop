# Etapa 24 — preparação técnica de produção

## Estado e objetivo

Este documento reúne requisitos e decisões pendentes para planejar uma futura
implantação do Amores Pet. É um roteiro de preparação, não uma declaração de
que a Etapa 24 ou qualquer ambiente de produção foi implantado. Nenhum serviço,
proxy, certificado, segredo, backup, banco ou volume foi configurado por este
documento. Não contém valores de credenciais.

As decisões de negócio e os limites de implantação devem ser aprovados pela
equipe responsável antes da janela de produção. Não presuma provedor, topologia,
capacidade, RPO ou RTO.

## Topologia e transporte HTTPS

O backend atual inicia um servidor HTTP Express em `PORT`. Não há neste
repositório configuração de proxy reverso, domínio, certificado TLS, renovação,
firewall ou serviço de produção. O frontend é compilado separadamente; seu
`VITE_API_URL` é incorporado no build e deve apontar para a API do ambiente
correto. O backend valida `FRONTEND_URL` como origem CORS. Em produção, as
origens devem ser HTTPS e restritas aos domínios aprovados.

Antes da exposição pública, a arquitetura deve definir e documentar:

- Onde TLS termina, quem emite e renova certificados e como a validade é
  monitorada.
- Como impedir acesso público direto à porta Express e manter a API atrás do
  proxy/ingress aprovado.
- Regras de DNS, firewall, portas, cabeçalhos e timeouts entre proxy, frontend,
  backend e PostgreSQL.
- Política de implantação do frontend, API e assets, incluindo cache e
  estratégia de retorno à versão anterior.

O Express não configura `trust proxy`. Essa opção não deve ser habilitada
genericamente: primeiro confirme quantos proxies existem e quais endereços
podem encaminhar tráfego. O rate limit usa o IP observado pelo backend; atrás
de um proxy não confiável, todos podem parecer ter o mesmo IP. Quando a
topologia for conhecida, configure somente os saltos/endereço(s) realmente
confiáveis e teste que cabeçalhos enviados pelo cliente não permitam falsificar
o IP. Helmet e CORS não substituem TLS nem regras de rede. O `server.js` também
não implementa encerramento gracioso do servidor e do pool PostgreSQL; isso
deve ser considerado antes de usar reinícios ou múltiplas instâncias.

## Configuração por ambiente e segredos

Mantenha a configuração no mecanismo de ambiente/segredos escolhido pela
operação. Não coloque segredos em Git, imagens de container, argumentos de
processo, logs, documentação ou artefatos do frontend. A configuração precisa
ser revisada por ambiente e validada antes de iniciar a aplicação.

Inventário a confirmar para a API, sem registrar valores:

| Variável | Uso e observação |
|---|---|
| `PORT` | Porta interna do backend; não implica exposição direta à Internet. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexão PostgreSQL; limitar rede e privilégios da role ao necessário. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Sessões internas; segredo forte e exclusivo por ambiente. |
| `FRONTEND_URL` | Origem CORS exata do frontend daquele ambiente. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` | Transporte SMTP usado por e-mail e identificação pública. |
| `CLIENTE_PUBLICO_PEPPER` | Chave de alta entropia, mínimo de 32 bytes; mesmo valor em instâncias que compartilham desafios. Rotação invalida verificações pendentes. |
| `SITE_GALLERY_STORAGE_DIR` | Caminho persistente, exclusivo do backend, para arquivos da galeria. |
| `PIX_CHAVE`, `PIX_NOME_RECEBEDOR`, `PIX_CIDADE` | Configuração financeira, se o fluxo PIX for habilitado; conferir dados com a empresa. |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | Usadas somente no procedimento de criação inicial de administrador; remover do ambiente após o uso. |

O frontend requer `VITE_API_URL` no momento do build. Nunca inclua segredo em
variável `VITE_*`, pois ela pode ser entregue ao navegador. O arquivo
`backend/.env.example` é apenas referência de desenvolvimento e não representa
uma configuração pronta para produção. Defina processo de rotação, controle de
acesso, auditoria e revogação dos segredos sem colocá-los nesta documentação.

SMTP deve ser testado em homologação com contas controladas, incluindo falha,
entrega e limites. Testes automatizados usam transporte simulado. O
`CLIENTE_PUBLICO_PEPPER` precisa permanecer consistente entre instâncias; não
crie um valor diferente por réplica.

## PostgreSQL, bootstrap e migrations

Não há migration runner na inicialização nem tabela universal que registre
quais migrations foram aplicadas. A instalação nova parte do banco vazio e usa
`backend/src/database/schema.sql`; esse bootstrap incorpora a base histórica
até a etapa 024 e inclui explicitamente as migrations 025 a 033. Não use esse
caminho para atualizar banco existente.

Para uma atualização, primeiro determine o estado real do banco e compare
schema, constraints, índices e dados com as migrations e com
`backend/src/database/verificar_estrutura.sql`. O verificador descreve a
instalação nova; sozinho, não certifica equivalência completa de uma instalação
legada. Não presuma que uma migration está ausente apenas pela configuração do
aplicativo. Registre em procedimento operacional controlado quais scripts foram
revisados/aplicados, seus hashes, data, operador, destino e resultado; esse
registro externo não substitui inspeção do banco.

As migrations `027` a `032` cobrem a Etapa 21; a migration `033` adiciona
notificações internas persistentes da Etapa 23. Aplique em ordem numérica
quando realmente ausentes. As migrations não são executadas no
startup. Não use wildcard, não reaplique migration de execução única e não
altere migrations históricas. Antes de cada mudança, faça preflight de destino,
compatibilidade de schema/dados, locks e duração esperada. Aplique por janela
controlada, em transação quando o script e o procedimento permitirem; confira
resultado e verifique a estrutura depois. A migration 029 tem lock timeout
curto e pode falhar se não obtiver lock. Não contorne falha de lock nem continue
com aplicação incompatível. O roteiro da Etapa 21 em
`backend/docs/etapa21-f-ativacao.md` detalha os cuidados funcionais.

O bootstrap versionado foi originado de `pg_dump` 18.6 e contém os
metacomandos `\restrict`/`\unrestrict`, que o `psql` 17.0 não reconhece. A
documentação do banco indica PostgreSQL/cliente 18.6 como combinação validada
para instalação. A validação anterior com cliente 17 usou apenas uma cópia
temporária do SQL sem essas linhas; isso não valida o bootstrap original com
`psql` 17. Antes de instalação ou restore, valide o arquivo original com a
versão compatível de cliente e servidor em ambiente isolado. Nunca remova os
metacomandos do bootstrap versionado nem use uma cópia sanitizada em produção.

## Backup e restauração coordenados

O plano de continuidade ainda precisa definir RPO, RTO, frequência, retenção,
criptografia, localização, controle de acesso e responsáveis. Esses valores
dependem da operação e não estão definidos neste documento. O backup deve ficar
fora do host da aplicação e ter integridade verificada. O procedimento deve
identificar as versões de PostgreSQL e ferramentas compatíveis com o servidor.

Os dados persistentes incluem pelo menos:

- O banco PostgreSQL, que guarda metadados, vínculos, agendamentos e registros
  operacionais.
- As fotos de pets em `backend/src/uploads` (incluindo `pets`), se esse caminho
  for usado pelo ambiente.
- Os arquivos da galeria no caminho configurado por
  `SITE_GALLERY_STORAGE_DIR`.

O banco e o filesystem não compartilham uma transação. Defina um procedimento
de snapshot coordenado ou uma janela que impeça divergência durante a captura.
Preserve nomes/IDs e um inventário verificável que permita relacionar arquivos
às linhas do banco. Determine se outros volumes ou documentos também são
persistentes no ambiente real; não presuma que o repositório os enumera todos.

Antes de liberar a aplicação, restaure o conjunto em ambiente temporário
isolado. Confirme integridade do dump, consistência entre metadados e arquivos,
permissões de leitura/escrita, amostras de fotos de pets e galeria, login e
fluxos operacionais essenciais. Registre duração e resultado da restauração
para comparar com o RTO a ser aprovado. Uma cópia de backup sem teste de
restauração não comprova recuperabilidade. Nunca ensaie restore sobre o banco
principal ou sobrescreva os arquivos de produção durante um teste.

## Armazenamento de arquivos

O armazenamento padrão da galeria é local (`backend/storage/site-gallery`),
mas a aplicação permite caminho por `SITE_GALLERY_STORAGE_DIR`. O volume de
produção deve sobreviver a rebuild, deploy e substituição de instância, ser
privado e gravável somente pelo serviço necessário. O diretório público
`backend/src/uploads` tem fluxo distinto e contém fotos de pets; não misture
esses arquivos com a galeria institucional.

A validação atual da galeria limita tamanho/dimensões e verifica estrutura e
assinaturas JPEG/PNG/WebP, sem decodificar e recomprimir integralmente pixels.
Antes de upload público irrestrito, adote validação por decodificador mantido e
uma política explícita para formatos, metadados, originais e falhas. Não publique
fotos privadas de pets ou documentos. Teste restauração conjunta dos objetos e
seus registros sem expor o armazenamento diretamente como diretório público.

## Readiness, logs e monitoramento

A rota raiz atual é uma resposta simples e não atesta conexão ao banco, SMTP,
disponibilidade do armazenamento ou capacidade de atender requisições. Não há
endpoint separado de liveness/readiness, coletor de métricas, alertas ou
pipeline de logs configurado neste repositório. Antes de produção, defina como
verificar sem vazar dados: processo, conexão e latência do PostgreSQL, erros de
requisição, falhas SMTP, espaço/permissões dos volumes, uso do pool e
certificados. Uma verificação de readiness não deve executar migrations nem
alterar dados.

Os logs atuais usam console. Defina coleta, retenção, acesso, correlação de
requisições e alertas. Não registrar senhas, códigos de e-mail, tokens, pepper,
corpos de autenticação, CPF completo ou dados pessoais desnecessários. Reveja
stack traces e mensagens de provedores antes de enviá-los a um destino externo.
Auditoria de negócio e logs técnicos têm finalidades e permissões diferentes;
preserve a restrição de auditoria administrativa.

### Limites em múltiplas instâncias

Os limites D2 de envio/validação de e-mail usam estruturas persistidas no
PostgreSQL pela migration 030. A migration 034 passa a persistir os contadores
de login e recuperação/reset no PostgreSQL: HMAC da chave (IP observado pelo
socket, nunca `X-Forwarded-For` não confiável), upsert atômico, janela fixa e
limpeza limitada de até 100 linhas expiradas por requisição. A aplicação falha
fechada com HTTP 503 se o banco ou o segredo HMAC (dedicado
`RATE_LIMIT_HMAC_SECRET` ou `JWT_SECRET` com ao menos 32 caracteres) estiver
indisponível. O índice de expiração mais a limpeza incremental impedem retenção
ilimitada; a proteção é compartilhada entre instâncias que usam o mesmo banco e
segredo. A topologia de proxy ainda precisa ser homologada; `trust proxy` continua
desativado e endereços encaminhados não são aceitos cegamente.

## Rollback e critérios de liberação

Antes da janela, mantenha artefatos da versão anterior e uma decisão explícita
de como retornar o código. Migrations podem tornar versões antigas do código
incompatíveis; prefira uma sequência compatível e reversível por avanço quando
possível. Não prometa rollback de schema sem analisar cada migration. Se a
recuperação exigir restaurar backup, isso pode descartar gravações posteriores
ao ponto de backup; o impacto deve ser avaliado e autorizado antes da operação.

**Go/no-go:** não abra o sistema ao público até que estejam documentados e
aprovados: destino e topologia; TLS e CORS; segredos e SMTP; estado e sequência
das migrations; backup íntegro com restore testado; recuperação coordenada de
DB e arquivos; alertas/readiness adequados; limites de taxa compatíveis com a
topologia; validação dos uploads; smoke tests em homologação; e responsáveis
por operação e incidentes. Se qualquer requisito crítico estiver incerto,
interrompa a janela e registre o impedimento, sem tentar corrigir diretamente
na produção.

## Dependências externas ainda a decidir

Esta documentação não escolhe nem configura fornecedores. O plano de produção
precisa decidir, conforme disponibilidade e orçamento:

- PostgreSQL hospedado ou servidor administrado, com versão e política de
  backup compatíveis.
- Cliente `psql`/`pg_dump` compatível com o servidor e com o bootstrap original.
- SMTP transacional e mecanismo de segredos do ambiente.
- Proxy/ingress, DNS e certificados TLS.
- Volume persistente para fotos e galeria, mais destino de backup separado e
  monitorado.
- Coleta de logs, métricas, alertas e gestão de incidentes.
- Supervisor de processo ou plataforma de deploy, rotina de release e estratégia
  de retorno de versão.

Nenhum item acima foi provisionado ou implantado pela preparação documental da
Etapa 24.

## Implementacao local de preparacao (2026-10)

Esta revisao adiciona configuracao de `pg.Pool` via `DATABASE_URL` ou `DB_*`,
TLS validado para hosts remotos, limites de conexao ajustados a Vercel e um
entrypoint Express serverless em `api/index.js`. `server.js` continua sendo o
entrypoint local, testa `SELECT 1` antes de escutar, mostra erro sem credenciais
e fecha servidor/pool em SIGINT/SIGTERM. Nenhum migration runner foi adicionado.
Transacoes continuam usando `pool.connect()` e um cliente PostgreSQL dedicado;
`BEGIN`, locks e `SELECT FOR UPDATE` permanecem no mesmo cliente.

`vercel.json` prepara build estatico do Vite, roteamento para a API Express e
fallback SPA para caminhos diretos. Ele ainda precisa ser validado em preview
da Vercel com dependencias e variaveis do projeto real. Configure
`VITE_API_URL` somente se frontend e API estiverem em origens distintas; para
uma unica origem, o frontend usa `/api` e o Vite encaminha `/api` e `/uploads`
para `localhost:3001`. `FRONTEND_URL` aceita origens exatas separadas por
virgula; a aplicacao nao habilita `trust proxy`.

Pool remoto: `DATABASE_URL` substitui `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER` e `DB_PASSWORD`; `DB_SSL=auto` valida TLS em hosts remotos e nao usa
TLS no loopback local. `DB_POOL_MAX` aceita 1 a 20; padrao 3 no ambiente
serverless e 10 local. Preferir a connection string pooled do Neon para o
trafego da aplicacao. O pooler nao remove a necessidade de usar um unico
`pool.connect()` durante cada transacao. O tamanho por instancia deve ser
multiplicado pela concorrencia/replicas e comparado ao limite do endpoint;
estes valores sao defaults conservadores, nao garantia de capacidade.

### Arquivos e limites ainda abertos

As fotos de pets locais sao entregues por endpoint autenticado: sessao interna
valida ou sessao publica vinculada ao tutor do pet. Isso remove o `express.static`
anonimo de `/uploads/pets`; clientes internos e a sessao publica carregam a
imagem como blob autenticado. O adaptador suporta disco local e S3 SigV4
path-style, com buckets separados para fotos privadas de pets e galeria. **Neon
Object Storage nao foi conectado nem validado contra projeto real.** A
configuracao exige endpoint e buckets separados, ambos privados, e credenciais
de homologacao fornecidas pela equipe.

Uploads S3 de pets e galeria usam chaves aleatorias em
`tmp/pet-photos/{uploadId}/...` ou `tmp/site-gallery/{uploadId}/...`, URLs PUT e
JWT de finalizacao validos por cinco minutos. O navegador pode enviar fotos de
pet de ate 5 MB diretamente ao S3 sem atravessar o limite de payload da Function;
localmente permanece o multipart de 5 MB. A finalizacao autentica o usuario,
vincula pet/galeria ao dono da autorizacao, verifica tamanho e assinatura binaria
real, promove para chave permanente e e idempotente. Fotos de pet permanecem
privadas e sao servidas pela API com sessao e vinculo tutor-pet; a galeria so e
servida quando publicada. Objetos temporarios nunca viram referencias permanentes.

O S3 não limita o tamanho do PUT por esta URL; tamanho e conteúdo são verificados
antes da promoção. A documentação oficial da Neon consultada nesta revisão
documenta endpoints S3 Lifecycle, porém informa que as regras podem ser
armazenadas mas não executam expiração/transição. Portanto é necessário o coletor
da aplicação. A migration 034 registra cada
autorização temporária (ID, tipo, responsável, chave sob `tmp/` e prazo de 24h).
O endpoint autenticado por `CRON_SECRET` processa até 2 por execucao, com timeout S3 de 8 segundos por chamada, usa
`FOR UPDATE SKIP LOCKED`, apaga somente chaves exatas que passam pela allowlist,
trata DELETE/404 como idempotente e retenta falhas até 10 vezes. Uploads
finalizados são excluídos da seleção. `vercel.json` agenda execução diária, mas
o cron só opera em produção após deploy e configuração de segredo; também pode
ser acionado manualmente. As chaves antigas sem intent não são removidas
automaticamente. A rotina não lista/apaga objetos por prefixo e não toca em
objetos permanentes ou em registros antigos.

Uploads diretos continuam bloqueados por padrão: `S3_TEMP_UPLOAD_CLEANUP_CONFIRMED`
permanece `false` até validar externamente endpoint, permissão de DELETE, CORS,
assinatura e fluxo de limpeza no bucket de homologação. A implementação do
coletor não constitui confirmação de compatibilidade do Neon Object Storage.
Configure `CRON_SECRET` com segredo aleatório forte no ambiente remoto. A
configuração do bucket, CORS, assinatura e execução agendada ainda precisam ser
validadas em homologação; nenhuma implantação foi aprovada.

Exemplo apenas para outro provedor S3 que execute lifecycle. **Neon armazena
essa configuração sem executar expiração/transição; este JSON não limpa objetos
Neon e não substitui o coletor da aplicação.**

```json
{
  "Rules": [{
    "ID": "expire-amores-pet-temporary-uploads",
    "Status": "Enabled",
    "Filter": { "Prefix": "tmp/" },
    "Expiration": { "Days": 1 },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
  }]
}
```
O plano de migracao futura das imagens e: (1) inventariar referencias de
`pets.foto` e `site_galeria.arquivo_nome` sem alterar dados; (2) copiar cada
objeto para buckets privados separados de pets/galeria, validando hash, MIME e tamanho;
(3) manter mapa antigo/nova chave e permitir leitura dupla temporaria; (4) alterar
referencias com atualizacao auditavel e lotes pequenos; (5) validar amostras,
contagens e rollback por referencia; (6) somente depois de backup/restore
comprovados e aprovacao, arquivar o volume antigo. Nenhum passo foi executado.

Fotos de pets passaram a exigir autenticacao/vinculo, mas o transporte do
arquivo entre banco e filesystem ainda nao e transacional. A substituicao de
foto so deve remover a anterior depois de persistir a nova referencia; falhas
podem deixar arquivo orfao para inventario manual. Nao foi criada migration.

### WhatsApp Business e nomenclatura

O transporte opcional de **texto e PDF** para Meta WhatsApp Cloud API esta nos
endpoints `POST /api/comunicacao/whatsapp/texto` e
`POST /api/comunicacao/whatsapp/documento`, autenticados por JWT interno. O modo
padrao `manual` nao envia. O modo `meta_cloud` precisa de versao Graph, ID do
telefone e token configurados no servidor. A interface exige confirmacao de que
o tutor consentiu; chamadas diretas tambem precisam informar essa confirmacao.
O backend valida destino e PDF, registra somente os ultimos quatro digitos do
numero, bloqueia repeticoes por advisory lock PostgreSQL para usuario,
atendimento e tipo, e nao tenta reenviar automaticamente quando o resultado e
incerto. Tentativas falhas ou sem resposta ficam bloqueadas para evitar duplicar;
a equipe deve verificar o historico/provedor antes de uma nova decisao. O PDF
usa o comprovante do sistema, aceita ate 4 MB e passa por upload de midia seguido
de mensagem. O limiter adicional e por IP usando store em memoria; nao e global
entre instancias e a topologia proxy precisa homologacao. Conta Meta, token,
permissoes, templates/janela de conversa e destinatarios com consentimento
permanecem requisitos externos; nenhum envio real foi testado.
### Procedimento local

1. Inicie/valide o PostgreSQL de desenvolvimento com `DB_*` locais ou uma
   `DATABASE_URL` local. A aplicacao nao cria banco nem aplica migrations.
2. Em um terminal, use `cd backend; npm run dev`. O processo confirma a conexao
   e para com diagnostico compreensivel se o PostgreSQL estiver indisponivel.
3. Em outro terminal, use `cd frontend; npm run dev`; abra o endereco indicado
   pelo Vite. A API padrao usa proxy local `/api` e `/uploads`.
4. Encerre cada terminal com Ctrl+C; o backend fecha HTTP e o pool uma vez.
   O Vite esta configurado para falhar se a porta padrao estiver em uso, sem
   criar outra instancia silenciosamente. `PORT` pode ser alterada
   somente para desenvolvimento, sem mudar o banco de destino.

### Homologacao manual

Todos os estados abaixo comecam como **nao testado**. Usar ambiente isolado,
usuarios, tutores, pets, telefones e valores ficticios; nao usar clientes reais.
Antes de qualquer fluxo, confirmar ambiente, branch/build e backup restauravel.

| Area | Pre-requisitos e passos do operador | Resultado esperado / registro de falha | Estado |
|---|---|---|---|
| Login e permissoes | Criar administrador, gerente e funcionario de teste; acessar cada tela e tentar endpoints permitidos/proibidos. | Cada perfil ve apenas suas funcoes; registrar rota, perfil, HTTP e horario sem token. | Nao testado |
| Tutores e pets | Criar tutor ficticio, pets com raca livre, foto; editar e desativar. | Vinculos preservados; foto privada so abre com sessao autorizada; registrar ID ficticio e etapa. | Nao testado |
| Servicos | Criar/editar/desativar servico e conferir valores em agendamento novo. | Atendimentos antigos mantem snapshots; anotar valor/ID sintetico. | Nao testado |
| Produtos e estoque | Criar insumo ficticio, entrada, saida permitida e tentativa acima do saldo. | Saldo nunca negativo; movimento e aviso de minimo coerentes. | Nao testado |
| Creche | Registrar entrada e saida de pet sintetico; consultar historico/relatorio. | Entrada/saida e historico preservados; anotar datas e status. | Nao testado |
| Hotel | Criar reserva sintetica, check-in/out, cancelar e reativar se permitido. | Estados e vinculos consistentes; anotar referencia de reserva. | Nao testado |
| Atendimentos | Criar atendimento interno, iniciar, finalizar, consultar detalhe e comprovante. | Aliases antigos e rota `/atendimentos` coexistem; PDF correto; registrar ID. | Nao testado |
| Solicitacoes publicas | Verificar tutor por email simulado/homologacao, selecionar pet/servicos/horario e enviar. | Solicita `AGUARDANDO_CONFIRMACAO`, horario reservado e sem cobranca ate confirmacao. | Nao testado |
| Agenda e reutilizacao | Publicar dia/horario futuro; reservar, recusar/cancelar e consultar disponibilidade; repetir concorrencia apenas no banco isolado. | Slot reabre apenas quando elegivel; historico anterior permanece. | Nao testado |
| Pagamento, PIX e estorno | Gerar PIX sintetico, marcar pagamento por perfil autorizado, estornar e tentar cancelar. | PAGO exige estorno antes de cancelamento; estados/valores originais preservados. Nao realizar pagamento bancario real. | Nao testado |
| PDFs e WhatsApp | Baixar comprovante; validar link manual. Cloud API somente com sandbox/consentimento e credenciais aprovadas. | PDF sem arquivos temporarios; envio oficial so ocorre apos acao explicita. Registrar ID retornado sem telefone/token. | Nao testado |
| Notificacoes | Gerar eventos sinteticos e alternar visual/sonoro; reabrir/poll. | Preferencia exclusiva, escopo do usuario e eventos esperados. | Nao testado |
| Relatorios e exportacoes | Criar dados ficticios em periodo conhecido, filtrar/exportar e comparar registros fonte. | Estornados nao sao receita ativa; servicos nao duplicam atendimentos. | Nao testado |
| Site e galeria | Cadastrar conteudo institucional real aprovado, publicar e retirar imagem sintetica. | Publico so ve publicados; arquivo separado de fotos de pets; sem informacao comercial ficticia. | Nao testado |
| Administracao e auditoria | Executar alteracao sintetica como admin e tentar auditoria com gerente/funcionario. | Auditoria continua exclusiva de administrador; autoria registrada. | Nao testado |

Ao registrar falha, incluir ambiente/versao, etapa, dados sinteticos, passos,
resultado esperado/obtido, HTTP/identificador de requisicao e horario; remover
CPF, tokens, senhas, codigos e dados pessoais. Reprovacao bloqueia publicacao
ate correcao e repeticao do mesmo caso.

### Limites atuais e criterio de ativacao

Vercel Functions documenta limite de 4,5 MB por request/response ([limites](https://vercel.com/docs/functions/limitations)). O plano
e a cota da Vercel e do Neon podem mudar; verificar paginas oficiais e custos
na data da contratacao. Em 2026-10-14, a pagina Neon informa para Free: 100
projetos, 1 GB PostgreSQL/projeto, 100 CU-horas/projeto/mes, autoscaling ate
2 CU, 10 branches e janela de restore instantaneo de 6 horas; Object Storage
inclui 5 GB por projeto. As cotas podem ser alteradas pelo provedor e nao
representam SLA ([limites Free atuais](https://neon.com/blog/neon-free-plan-1-gb-per-project)).
A pagina Hobby da Vercel lista, entre outros, 100 GB Fast Data Transfer,
1.000.000 invocacoes de Functions, 4 CPU-horas e 360 GB-horas de memoria
provisionada; o plano e restrito a uso pessoal/nao comercial, portanto nao e
adequado para o pet shop comercial ([limites Hobby](https://vercel.com/docs/plans/hobby)).
A Neon documenta Object Storage compativel com S3 e
branch-aware ([visao do produto](https://neon.com/blog/building-neon-object-storage));
precos e limites variam por plano ([planos Neon](https://neon.com/pricing)).
Essas cotas nao devem ser tratadas como backup independente.

Antes de publicar, bloquear release ate: instalar e testar migration/schema
em Neon de homologacao; configurar TLS/pooler e topologia; validar rotas SPA,
CORS e HTTPS em preview; validar configuracao S3 e uploads diretos em projeto de homologacao; decidir
backup/restore conjunto DB/objetos, RPO/RTO e alertas; configurar SMTP/pepper e
WhatsApp sob consentimento; validar PDFs, limites de payload e fotos privadas;
completar homologacao acima e aprovar cada linha; revisar termos/precos e
responsaveis operacionais. Nenhum projeto Neon/Vercel, bucket, segredo ou deploy
foi criado nesta tarefa.

### Validacao PostgreSQL isolada (2026-10-14)

Ferramentas utilizadas: PostgreSQL server, initdb, pg_ctl e psql 17.0. Foi criado um cluster novo em %TEMP%\amores-pet-val-20261014-285afffb\data, loopback 127.0.0.1:55461. pg_ctl, postmaster.pid, processo postgres.exe (PID 13552), linha de comando, listener e system identifier foram conferidos antes das conexoes; cada banco confirmou data_directory, porta, host, usuario e nome. Nenhum banco sistema_petshop existia nessa instancia.

O bootstrap versionado requer psql 18.6 e contem os metacomandos \restrict/\unrestrict, nao compativeis com o cliente 17.0. Para validar localmente, uma copia temporaria removeu apenas essas duas diretivas e foi comparada com o bootstrap original apos normalizacao; nenhum SQL de negocio foi removido. A compatibilidade do bootstrap original com psql 17 permanece nao demonstrada.

A instalacao baseline ate 033 foi aplicada na copia local e a migration 034 passou no verificador estrutural. Testes HTTP do limiter fizeram 12 requisicoes simultaneas em conexoes independentes: 10 permitidas e 2 limitadas; Retry-After veio do relogio PostgreSQL, a chave persistida era HMAC e um contador expirado foi limpo. Um clone com rollback forcado reverteu as tabelas 034 e preservou as contagens de tutores, pets, atendimentos e historico (1, 1, 1, 1).

O teste HTTP da reserva usou duas conexoes PostgreSQL independentes e duas requisicoes concorrentes: uma resposta 201 e uma 409; ficou um atendimento, um snapshot e um evento historico, sem pagamento. Uma falha sintetica no insert do historico resultou em 500 e rollback completo, mantendo o segundo slot DISPONIVEL e sem atendimento/historico/pagamento.

A migration 035 renomeia somente as tabelas-base fisicas para `atendimentos`, `atendimento_servicos` e `pagamentos_atendimentos`. Os nomes `banho_tosa`, `banho_tosa_servicos` e `pagamentos_banho_tosa` permanecem como views simples atualizaveis; o codigo ainda consulta e grava por esses aliases. Colunas (`banho_tosa_id`), sequences, indices, constraints e nomes de triggers permanecem legados. FKs e triggers continuam anexados aos objetos-base por OID; os relatorios, pagamentos/estornos, comprovantes, historicos e auditoria mantem compatibilidade pelas views e colunas preservadas. As views preservam o owner das tabelas-base e grants DML sao reaplicados. Isso nao conclui a renomeacao de todo identificador interno nem a migracao das consultas legadas.

Na validacao isolada, a migration preservou dados e dependencias; views legadas aceitaram INSERT com defaults e RETURNING, UPDATE com RETURNING e SELECT FOR UPDATE, incluindo snapshots e pagamento PENDENTE. O rollback forcado restaurou os nomes fisicos legados e preservou atendimento/historico. O schema, instalador e verificador aplicam/verificam a sequencia ate 035; a migracao 029 roda antes da renomeacao. A migration nao deve ser executada automaticamente e, em banco existente, exige backup verificado e janela de manutencao.

Na revisao final, a migration foi ajustada para alinhar o owner das views ao das tabelas-base. Um novo clone de teste com owner separado e sem CREATE em `public` passou pela 035 e pelo verificador; a permissao temporaria foi revogada na mesma transacao. O owner das views coincidiu com o das tabelas e nenhum CREATE persistiu.

Escopo ainda nao homologado externamente: Neon/Vercel, Object Storage real e seu CORS/DELETE, SMTP, Meta Cloud API, cron publicado, migracao do bootstrap original com cliente psql 18.6, backup/restauracao real e testes manuais de UX. Uploads diretos permanecem bloqueados ate homologar o bucket. O coletor processa no maximo 2 intents por chamada, com timeout de 8 segundos por DELETE S3; cron diario pode gerar backlog se expirarem mais de 2 objetos por dia.

O banco principal sistema_petshop, arquivos .env e servicos externos permaneceram intocados.
