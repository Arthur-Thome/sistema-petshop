# AGENTS.md — Amores Pet

## 1. Objetivo deste arquivo

Este arquivo contém as regras permanentes para agentes de programação que trabalham neste repositório.

Antes de modificar qualquer arquivo, leia este documento e analise a implementação existente.

O objetivo principal é evoluir o sistema Amores Pet sem quebrar funcionalidades já implementadas, sem destruir dados e sem ignorar regras de negócio existentes.

Não considere uma tarefa concluída apenas porque o código foi escrito. Sempre que possível, valide o resultado através de testes, execução, análise de erros e revisão das alterações.

---

# 2. Sobre o projeto

O Amores Pet é um sistema web de gerenciamento para pet shop.

O sistema possui áreas internas de gestão e também está desenvolvendo uma área pública para clientes.

Principais módulos existentes ou em desenvolvimento:

- autenticação;
- usuários;
- tutores;
- pets;
- produtos;
- estoque;
- movimentações de estoque;
- creche;
- hotel;
- atendimentos;
- serviços;
- pagamentos;
- estornos;
- comprovantes/documentos;
- logs e auditoria;
- dashboard;
- agenda pública;
- agendamento público;
- identificação pública de clientes;
- site institucional público;
- galeria;
- portal do cliente.

---

# 3. Tecnologias principais

## Frontend

- React
- Vite
- React Router
- Axios
- CSS

## Backend

- Node.js
- Express

## Banco de dados

- PostgreSQL

## Segurança e infraestrutura

- JWT
- bcrypt
- variáveis de ambiente
- controle de permissões por perfil
- logs/auditoria

## Desenvolvimento

- Git
- GitHub
- VS Code
- npm
- psql/PostgreSQL

---

# 4. Regra fundamental de desenvolvimento

Antes de implementar qualquer alteração:

1. leia este AGENTS.md;
2. execute ou consulte `git status`;
3. analise os arquivos relacionados à funcionalidade;
4. entenda a implementação existente;
5. identifique possíveis impactos;
6. preserve funcionalidades existentes;
7. implemente somente depois dessa análise.

Não reescreva módulos inteiros sem necessidade.

Prefira alterações compatíveis com a arquitetura existente.

Não remova código funcional apenas para substituir por uma abordagem diferente sem justificativa técnica.

---

# 5. Segurança do Git

O Git é a principal proteção contra alterações incorretas.

## Permitido

O agente pode:

- consultar `git status`;
- consultar `git diff`;
- consultar histórico;
- identificar arquivos modificados;
- sugerir commits.

## Requer autorização explícita do usuário

Não executar automaticamente:

- `git commit`;
- `git push`;
- `git reset --hard`;
- `git clean`;
- exclusão de branches;
- force push;
- rebase destrutivo;
- qualquer operação que possa descartar trabalho.

Nunca executar:

`git push --force`

sem solicitação explícita e entendimento do impacto.

Ao finalizar uma tarefa, mostrar as alterações antes de qualquer commit/push.

---

# 6. Banco de dados

O banco utilizado é PostgreSQL.

O banco contém dados importantes e deve ser tratado como persistente.

## Proibido sem autorização explícita

Nunca executar automaticamente:

- DROP DATABASE;
- DROP TABLE;
- TRUNCATE;
- exclusões em massa;
- comandos destrutivos;
- recriação completa do banco;
- limpeza geral de dados.

Não apagar migrations existentes.

Não alterar migrations históricas executadas apenas para adaptar uma funcionalidade nova.

Quando uma mudança estrutural for necessária, preferir uma nova migration.

Antes de uma alteração de banco:

1. analisar estrutura atual;
2. verificar dependências;
3. avaliar preservação dos dados;
4. criar migration segura;
5. explicar o impacto.

Alterações destrutivas exigem autorização do usuário.

---

# 7. Arquivos de ambiente e segredos

Arquivos `.env` podem conter informações sensíveis.

Não:

- apagar `.env`;
- substituir `.env`;
- publicar `.env`;
- colocar credenciais no Git;
- mostrar senhas em logs;
- mover segredos para código-fonte.

Alterações em `.env` exigem autorização do usuário.

Quando uma variável nova for necessária, explicar:

- nome;
- finalidade;
- onde será utilizada.

Nunca incluir senhas, tokens ou credenciais reais em documentação versionada.

---

# 8. Dependências

Não instalar bibliotecas simplesmente porque facilitam uma implementação.

Antes de adicionar uma dependência:

1. verificar se o projeto já possui solução equivalente;
2. verificar se pode ser feito com as dependências atuais;
3. explicar por que a nova dependência é necessária.

Instalações relevantes de novas dependências devem ser informadas ao usuário.

Não remover dependências existentes sem verificar onde são utilizadas.

---

# 9. Perfis internos

O sistema possui:

- Administrador;
- Gerente;
- Funcionário.

## Administrador

Possui acesso administrativo completo.

Inclui:

- administração;
- usuários;
- auditoria;
- logs;
- operações administrativas.

## Gerente

