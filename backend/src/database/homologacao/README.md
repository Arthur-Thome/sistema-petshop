# Banco local de homologacao

O provisionador cria um cluster PostgreSQL local novo, seu banco exclusivo, schema e fixtures. Ele nao consulta nem carrega `backend/.env`, nao se conecta a servicos externos, nao toca em `sistema_petshop`, nao instala servicos Windows e nao executa reset, `DROP`, `TRUNCATE` ou `DELETE`. Nunca adota um cluster desconhecido. Se houver falha depois da inicializacao, o processo criado por esta execucao e encerrado e os arquivos de dados sao preservados para inspecao.

## Requisitos

- Windows e Node.js ja instalados.
- PostgreSQL 17 instalado pelo usuario, com `initdb.exe`, `pg_ctl.exe` e `psql.exe` na mesma pasta. O script nao instala nem atualiza ferramentas.
- `preparar.cmd` cria `%LOCALAPPDATA%\AmoresPet\Homologacao\config.json` v1 se ele ainda nao existir, com ACL exclusiva da conta Windows atual. Se nao houver PostgreSQL 17 em `C:\Program Files\PostgreSQL\17\bin`, o provisionador para com uma orientacao; nao instala software. O arquivo contem segredos locais e nunca deve ser copiado para o repositorio ou para prints.

Contrato da configuracao:

```json
{
  "version": 1,
  "postgres": {
    "host": "127.0.0.1",
    "port": 55432,
    "database": "amores_pet_homologacao",
    "user": "amores_pet_homologacao_app",
    "password": "<gerado localmente>",
    "clusterUser": "<role administrador local gerado>",
    "clusterPassword": "<gerado localmente>",
    "dataDirectory": "%LOCALAPPDATA%\\AmoresPet\\Homologacao\\postgres\\data",
    "clusterId": "<UUID gerado pelo provisionador>",
    "pgCtlPath": "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
    "psqlPath": "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"
  },
  "app": {
    "host": "127.0.0.1",
    "port": 3001,
    "jwtSecret": "<gerado localmente>",
    "clientePublicoPepper": "<gerado localmente>"
  },
  "smtpProvider": {
    "host": "<opcional>",
    "port": 587,
    "secure": false,
    "user": "<opcional>",
    "password": "<opcional>"
  }
}
```

Os campos secretos acima sao apenas marcadores de esquema, nao credenciais. O role `clusterUser` e separado do role sem superusuario `amores_pet_homologacao_app`. O destino e fixo: host `127.0.0.1`, porta `55432` e banco `amores_pet_homologacao`; o banco principal `sistema_petshop`, a porta 5432, hosts remotos e nomes alternativos sao recusados.

`clientePublicoPepper` e gerado uma vez com aleatoriedade criptografica e fica no arquivo privado. O inicializador injeta esse valor no processo do backend. Em ambiente ativo, todos os e-mails sao enviados somente para um coletor SMTP efemero em `127.0.0.1`; o coletor nao abre conexoes externas nem grava mensagens no disco. O atalho `scripts/homologacao/Ver-Codigo-Email-Homologacao.vbs` mostra os codigos capturados depois de validar a sessao local e a ACL do estado.

Os dados SMTP do provedor sao importados sem exibicao de valores pelo atalho `scripts/homologacao/Importar-SMTP-Amores-Pet.vbs`. Ele le `backend/.env` e grava `smtpProvider` no mesmo `config.json` privado, sem alterar ACLs. A validacao exige que o proprietario seja a conta Windows atual; aceita ACEs de permissao somente para esse proprietario, `NT AUTHORITY\SYSTEM` e `BUILTIN\Administrators`, e rejeita `Users`, `Everyone` e outras contas. A pasta `Homologacao` precisa ter a heranca protegida. O arquivo `backend/.env` pode ter ACL protegida com as duas identidades administrativas, enquanto `config.json` permanece restrito ao proprietario dentro da pasta privada. ACLs invalidas nunca sao corrigidas automaticamente pelo importador. O SMTP do provedor fica guardado para um teste real pontual e nao e ativado pelo inicializador.

Depois de obter autorizacao explicita e definir um destinatario de teste controlado, o teste real preparado pode ser executado com `scripts/homologacao/Enviar-Teste-SMTP-Real.ps1 -Destinatario <email> -ConfirmarEnvioReal`. Ele envia uma unica mensagem de verificacao, nao imprime o codigo nem diagnosticos do provedor. Esse comando nao foi executado durante a implementacao.

