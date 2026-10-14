# Etapa 21 — Bloco F: roteiro de ativação

Este roteiro é para uma janela futura de implantação. Nenhuma etapa abaixo foi
executada no banco principal durante o Bloco F.

## 1. Preparar e preservar o banco

1. Identifique a versão PostgreSQL, o diretório/servidor e o estado real do
   schema. Não presuma quais migrations foram aplicadas: não há runner
   automático nem tabela universal de versões.
2. Faça backup consistente do banco principal com ferramenta compatível com a
   versão PostgreSQL do servidor. Armazene-o fora do servidor da aplicação e
   valide o arquivo; antes da janela, teste a restauração em uma instância
   temporária isolada.
3. Compare as tabelas, constraints, índices e estados presentes com as
   migrations 027–032 e com `verificar_estrutura.sql`. Resolva divergências
   antes de aplicar DDL. Preserve os atendimentos, pagamentos e demais dados
   legados.
4. Aplique somente migrations ausentes, em ordem numérica: 027, 028, 029, 030,
   031 e 032. Faça isso manualmente e de forma controlada, com backup validado,
   plano de rollback/restauração e monitoramento. A inicialização da aplicação
   não executa migrations. Não reaplique scripts de execução única sem validar
   antes o estado do banco.
5. Após cada etapa, confira o resultado e rode `verificar_estrutura.sql` quando
   o schema estiver completo. Não use a instalação limpa como upgrade de dados
   existentes.

## 2. Compatibilidade das ferramentas SQL

O bootstrap histórico originado por `pg_dump` 18.6 contém `\\restrict` e
`\\unrestrict`, que o `psql` 17.0 não reconhece. Antes de uma restauração ou
instalação, alinhe as ferramentas `pg_dump`/`psql` à versão suportada pelo
servidor e teste o procedimento em cópia isolada. Se precisar validar com um
cliente antigo, remova esses metacomandos somente de uma cópia temporária de
teste; não edite o bootstrap histórico nem use a cópia sanitizada em produção.

## 3. Configuração de serviço e sessão pública

Configure SMTP funcional (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`,
`EMAIL_USER`, `EMAIL_PASSWORD`) e `CLIENTE_PUBLICO_PEPPER` usando o mecanismo de
segredos do ambiente, nunca valores versionados. O pepper deve ter pelo menos
32 bytes aleatórios e ser igual em todas as instâncias que compartilham os
desafios e sessões. Restrinja o acesso às credenciais, teste conexão, entrega,
tratamento de falha e limites em homologação. Testes automatizados continuam
usando transporte simulado; não enviam e-mail real.

Antes de abrir o agendamento ao público, em homologação, valide entrega e
confirmação de e-mail com contas de teste controladas, tutor novo e existente,
expiração/reenvio, falha SMTP e recuperação de sessão. Confirme que não há
acesso cruzado entre tutores, inclusive com e-mail compartilhado.

## 4. Concorrência e agenda

Com dados sintéticos e uma instância PostgreSQL temporária comprovadamente
isolada, valide requisições simultâneas de reserva do mesmo horário, confirmação
versus cancelamento, recusa/cancelamento versus fechamento administrativo e
rollback quando uma etapa financeira ou de histórico falha. Verifique a
unicidade de ocupação ativa e a ordem de bloqueios documentada em D1/D4/D5.
Repita os cenários de concorrência em homologação com a mesma versão e
configuração de PostgreSQL previstas para produção. Não use o banco principal
como ambiente de teste.

## 5. Imagens e armazenamento da galeria

Defina `SITE_GALLERY_STORAGE_DIR` para um volume persistente, exclusivo do
backend e fora de diretórios públicos, uploads de pets e diretório de build.
Restrinja leitura/escrita ao serviço, configure backup dos arquivos junto com
um inventário que preserve o vínculo entre arquivo e linha da tabela, e teste
restauração de imagem e metadados. Confirme que builds e deploys não apagam o
volume.

O backend atual limita o tamanho e as dimensões e verifica estrutura e
assinaturas JPEG/PNG/WebP, mas não decodifica/recomprime integralmente os
pixels. Antes de publicação aberta, adote validação por decodificador mantido,
preferencialmente regravação em formatos raster permitidos e remoção de
metadados desnecessários; faça isso em pipeline seguro e sem sobrescrever os
originais sem política definida. Revise direitos de uso, consentimento de
imagem e textos alternativos. Nunca publique fotos privadas de pets ou
documentos.

## 6. Conteúdo real e liberação

Antes de divulgar, a empresa deve preencher e aprovar título e apresentação,
história, missão/diferenciais, contatos, endereço, horário informativo, link
Maps e as premiações reais que desejar exibir. Deve também selecionar fotos
oficiais, confirmar autorização de uso, texto alternativo, título, legenda,
ordem e publicação. Campos vazios permanecem vazios; não complete lacunas com
dados presumidos.

Faça smoke test em homologação: perfil administrador e gerente editam;
funcionário e visitante recebem bloqueio; somente conteúdo publicado aparece;
imagens ausentes não quebram o layout; contato e Maps abrem destinos válidos;
um tutor existente e um novo verificam e-mail; apenas pets vinculados são
acessíveis; uma solicitação fica pendente e reserva provisoriamente o horário;
não existe cobrança antes da confirmação; a equipe consegue confirmar/recusar/
cancelar conforme as permissões, motivos e regras financeiras; recusa e
cancelamento preservam o histórico e só liberam slot ainda aberto, publicado e
futuro.

Abra o agendamento ao público somente após aprovação operacional, verificação
de backup/restauração, testes de concorrência, entrega real de e-mail em
homologação e validação robusta de imagens.