Possui acesso às operações de gestão necessárias para o funcionamento diário.

Pode possuir acesso a operações como estoque e outras funções gerenciais.

Não deve automaticamente receber funcionalidades exclusivas do administrador.

## Funcionário

Possui acesso operacional limitado.

Não deve receber acesso administrativo apenas porque uma rota ou botão é mais fácil de implementar dessa maneira.

Sempre validar permissões também no backend.

Ocultar um botão no frontend NÃO é controle de segurança suficiente.

---

# 10. Logs e auditoria

Operações importantes devem preservar a rastreabilidade existente.

O sistema possui mecanismo de logs/auditoria.

Quando uma nova funcionalidade envolver alteração importante de dados, verificar se deve registrar:

- usuário;
- ação;
- entidade;
- registro;
- valor anterior;
- valor novo;
- data;
- informações adicionais previstas pela arquitetura existente.

Nunca registrar senhas em logs.

---

# 11. Tutores e Pets

Tutor e Pet são entidades relacionadas.

O sistema possui relacionamento entre pets e tutores.

Antes de alterar essa relação, analisar:

- `tutores`;
- `pets`;
- `pet_tutores`;
- funcionalidades existentes que dependem dessa relação.

Evitar duplicidade de registros.

O site público deverá verificar clientes existentes antes de criar novos registros.

---

# 12. Produtos e estoque

Produtos são itens utilizados internamente pelo pet shop.

O sistema NÃO é um sistema de venda de produtos.

O estoque registra:

- entradas;
- saídas;
- movimentações.

Regra importante:

Nunca permitir saída maior que a quantidade disponível.

Produtos para reposição devem considerar produtos ativos cuja quantidade atual seja menor ou igual à quantidade mínima.

Operações de estoque devem respeitar as permissões existentes.

---

# 13. Creche e Hotel

Preservar:

- reservas;
- check-in;
- check-out;
- cancelamentos;
- reativações;
- histórico.

Cancelamentos não devem apagar silenciosamente o histórico relacionado.

Antes de modificar reservas existentes, verificar os efeitos em outras telas e relatórios.

---

# 14. Atendimentos

O módulo anteriormente associado a banho/tosa evolui para o conceito de Atendimentos.

Atendimentos podem possuir:

- Pet;
- serviços;
- agendamento;
- status;
- pagamento;
- observações;
- origem.

Não assumir que todo atendimento possui apenas um serviço.

Preservar relacionamentos e snapshots de serviços existentes.

---

# 15. Pagamentos e estornos

Pagamentos podem possuir estados diferentes.

Existe suporte a estorno.

Quando um pagamento for estornado:

- preservar o pagamento original;
- preservar valor;
- preservar forma de pagamento;
- preservar data original;
- registrar informações do estorno;
- preservar rastreabilidade.

Pagamentos `ESTORNADO` não devem ser contabilizados como receita paga em relatórios futuros.

Nunca apagar pagamento para representar um estorno.

---

# 16. Agenda pública

A agenda pública NÃO funciona simplesmente através do horário de funcionamento semanal.

A regra principal é:

O administrador/gestão define explicitamente quais dias estarão disponíveis e quais horários estarão disponíveis em cada dia.

Um dia pode possuir horários arbitrários.

Exemplo:

09:00
10:30
14:00
17:45

Não calcular automaticamente toda a disponibilidade exclusivamente pela duração dos serviços.

Estados dos horários incluem conceitos equivalentes a:

- DISPONIVEL;
- OCUPADO;
- BLOQUEADO.

Nunca liberar um horário ocupado através de operação em massa sem analisar o agendamento associado.

---

# 17. Alterações em massa da agenda

O sistema suporta conceitos como:

- abertura em massa;
- fechamento em massa;
- padrões por período;
- dias da semana;
- horários arbitrários;
- manutenção de horários existentes;
- adição;
- substituição.

Operações destrutivas precisam de confirmação.

Horários ocupados e agendamentos existentes devem ser preservados.

---

# 18. Autorização da agenda

Administrador e Gerente podem executar determinadas operações diretamente conforme regras atuais.

Funcionário pode precisar de autorização através da senha de um Administrador ou Gerente ativo.

Quando essa regra for utilizada:

- validar no backend;
- nunca armazenar a senha;
- nunca registrar a senha em logs;
- identificar o autorizador no backend;
- preservar auditoria da operação.

---

# 19. Site público

A identidade visual pública utiliza a marca:

Amores Pet

Paleta atual inclui:

- preto/grafite;
- branco;
- rosa/magenta;
- amarelo/lima.

Não exagerar no uso do rosa.

O site público deve ser altamente responsivo.

Deve funcionar adequadamente em:

- monitores muito grandes;
- desktops;
- notebooks;
- tablets;
- celulares;
- telas pequenas.

Cada página pode possuir identidade visual/layout próprio, mas deve continuar pertencendo ao mesmo sistema visual.

CSS deve permanecer organizado e separado conforme padrão existente.

---

# 20. Agendamento público

O agendamento realizado pelo cliente cria um agendamento oficial.