## Primeira preparacao e repeticao segura

1. Confirme que PostgreSQL 17 existe no computador. Se `config.json` ja existir, os caminhos absolutos devem apontar para os executaveis da mesma instalacao; sem config, somente o caminho padrao sera detectado.
2. Dê dois cliques em `preparar.cmd`. O script compila o frontend, cria config privada e credenciais aleatorias se necessario e prepara o banco local.
3. Se `postgres\\data` estiver ausente ou vazio, esse sera o caminho inicial. Se estiver ocupado sem identidade comprovada, o conteudo e preservado e a config aponta para `postgres\\clusters\\<UUID>\\data`. O caminho alternativo fica salvo para as proximas execucoes; nao se cria cluster novo a cada preparacao.
4. A reutilizacao exige PostgreSQL 17, marcador valido, caminho sem links/junctions, correspondencia da config, PID, processo, listener e identidade SQL. Porta ocupada, `postmaster.pid` divergente ou identidade inesperada interrompem a acao sem apagar arquivos nem encerrar processos desconhecidos.
5. Antes de conectar, o script confirma processo, executavel, linha de comando, diretorio e dono do listener. Uma consulta de administrador confirma banco, role, versao, porta, data directory e ausencia do nome `sistema_petshop`. O role da aplicacao nao recebe `pg_read_all_settings`.
6. O schema e instalado somente em banco vazio do cluster comprovado. Se schema e fixtures ja estiverem completos, a execucao verifica sem reaplicar migrations nem sobrescrever dados. Estados parciais ou inesperados sao preservados e reportados.
7. Fixtures ficticias incluem usuarios administrador/gerente/funcionario, tutor, pet, servicos, produto e dois horarios futuros. Os usuarios sao gravados numa transacao com advisory lock. Nenhum cadastro real e copiado.
8. As senhas aleatorias ficam fora do repositorio em `contas-*.txt`, com ACL privada. Para consulta local, abra `scripts/homologacao/Ver-Credenciais-Amores-Pet.vbs`; as credenciais habituais do banco principal nao existem no banco de homologacao. Nao inclua o arquivo em capturas.
9. A preparacao encerra somente o cluster iniciado por ela, depois de reconfirmar PID/processo/listener; clusters ja ativos e comprovados nao sao encerrados. Se o sistema estiver aberto, feche-o pelo atalho antes de preparar.

Pastas de identidade incerta sao preservadas. Um lock exclusivo impede preparacoes simultaneas; lock residual apos falha abrupta exige inspecao antes de qualquer remocao manual. Nenhuma rotina apaga automaticamente cluster ou dados.
## Compatibilidade do bootstrap

O bootstrap foi emitido por `pg_dump` 18.6 e contem dois metacomandos (`\\restrict`/`\\unrestrict`) que `psql` 17 nao reconhece. Para a instalacao local, o provisionador cria uma copia temporaria de `backend/src/database`, remove da copia somente essas duas linhas e confere igualdade com o original apos filtra-las. Nenhum SQL de negocio, migration ou arquivo versionado e alterado. Esse procedimento valida a copia local, mas nao afirma compatibilidade do bootstrap original com `psql` 17.

## Restaurar o banco de homologação

O arquivo `scripts/homologacao/Restaurar-Amores-Pet.cmd` é separado da inicialização diária. Encerre o app, execute o arquivo e digite a frase exata solicitada. O restaurador verifica a allowlist, marcador, versão, diretório, porta, PID/listener, ausência de sessão do launcher e ausência de conexões ao banco antes de recriar somente `amores_pet_homologacao`. Não encerra listeners desconhecidos, não remove arquivos de fotos e não altera outros bancos. O conteúdo de teste desse banco é substituído e as credenciais sintéticas antigas são invalidadas. Esse procedimento não foi executado nesta tarefa.

## Testes sem PostgreSQL

`node --test backend/src/database/homologacao/guard.test.cjs` cobre as recusas estaticas de banco, host, porta, role e diretorio. Esse teste nao abre conexao e nao inicia processo PostgreSQL. Nao execute o provisionador como teste automatizado; ele cria um cluster e uma base locais somente quando chamado explicitamente pelo usuario.
