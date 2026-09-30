# Banco de dados — Amores Pet

## Fonte da instalação

O caminho oficial para uma **instalação nova** é executar `schema.sql` via
**psql**. Não colar esse arquivo em um editor SQL: ele utiliza includes
relativos (`\ir`) e controles do cliente psql.

Ordem fixa, sem migration runner na aplicação:

1. Confirmar o destino e exigir banco vazio.
2. `bootstrap/001_schema_completo.sql`: base consolidada até a etapa 024.
3. Restabelecer `search_path` para `public`.
4. `migrations/025_recuperacoes_senha.sql`.
5. `migrations/026_unicidade_email_usuarios.sql`.
6. `verificar_estrutura.sql` e commit da transação SQL.

Resultado: 19 tabelas funcionais, sem dados de clientes e sem administrador.
O bootstrap e as migrations 020–024 permanecem intactos. Não executar todas
as migrations por wildcard: a base já incorpora 020–024, inclusive com alguns
nomes de índices/constraints diferentes.

Requisito validado: servidor PostgreSQL 18.6 e cliente psql 18.6. O dump contém
`\restrict` e configurações da versão 18; versões anteriores não foram
validadas. Node.js é necessário somente para a aplicação e o teste automatizado.

## Instalação nova

Exemplos executados **da raiz do repositório**, no PowerShell ou terminal.
Substitua host, porta e usuário pelos da instalação nova. O usuário precisa
poder criar o banco e seus objetos. Nunca reutilize o banco de produção.

```sh
createdb -h 127.0.0.1 -p 5432 -U postgres --maintenance-db=postgres --template=template0 --encoding=UTF8 amores_pet_novo
psql -X -h 127.0.0.1 -p 5432 -U postgres -d amores_pet_novo -v ON_ERROR_STOP=1 -c "SELECT current_database(), inet_server_addr(), inet_server_port();"
psql -X -h 127.0.0.1 -p 5432 -U postgres -d amores_pet_novo -v banco_confirmado=amores_pet_novo -f backend/src/database/schema.sql
```

Confira o destino mostrado pela consulta antes do terceiro comando.
O nome passado em `banco_confirmado` deve ser exatamente o banco conectado.
Os pontos de entrada protegidos recusam `sistema_petshop`, `postgres`,
`template0` e `template1`. Não há opção de bypass.

`schema.sql` já abre e confirma sua transação. Não o envolver com `-1`,
`BEGIN` externo ou outros scripts que façam commit. `ON_ERROR_STOP` é ativado
pelo próprio arquivo; em falha, o psql termina com erro e a conexão desfaz
a transação. Uma segunda execução sobre banco instalado é recusada.
Não há criação automática de banco nem exclusão/limpeza na instalação.

`-X` evita configurações pessoais do psql. Informe senhas no prompt do cliente
ou por um mecanismo seguro local; não as coloque nos comandos versionados.
Os SQLs não leem nem modificam `.env`.

### Serviços iniciais (opcional)

O arquivo existente oferece Banho (50,00), Tosa (60,00) e Banho e Tosa (100,00).
Esses valores são sugestões de cadastro, não preços obrigatórios.
Após revisar os valores, a carga pode ser executada separadamente:

```sh
psql -X -1 -h 127.0.0.1 -p 5432 -U postgres -d amores_pet_novo -v banco_confirmado=amores_pet_novo -f backend/src/database/confirmar_destino.sql -c "SET search_path TO public" -f backend/src/database/bootstrap/002_dados_iniciais.sql
```

Reexecutar sequencialmente não duplica os três serviços nem altera preços
preexistentes. Evite execuções concorrentes da carga.

### Administrador e aplicação

Só depois de validar a estrutura, configure a aplicação para o **novo banco**.
As variáveis usadas pela conexão são `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER` e `DB_PASSWORD`. Alterações no `.env` existente exigem autorização.

Em `backend`, o comando `node src/scripts/criarAdmin.js` usa `ADMIN_NOME`,
`ADMIN_EMAIL` e `ADMIN_SENHA`. Ele lê `.env` e escreve no banco configurado:
confira a conexão antes de usá-lo. Nenhum usuário/senha padrão é inserido no SQL.

## Bancos existentes

Não executar `schema.sql` nem o bootstrap em banco existente. O antigo
`schema.sql` era parcial e deixou de ser uma rotina de migração de vínculos.
Bancos criados apenas com aquele arquivo exigem diagnóstico próprio.

As correções 025 e 026 são aditivas e podem ser reaplicadas em estruturas
compatíveis. Para um banco não protegido, previamente revisado, com backup
e autorização própria, execute ambas em uma única transação:

```sh
psql -X -1 -h 127.0.0.1 -p 5432 -U postgres -d amores_pet_revisado -v banco_confirmado=amores_pet_revisado -f backend/src/database/migrations/025_recuperacoes_senha.sql -f backend/src/database/migrations/026_unicidade_email_usuarios.sql
```

Esse exemplo **não autoriza atualização do banco principal**. Os scripts
recusam `sistema_petshop`. Não renomeie esse banco para contornar a proteção.

- 025 cria recuperação de senha com a definição do schema anterior. Se já
  existir, valida tipos, nulabilidade, defaults e chaves. Divergências causam
  erro, sem substituir regras. Índices equivalentes são aproveitados.