Não é apenas uma solicitação aguardando aprovação administrativa, salvo se uma regra futura alterar explicitamente esse comportamento.

O cliente deve selecionar um Pet válido.

O sistema deve suportar fluxos para:

- cliente existente;
- cliente novo;
- Pet existente;
- futuramente adicionar Pet quando necessário.

Evitar duplicidade de Tutor e Pet.

---

# 21. Identificação pública do cliente

Tutor cadastrado no sistema e conta pública do cliente são conceitos diferentes.

Não misturar automaticamente usuários internos com clientes públicos.

Usuários internos:

- Administrador;
- Gerente;
- Funcionário.

Clientes públicos pertencem a outro fluxo de autenticação/identificação.

Preservar essa separação de segurança.

---

# 22. Frontend

Antes de criar um novo componente:

1. verificar componentes existentes;
2. verificar padrões existentes;
3. verificar CSS existente;
4. evitar duplicação desnecessária.

Não duplicar componentes estruturais como Sidebar quando o Layout já é responsável por eles.

Manter responsividade.

Tratar:

- loading;
- erro;
- estado vazio;
- sucesso;

quando forem relevantes.

---

# 23. Backend

Rotas protegidas devem validar autenticação no backend.

Permissões devem ser verificadas no backend.

Nunca confiar apenas em dados enviados pelo frontend.

Utilizar transações em operações que precisam ser atômicas.

Exemplo:

Criar agendamento + ocupar horário.

Se uma parte falhar, a operação não deve deixar dados inconsistentes.

---

# 24. Tratamento de erros

Não esconder erros apenas para fazer a interface parecer funcionar.

Quando houver erro:

1. identificar a causa;
2. verificar frontend;
3. verificar backend;
4. verificar banco;
5. corrigir a origem.

Mensagens apresentadas ao usuário devem ser compreensíveis.

Detalhes técnicos sensíveis não devem ser enviados ao cliente final.

---

# 25. Testes

Depois de uma alteração, executar as verificações adequadas.

Quando aplicável:

- validar compilação/build do frontend;
- validar inicialização do backend;
- executar testes automatizados existentes;
- verificar erros de lint existentes, quando configurado;
- testar endpoint alterado;
- verificar integração frontend/backend;
- verificar console;
- verificar comportamento responsivo quando houver mudança visual.

Não declarar que uma funcionalidade está funcionando sem algum tipo de verificação.

Se não for possível testar algo, informar claramente.

---

# 26. Correção automática

Se um teste falhar devido à alteração realizada:

1. analisar o erro;
2. identificar a causa;
3. corrigir;
4. executar novamente.

Não modificar funcionalidades não relacionadas apenas para fazer um teste passar.

Se a correção exigir uma decisão de negócio não documentada, perguntar ao usuário.

---

# 27. Escopo das tarefas

Não aproveitar uma tarefa pequena para realizar grandes refatorações não solicitadas.

Se encontrar um problema fora do escopo:

- informar;
- explicar impacto;
- sugerir correção;

mas não necessariamente modificar sem autorização.

---

# 28. Alterações críticas

Antes de executar uma alteração potencialmente perigosa, explicar ao usuário.

Exemplos:

- exclusão de dados;
- alteração estrutural importante do banco;
- substituição de autenticação;
- alteração de permissões;
- mudança extensa de arquitetura;
- exclusão de arquivos;
- alteração de configuração de produção.

---

# 29. Padrão de conclusão de tarefa

Ao terminar uma implementação, apresentar um resumo contendo:

## Alterações realizadas

Informar funcionalidades implementadas.

## Arquivos modificados

Listar arquivos criados, alterados ou removidos.

## Banco de dados

Informar migrations ou alterações realizadas.

## Testes executados

Informar comandos/testes executados.

## Resultado

Informar se os testes passaram ou falharam.

## Pendências

Informar limitações ou itens ainda necessários.

## Git

Mostrar ou resumir `git status` e `git diff`.

Não executar commit/push sem autorização quando a tarefa não tiver autorização explícita para isso.

---

# 30. Regra de parada

Pare e solicite confirmação quando:

- houver risco real de perda de dados;
- houver necessidade de decisão de negócio não documentada;
- uma ação exigir credenciais;
- for necessário executar operação destrutiva;
- existirem duas soluções com impactos de negócio significativamente diferentes;
- a alteração estiver fora do escopo solicitado.

---

# 31. Prioridade das regras

Ao trabalhar neste projeto, priorize:

1. segurança dos dados;
2. regras de negócio;
3. funcionamento correto;
4. compatibilidade com funcionalidades existentes;
5. segurança de autenticação/autorização;
6. testabilidade;
7. manutenção;
8. experiência do usuário;
9. estética.

Uma solução visualmente melhor não justifica quebrar uma regra de negócio.

---

# 32. Filosofia de trabalho

O agente é uma ferramenta de desenvolvimento assistido.

O usuário continua responsável pela decisão final.

Analise antes de alterar.
Preserve antes de substituir.
Teste antes de concluir.
Explique antes de executar algo perigoso.