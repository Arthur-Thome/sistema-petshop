# Etapa 22 — Relatórios e indicadores

## Entregue

A tela protegida `/relatorios` consome cinco endpoints autenticados sob
`/api/relatorios`: atendimentos e serviços, creche, hotel, estoque e financeiro.
Datas inicial/final são obrigatórias, inclusivas e interpretadas no calendário
`America/Sao_Paulo`; períodos acima de 365 dias, datas inexistentes e filtros
inválidos retornam HTTP 400. O backend usa parâmetros SQL, agregações por
atendimento sem multiplicar valores por quantidade de serviços e status
explícitos. A página oferece indicadores, tabelas, gráficos simples, CSV com
proteção contra fórmulas e impressão do navegador (opção “Salvar como PDF”).

Funcionários podem consultar relatórios operacionais. Financeiro é permitido
somente a gerente e administrador, também verificado no backend. Auditoria não
faz parte desses relatórios e mantém acesso exclusivo do administrador.

## Definições e limites dos indicadores

- Atendimentos confirmados contam `AGENDADO`, `EM_ATENDIMENTO` e `FINALIZADO`;
  `AGUARDANDO_CONFIRMACAO` e `RECUSADO` aparecem separados. O filtro opcional
  de serviço não soma snapshots repetidos.
- Creche conta entradas por `entrada_em`, saídas/finalizações por `saida_em` e
  permanências abertas atualmente sem restringir ao início no período. As linhas
  incluem estadias cuja entrada ou saída ocorreu no intervalo.
- Hotel inclui reservas cujo período previsto cruza o período solicitado e
  informa estados e noites previstas. Não há capacidade cadastrada por unidade;
  portanto não se apresenta percentual de ocupação.
- Estoque mede unidades de entrada/saída e ajustes a partir do histórico de
  movimentações. A listagem separada mostra produtos ativos com saldo menor ou
  igual ao mínimo. Produtos são insumos de uso interno, não vendas.
- Financeiro distingue pendentes, pagos, cancelados e estornados. `Receita ativa`
  (`valor_pago_atual`) soma somente pagamentos no estado `PAGO`; pagamentos
  `ESTORNADO` nunca entram nessa métrica. `bruto_recebido` e
  `pagamentos_recebidos` representam entradas históricas de caixa pela data
  `pago_em`, inclusive as posteriormente estornadas; não são receita ativa.
  Estornos são movimentos separados por `estornado_em`, e o fluxo líquido de
  caixa no período é entradas brutas menos estornos ocorridos nele. O schema não
  tem `cancelado_em` em pagamentos; relatórios usam `atualizado_em` para datar
  cancelamento e deixam isso explícito.

Os relatórios são operacionais, não substituem conciliação contábil. Exportação
PDF usa a função de impressão do navegador e depende do diálogo de impressão do
usuário; não há gerador PDF de relatórios no servidor.

## Arquivos e validação

Rotas/controller: `backend/src/routes/relatorioRoutes.js` e
`backend/src/controllers/relatorioController.js`. Interface: `frontend/src/pages/Relatorios.jsx`,
`frontend/src/styles/Relatorios.css`, `frontend/src/App.jsx` e
`frontend/src/components/Layout.jsx`. Testes HTTP focados: `backend/tests/relatorios.test.js`.
Não é necessária migration para os relatórios.
