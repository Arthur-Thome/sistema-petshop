# Etapa 25 — Homologação local no Windows

Depois da preparação técnica, o usuário inicia e encerra o Amores Pet com dois cliques. O sistema usa o build do Vite e Express na mesma origem (`http://127.0.0.1:3001`); o Vite de desenvolvimento não fica rodando. A preparação e o inicializador diário não leem `backend/.env`, não instalam software, não aplicam migrations automaticamente e não iniciam serviços Windows. A importação SMTP é uma ação separada e explícita.

## Preparação única

1. Verifique que Node.js, as dependências já existentes do projeto e PostgreSQL 17 estão disponíveis. A preparação não instala dependências nem altera configuração global do Windows.
2. Com o projeto aberto na pasta baixada, dê dois cliques em `backend/src/database/homologacao/preparar.cmd`. Esse procedimento compila o frontend com `VITE_API_URL=/api`, cria uma configuração privada com credenciais aleatórias se ainda não existir e provisiona um cluster novo com schema e fixtures fictícias.
3. O banco de homologação é `amores_pet_homologacao`, com role `amores_pet_homologacao_app`, host `127.0.0.1` e porta `55432`. O caminho padrão é `%LOCALAPPDATA%\\AmoresPet\\Homologacao\\postgres\\data`; se estiver ocupado sem identidade comprovada, a configuração privada usa `postgres\\clusters\\<UUID>\\data` e conserva esse caminho nas reexecuções. Conteúdo anterior nunca é apagado.
4. A config e as contas ficam fora do repositorio, em `%LOCALAPPDATA%\\AmoresPet\\Homologacao`, com ACL restrita ao usuario Windows atual. O pepper público de homologação é gerado e mantido nesse arquivo. Abra `scripts/homologacao/Ver-Credenciais-Amores-Pet.vbs` para consultar as contas ficticias. As credenciais habituais nao sao copiadas para a homologacao e nao autenticam nesse banco.
5. A preparacao instala schema somente em banco vazio do cluster comprovado. Reexecucoes reconhecem marcador/config, verificam o schema e preservam auditoria, limites de login e dados manuais; nao reaplicam migrations nem fazem reset. Se encontrar estado parcial/desconhecido, preserva e reporta.

## Uso diário

- Inicie com dois cliques no arquivo `scripts/homologacao/Amores Pet - Homologação.vbs`. O launcher verifica build, configuração/ACL, marcador, versão das ferramentas, estado do cluster, PID, executável, diretório e listener. Também confirma a identidade SQL por conexão explícita antes de abrir `http://127.0.0.1:3001`.
- Encerre com dois cliques em `scripts/homologacao/Encerrar-Amores-Pet.vbs`. O launcher pede o encerramento gracioso da aplicação por endpoint de loopback autenticado e só então para, por `pg_ctl -D`, o cluster que ele próprio iniciou naquela sessão, após validar novamente PID, linha de comando, marcador e listener.
- Se a porta 3001 ou 55432 estiver ocupada ou alguma identidade não corresponder, o launcher para e apresenta uma mensagem. Não adota nem encerra processos desconhecidos nem apaga diretórios.
- Ao abrir uma sessão já ativa, o launcher confere executáveis, linhas de comando, marcador, PID dos listeners, identidade SQL e `/health/ready`; só então abre a página de login, sem iniciar nem encerrar processos.
- Depois de uma interrupção inesperada, o registro só é invalidado se os dois PIDs estiverem ausentes, ambas as portas estiverem livres e o registro, a configuração e o marcador corresponderem. Um `postmaster.pid` remanescente só é movido para arquivo de diagnóstico quando todos os seus dados também correspondem ao cluster privado. Qualquer divergência mantém o registro e os processos intactos.
- O build local usa `/api` na mesma origem. A preparação interrompe a instalação se detectar no bundle a URL antiga `http://localhost:3001/api`; ela não lê nem altera arquivos `.env`.
- O backend iniciado pelo atalho usa um SMTP sink efêmero em loopback e nunca entrega mensagens externas. Solicite um código e abra `scripts/homologacao/Ver-Codigo-Email-Homologacao.vbs` para consultar a caixa privada da sessão.
- Para preparar um teste externo futuro, abra `scripts/homologacao/Importar-SMTP-Amores-Pet.vbs`. O importador copia apenas as variáveis SMTP de `backend/.env` para `smtpProvider` no arquivo privado; não exibe valores nem modifica ACLs. A importação falha sem alterar permissões se o arquivo ou a configuração estiverem inacessíveis.
- Envio real só é possível com o comando explícito `scripts/homologacao/Enviar-Teste-SMTP-Real.ps1 -Destinatario <email> -ConfirmarEnvioReal`, após autorização e uso de um destinatário de teste controlado.
- Logs ficam em `%LOCALAPPDATA%\AmoresPet\Homologacao\logs`. Revise e remova informações pessoais antes de enviar logs; segredos não são escritos intencionalmente.

