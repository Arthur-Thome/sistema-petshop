# Homologação local com Neon — modo somente leitura

Este modo conecta o backend local diretamente ao endpoint Neon autorizado e serve o build Vite na mesma origem. Ele é separado do launcher PostgreSQL local e usa a porta `3002`, deixando a sessão local legada na `3001`.

## Destino fixo

- Projeto `square-boat-15573195`, branch `br-holy-sunset-b6ykrr20`.
- Endpoint direto `ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech:5432`.
- Banco `amores_pet_homologacao`, role atual `amores_pet_homologacao_owner`.
- Cliente TLS exige cadeia confiável pelo trust store do Node, certificado autorizado e conferência do hostname exato. O endpoint pooled, URL de conexão e qualquer fallback são recusados.

## Primeira execução no computador principal

Execute `scripts/homologacao/Amores Pet - Homologação Neon.vbs` pela conta Windows proprietária, sem elevação. Na primeira execução o script:

1. Valida a ACL já existente da raiz privada e da configuração local; não altera ACLs.
2. Solicita a senha da role Neon com entrada oculta e a protege com DPAPI da conta/máquina Windows atual.
3. Gera um segredo JWT local novo, protegido por DPAPI, e reutiliza o `CLIENTE_PUBLICO_PEPPER` persistente já presente na configuração privada local.
4. Grava somente em `%LOCALAPPDATA%\AmoresPet\Homologacao\neon-runtime.json`, depois de validar a ACL herdada. O arquivo não é versionado, exportado nem enviado pelo GitHub.
5. Inicia o backend, verifica a identidade SQL/TLS e `health/ready`, e serve o frontend em `http://127.0.0.1:3002`.

Se a ACL existente não passar, o launcher para sem modificá-la. O arquivo de configuração e os logs da execução permanecem locais. A senha não aparece em argumentos, terminal, código ou logs.

## Limites de segurança deste estágio

- O pool inicia cada sessão com `TimeZone=America/Sao_Paulo`, `default_transaction_read_only=on`, `statement_timeout=15s` e `lock_timeout=3s`.
- O backend rejeita POST/PUT/PATCH/DELETE e a rota GET de limpeza de uploads. A camada SMTP falha fechada; SMTP externo fica desativado. S3 e WhatsApp não são herdados pelo processo.
- Por isso login interno, que registra auditoria e usa rate limit persistido, também não funciona. O frontend compilado e rotas de leitura podem ser verificados; não se deve usar esta sessão para cadastrar, editar ou excluir.
- Readiness e probes SQL são somente leitura. Verificam banco/role, TLS no socket do cliente, fuso, `LOWER`/`ILIKE` com maiúsculas acentuadas, a presença do índice único `LOWER(email)` e uma conversão de timestamp para São Paulo.
- Não se altera nem se cria role. A role atual é proprietária do banco, portanto tem privilégios mais amplos que o necessário para leitura. A conexão permanece somente leitura neste launcher; antes de habilitar escrita será necessária uma role exclusiva da aplicação com privilégios mínimos, criada por procedimento autorizado.
- Uploads e fotos continuam em armazenamento local. Os caminhos do banco não tornam os arquivos disponíveis no notebook; centralização de fotos e Galeria requer decisão/configuração de armazenamento privado separada.

## Configuração do notebook

Não copie `neon-runtime.json` pelo GitHub: o segredo DPAPI só pode ser aberto no computador/conta que o protegeu. No notebook, execute o inicializador local de homologação para preparar uma raiz privada e então o mesmo VBS Neon. Informe a senha Neon localmente quando solicitado. O JWT será distinto naquele computador. Para que desafios públicos persistidos possam ser validados alternadamente nas duas máquinas, o mesmo `CLIENTE_PUBLICO_PEPPER` precisa ser provisionado nas duas configurações por canal privado autorizado; não o copie para o repositório, tickets ou chat. Não use ambas as máquinas para editar os mesmos arquivos locais de uploads.

## Antes de liberar além de leitura

1. Criar/autorizar uma role de aplicação sem ownership nem DDL e conceder apenas os privilégios de execução necessários.
2. Validar os grants necessários para login, rate limiting, auditoria, notificações e demais fluxos, numa branch/banco descartável antes de qualquer grant no destino persistente.
3. Aprovar formalmente o uso da role e realizar testes mutáveis exclusivamente numa branch descartável.
4. Centralizar fotos e Galeria em armazenamento privado compartilhado; confirmar autorização, CORS, limpeza e backups.
5. Configurar SMTP sink para homologação se a identificação pública precisar ser testada. SMTP real continua desligado.
6. Executar uma homologação de leitura pela conta Windows proprietária. O sandbox não recebe nem lê a configuração DPAPI.

## Limitações de validação

Os testes automatizados cobrem validação de destino, configuração do pool, política TLS/hostname, modo read-only, SMTP e probes. Eles não substituem a conexão real: handshake/cadeia TLS do Neon, grants da role, readiness remota e probes de collation só ficam comprovados quando o VBS é executado com a senha privada no computador proprietário.

## Diagnóstico do launcher

O launcher registra falhas com etapa, código técnico, tipo e localização sanitizada em um relatório privado sob `%LOCALAPPDATA%\AmoresPet\Homologacao`, sem incluir mensagens brutas de exceções, credenciais ou valores do ambiente. A execução normal reutiliza `neon-runtime.json` quando sua ACL e a descriptografia DPAPI são válidas; a senha só é solicitada quando a configuração ainda não existe.

Para validar somente o tratamento local do launcher, sem ler configuração privada, iniciar o backend, acessar a rede ou consultar PostgreSQL, execute pelo terminal: `cscript.exe //nologo "scripts/homologacao/Amores Pet - Homologação Neon.vbs" --self-test`. O modo normal continua sendo iniciado pelo mesmo VBS sem argumentos.
