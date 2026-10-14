# Etapa 23 — Funcionalidades pendentes

## Reaproveitado e completado

- O módulo é apresentado como **Atendimentos** no menu e no README; nomes de
  tabelas, arquivos e APIs antigos permanecem para compatibilidade.
- Estoque já preservava movimentações, impedia saldo negativo e restringia
  movimentações a gerente/administrador. A nova tela de relatórios também exibe
  histórico e produtos ativos no nível mínimo ou abaixo.
- Tutores e pets já tinham avisos de possíveis duplicidades e relações
  múltiplas. O cadastro de produtos agora verifica nome e unidade de produtos
  ativos e pede confirmação explícita em HTTP 409 antes de permitir um possível
  duplicado. É aviso, não unicidade: nomes iguais podem representar produtos
  legítimos.
- Edição de foto/corte/prévia, nome do pet clicável, múltiplos tutores, PDFs
  oficiais e atalhos de WhatsApp já existiam. O formulário público de tutor
  ganhou consulta CEP via ViaCEP; os formulários internos existentes já
  consultavam o serviço.

## Notificações internas

A migration `033_notificacoes_internas.sql` adiciona registros e preferências
individuais. Triggers inserem eventos na mesma transação de atendimentos, hotel,
cadastros, movimentações e alertas de estoque; falha/rollback da operação de
origem também desfaz a notificação. A consulta materializa idempotentemente
lembretes de atendimentos `AGENDADO` nas próximas 24 horas. A API restringe
leitura e marcação ao usuário autenticado. A interface atualiza a cada 30 s e
ao retomar foco; preferência permite **visual** (sino/contador/lista) ou
**sonoro**, nunca ambos. Não há push quando o navegador está fechado.

Eventos: atendimento novo/confirmado/recusado/cancelado/reativado/próximo;
check-in, check-out, cancelamento e reativação de hotel; movimento de estoque e
estoque baixo; criação, alteração e reativação de tutor, pet e produto. A tabela
deduplica por usuário e chave de evento. Notificações são dados operacionais,
não substituem auditoria.

## Comunicação e operação

Os PDFs são gerados pelo backend. O WhatsApp abre uma conversa com texto
pré-preenchido para envio manual. Não existe envio automático de PDF/anexo nem
integração WhatsApp Business configurada; não anunciar automação.

A migration 033 é necessária antes de liberar a versão que monta o sino; não
existe migration runner no startup. Instalação nova aplica 033 após 032 pelo
`schema.sql`. Para atualização, revisar e aplicar explicitamente após 027–032,
de acordo com `backend/src/database/README.md` e em ambiente controlado. Nenhuma
migration foi aplicada ao banco principal nesta tarefa.

## Verificação

`backend/tests/notificacaoController.test.js` cobre escopo do usuário, leitura,
preferência exclusiva e perfis. `backend/src/database/tests/integridade.sql`
valida trigger transacional e a restrição de preferência; `verificar_estrutura.sql`
confere estrutura e gatilhos. Há teste HTTP focado para duplicidade de produto
em `backend/tests/produtoDuplicidade.test.js`.

Estado historico da Etapa 23. Na Etapa 24 foi adicionado transporte opcional
de texto e PDF para Meta WhatsApp Cloud API, desativado por padrao; consulte
`etapa24-preparacao.md` para requisitos de credenciais e homologacao.