## Restaurar o banco de homologação

Encerre o Amores Pet primeiro. Dê dois cliques em `scripts/homologacao/Restaurar-Amores-Pet.cmd` e digite exatamente `RESTAURAR AMORES PET HOMOLOGACAO`. Essa ação substitui somente o conteúdo do banco `amores_pet_homologacao` dentro do cluster apontado por `config.json` (caminho padrão ou alternativo UUID); o utilitário recusa listener/estado inesperado, role/owner divergente ou conexões ativas. Ela não remove o cluster, outros bancos, fotos locais ou arquivos fora do arquivo privado `contas-*.txt` (as credenciais antigas são invalidadas e regeneradas). A restauração não foi executada durante a implementação.
- O PostgreSQL restringe `data_directory` para roles sem privilégio. Por isso o role da aplicação não recebe acesso amplo a `pg_read_all_settings`: o launcher comprova o executável, PID, diretório de dados e dono do listener antes de conectar; a consulta SQL do role confirma banco, usuário, porta, endereço loopback e versão.

## Limites de homologação

O uso local não comprova Neon, Vercel, Object Storage, SMTP ou WhatsApp Business real. Os fluxos públicos que exigem código por e-mail dependem de um transporte de homologação configurado; nenhum e-mail ou mensagem será enviado pelo provisionador. Testes automatizados não aprovam os casos manuais: registre cada execução no [acompanhamento](etapa25/acompanhamento-homologacao.md), seguindo o [roteiro](etapa25/roteiro-homologacao.md) e o [catálogo de capturas](etapa25/catalogo-prints.md).

## Mensagens de login e preparação

Se o login informar credenciais inválidas, use as contas fictícias de `Ver-Credenciais-Amores-Pet.vbs`; as contas habituais do sistema principal não são copiadas. Se a API ficar temporariamente indisponível, a tela tenta reconectar automaticamente sem recarga. Se não se recuperar, execute o atalho oficial uma vez para validar a sessão; não encerre processos manualmente nem remova registros de identidade incerta.

## Recuperação de processo interrompido

- Se apenas o backend registrado estiver encerrado, o atalho confere o PID ausente, a porta 3001 livre e o processo/listener PostgreSQL da própria sessão; confere também o banco por conexão explícita antes de reabrir somente o backend.
- Se apenas o PostgreSQL registrado estiver encerrado, o atalho confirma o processo e listener do backend, a porta 55432 livre, o marcador e o diretório do cluster. Um `postmaster.pid` só é movido para diagnóstico quando PID, diretório, porta e endereço correspondem e `pg_ctl status` confirma que está parado. O banco é identificado antes de concluir a recuperação.
- Se qualquer PID, listener ou marcador divergir, o launcher preserva o registro e não adota nem encerra o processo. Abra o atalho novamente após resolver o diagnóstico; não use comandos para finalizar processos desconhecidos.

## Correção da falha recorrente da API

Em 15/10/2026, a reprodução no Edge identificou a causa concreta: a página foi aberta em `http://127.0.0.1:3001`, mas o bundle tentou enviar `/api/auth/login` a `http://localhost:3001`. Para o navegador são origens diferentes; a política `connect-src 'self'` bloqueou o POST antes de ele chegar à API. O navegador não recebeu status HTTP para essa requisição. O cliente agora resolve a API local para `/api` relativo à origem atual, inclusive quando o build herdou uma URL `localhost`.

O login exibe um único aviso de indisponibilidade e tenta novamente readiness a cada cinco segundos até a conexão voltar, sem recarregar a página. `/health/ready` verifica conexão PostgreSQL, schema mínimo de autenticação e tabela/permissões do rate limiter. Uma falha transitória do banco numa rota autenticada retorna `503` em vez de ser tratada como sessão expirada (`401`); o token local é preservado. Os logs correlacionam a requisição por `X-Request-Id` e registram somente evento, código e horário, sem corpo, senha, token, cookie ou IP.

O Edge local fez login com a conta fictícia de administrador, abriu Dashboard, Tutores e Pets, e obteve `200` em `/api/auth/me`, `/api/dashboard/resumo`, `/api/tutores` e `/api/pets`. A estabilidade foi verificada por 15 minutos, em 30 ciclos dessas chamadas autenticadas, sem erro de rede. Também foi testada a recuperação offline/online no navegador sem recarregar: o alerta foi único, Entrar ficou temporariamente desabilitado e foi habilitado novamente quando a API voltou. Essa validação descreve somente o computador e a rede locais testados.
