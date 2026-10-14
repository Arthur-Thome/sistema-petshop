# Manual técnico — atualização das Etapas 22, 23 e preparação da 24

## Relatórios

Endpoints autenticados: `GET /api/relatorios/atendimentos-servicos`, `/creche`,
`/hotel`, `/estoque` e `/financeiro`, com `inicio=YYYY-MM-DD` e `fim=YYYY-MM-DD`.
Datas são inclusivas no calendário `America/Sao_Paulo`; máximo 365 dias. O
endpoint de atendimentos aceita `status` e `servico_id`. Funcionário acessa
somente relatórios operacionais; gerente/administrador também acessam
financeiro. Autorização é aplicada em middleware backend e não depende do menu.
Definições financeiras e limitações estão em `etapa22-relatorios.md`.

## Notificações

Atualização de banco: migration 033 após 027–032. A instalação limpa recebe a
migration via `schema.sql`. Rotas: `GET /api/notificacoes`, `PATCH
/api/notificacoes/lidas`, `PATCH /api/notificacoes/:id/lida` e `PUT
/api/notificacoes/preferencia` (`VISUAL` ou `SONORO`). Todos os comandos
operacionais são filtrados por `req.usuario.id`; não aceitar usuário do corpo ou
query. Triggers executam no mesmo commit da operação de negócio. A consulta GET
materializa lembretes para os próximos 24h; o polling do navegador ocorre a cada
30 segundos. Isso não é um canal push/distribuído.

## Duplicidade de produto e ViaCEP

Ao cadastrar produto, nome/unidade iguais após trim e comparação sem distinção
de caixa produzem HTTP 409 com possíveis correspondências. A interface pede
confirmação e reenvia sinalizador explícito; não há constraint única, pois
produtos distintos podem legitimamente compartilhar descrição. Revisar novas
duplicidades em conjunto com o operador. ViaCEP é consulta pública externa e
preenche apenas campos de endereço retornados; falha do serviço deve permitir
digitação manual.

## Banco e implantação

A sequência versionada de instalação é bootstrap 024, 025, 026, e 027–033 em
ordem numérica. 033 é a única migration nova destas etapas. Não aplicar `schema.sql`
em banco existente e não executar migrations no startup. Conferir destino,
estado real, backup restaurável e compatibilidade de cliente/servidor antes de
qualquer atualização. Leia `etapa24-preparacao.md` para HTTPS, proxy, SMTP,
pepper, arquivos persistentes, observabilidade, backup/restore e critérios de
go/no-go. A preparação não configura infraestrutura nem define RPO/RTO.

O bootstrap versionado originado de pg_dump 18.6 contém `\\restrict` e
`\\unrestrict`, não reconhecidos pelo psql 17. Validações anteriores com psql
17 usaram cópia temporária sem essas linhas; a compatibilidade do bootstrap
original requer cliente compatível e continua pendente de validação no
ambiente de implantação.
