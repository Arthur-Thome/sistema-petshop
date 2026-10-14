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
PostgreSQL pela migration 030. Já os limitadores de autenticação/recuperação
baseados no `express-rate-limit` usam o armazenamento padrão em memória. Esse
armazenamento não compartilha contadores entre processos, é reiniciado com o
processo e não representa um limite global em várias réplicas. Até que um store
compartilhado seja adotado e testado, trate esses limites como proteção por
processo e não declare proteção distribuída. A decisão de escalar horizontalmente
deve incluir store compartilhado, proxy/IP confiável e testes de comportamento.

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