- 026 bloqueia gravações concorrentes em usuários durante a verificação e a
  criação do índice. Duplicidades em `lower(email)` interrompem a operação;
  ninguém é removido, renomeado ou mesclado. Um índice equivalente com outro
  nome é aceito. Colisão de nome incompatível gera erro.
- Nenhuma correção altera FKs preexistentes de pets/tutores. A diferença
  histórica `CASCADE`/`RESTRICT` continua preservada e exige decisão separada.
- A base mantém `token_hash` de sessão pública com 64 caracteres, compatível
  com o SHA-256 hexadecimal gerado pelo serviço atual.

Não há tabela de versionamento ou execução automática ao iniciar o backend.
A baseline e a ordem aplicada estão documentadas aqui e no `schema.sql`.
Guarde o resultado da execução no procedimento operacional. Mudanças futuras
devem ganhar novas migrations e inclusão explícita no caminho de instalação,
sem editar as migrations históricas.

## Verificação de estrutura

```sh
psql -X -h 127.0.0.1 -p 5432 -U postgres -d amores_pet_novo -v ON_ERROR_STOP=1 -f backend/src/database/verificar_estrutura.sql
```

A verificação só lê catálogos: confere as 19 tabelas esperadas, tipos,
nulabilidade, defaults, sequências, PKs, FKs, CHECKs e índices únicos listados.
As constraints esperadas precisam estar validadas e não ser adiáveis.
Esse contrato descreve a instalação nova; não certifica equivalência com
bancos históricos nem rejeita automaticamente todo objeto adicional.
Não certifica sozinha toda regra de negócio; os testes abaixo complementam
essa conferência.

## Testes isolados

Preferir uma instância temporária em porta própria, sem acesso ao cluster
principal. Docker não é necessário. As ferramentas `initdb` e `pg_ctl` do
PostgreSQL permitem criar/iniciar um cluster separado; confira seu diretório
e porta antes de criar o banco. Não iniciar/parar o serviço PostgreSQL principal.

O banco deve se chamar exatamente `sistema_petshop_teste_instalacao` e estar
vazio. Exemplo para uma instância isolada já iniciada em `127.0.0.1:55439`
com o usuário `petshop_instalacao`:

```sh
psql -X -h 127.0.0.1 -p 55439 -U petshop_instalacao -d postgres -c "SELECT current_database(), inet_server_port(), current_setting('data_directory');"
createdb -h 127.0.0.1 -p 55439 -U petshop_instalacao --maintenance-db=postgres --template=template0 --encoding=UTF8 sistema_petshop_teste_instalacao
node backend/src/database/tests/instalacao.cjs --host 127.0.0.1 --port 55439 --user petshop_instalacao --database sistema_petshop_teste_instalacao --data-directory "C:/caminho/absoluto/do/cluster-temporario"
```

Confirme a identidade da instância e o nome **antes de criar o banco**.
Substitua `--data-directory` pelo diretório real retornado pelo servidor.
O teste exige todos os argumentos e confere banco, usuário, endereço, porta e
diretório do cluster em cada sessão, antes das escritas. Só aceita IP literal
de loopback (`127.0.0.1` ou `::1`) e não carrega `.env`.
Remove variáveis herdadas com prefixo `PG`/`PSQL`, inclusive `PGHOSTADDR`,
`PGSERVICE`, `PGOPTIONS` e `PGPASSWORD`, para impedir redirecionamento.
Usa `psql -w`: se autenticação não estiver preparada, falha sem aguardar senha.
O executável deve estar no PATH ou ser informado por `--psql CAMINHO`.

A suíte verifica:

- destino divergente recusado;
- banco principal recusado antes da conexão; host não local, porta inválida,
  diretório divergente e ambiente de conexão hostil recusados ou neutralizados;
- rollback integral de instalação que falha antes do commit;
- tabela de recuperação incompatível e e-mails duplicados recusados;
- atualização da baseline com preservação de registro sintético;
- instalação nova, recusa de reinstalação e correções idempotentes;
- reconhecimento de índice equivalente com nome diferente;
- defaults e sequência incompatíveis na 025 recusados; identity `ALWAYS` e
  `BY DEFAULT`, default NULL e coluna adicional com default aceitos;
- alterações de tipo, nulabilidade, default, CHECK, FK e unicidade detectadas
  pelo verificador, com comparação da estrutura após rollback;
- restauração dos timeouts da sessão e timeout real de lock da 026 em 5 segundos,
  sem persistência do DDL da transação interrompida;
- recuperação de senha, tutor principal, estoque, agenda, múltiplos serviços,
  dados originais do pagamento, sessões públicas, creche, hotel e logs;
- rollback dos registros fictícios e carga opcional sem duplicação.

O banco fica instalado ao final. Registros fictícios são revertidos, mas
sequências podem avançar. A suíte não exclui bancos, tabelas ou schemas.
Para repetir a suíte completa, prepare novamente um banco de testes vazio
em ambiente isolado. Qualquer limpeza exige conferir de novo o nome conectado,
a porta e o diretório do cluster, exclusivamente de testes, antes do comando
destrutivo. Nunca limpar o banco principal.

Os testes SQL exercitam integridade e compatibilidade estrutural; não substituem
testes HTTP, envio real de e-mail ou a validação visual do sistema.
