# Etapa 21 — Bloco D2: identificacao segura por e-mail

## Escopo

D2 implementa verificacao de contato antes da sessao do tutor existente e antes de concluir um tutor novo. A verificacao do e-mail nao confirma o agendamento; o fluxo continua sujeito as etapas operacionais posteriores. O envio e exclusivamente e-mail. Nenhuma mensagem real e enviada pelos testes.

## Fluxos HTTP

- `POST /api/agendamento-publico/identificacao/solicitar` recebe CPF e sempre responde com desafio opaco e orientacao neutra quando o CPF e valido. Somente tutor ativo com e-mail unico associado pode receber o codigo. CPF inexistente, cadastro inativo, cadastro sem e-mail ou contato compartilhado nao libera sessao nem dispara SMS/WhatsApp. Sem acesso ao endereco cadastrado, o cliente deve procurar atendimento assistido.
- `POST /api/agendamento-publico/identificacao/confirmar` recebe `{ desafio, codigo }`. O desafio nao e sessao. Codigo valido, dentro de 10 minutos, em ate cinco tentativas, e com o mesmo e-mail ainda associado ao tutor ativo emite token publico de duas horas. O token e independente do JWT interno.
- `POST /api/agendamento-publico/cadastro/solicitar` valida CPF/e-mail e inicia desafio sem persistir dados pessoais do tutor/pet. CPF/e-mail ja utilizados nao liberam prova para o cadastro.
- `POST /api/agendamento-publico/cadastro/confirmar` valida o codigo e emite somente uma prova de cadastro curta, sem token de sessao.
- `POST /api/agendamento-publico/cadastro/concluir` (e alias legado `/cadastro`) exige prova valida, nao consumida, ainda no prazo e vinculada ao CPF/e-mail submetidos. Tutor, pet, vinculo e sessao sao criados na transacao original; a prova e consumida na mesma transacao.

O backend preserva os endpoints de listar pets e confirmar agendamento autenticados. O tutor vem sempre da sessao e o middleware continua validando revogacao, expiracao, tutor ativo e vinculo tutor-pet. Um `401` no frontend limpa o token e o estado dos dados autenticados; os campos do formulario permanecem na pagina para nova identificacao.

## Seguranca, limites e concorrencia

Codigos de seis digitos sao gerados por `crypto.randomInt`; desafio/prova usam `crypto.randomBytes`. Hashes usam HMAC-SHA-256 com chave secreta de alta entropia (`CLIENTE_PUBLICO_PEPPER`, minimo 32 bytes), evitando hash offline direto do espaco curto de codigos. Comparacoes usam `timingSafeEqual`. A API e os logs nao incluem codigo, HMAC ou prova. Codigo e prova sao invalidos apos uso/expiracao; novo desafio invalida os anteriores para a mesma identidade/contexto.

A migration 030 cria limites compartilhados no PostgreSQL. O backend aplica 60 segundos entre envios da identidade, maximo de 3 envios por identidade em 15 minutos, maximo de 10 requisicoes por IP em 15 minutos e cinco codigos incorretos por desafio. `429` inclui `Retry-After` e `tentar_novamente_em`. Locks transacionais/advisory serializam emissao e contadores entre processos e reinicializacoes. `trust proxy` permanece desabilitado; X-Forwarded-For nao e usado para determinar IP. Enderecos compartilhados podem atingir o limite comum por IP.

Os registros de limite sao persistentes e nao expiram sozinhos; planejar limpeza operacional por `atualizado_em` em etapa de manutencao, sem apagar desafios/historico sem politica aprovada. A indisponibilidade do banco/configuracao falha fechada (nao emite sessao). A tabela de rate limit precisa estar instalada antes de ativar essas rotas.

## Configuracao

O envio reutiliza Nodemailer e as variaveis SMTP ja existentes: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER` e `EMAIL_PASSWORD`. O transporte e criado sob demanda e o remetente aparece como Amores Pet. Configurar `CLIENTE_PUBLICO_PEPPER` no ambiente de execucao com pelo menos 32 bytes aleatorios e manter o mesmo valor em todas as instancias; sua rotacao invalida desafios/provas em andamento. Esta implementacao nao altera `.env` e nao revela valores. Sem configuracao, o endpoint falha com `503`, sem sucesso falso ou sessao.

## Banco

Migration aditiva `030_verificacao_email_publico.sql`; nao altera migrations 001–028 nem depende da migration futura 029. Torna tutor/destino opcionais apenas para desafios neutros de cadastro/enumeração, preserva linhas historicas, adiciona contexto, hashes opacos e prova de conclusao, e cria a tabela compartilhada de limites. A migration nao abre/fecha transacao propria: instalacao usa a transacao global de `schema.sql`; upgrade isolado deve usar `psql -1`. A instalacao do zero, o schema/verificador e os testes SQL foram alinhados. A migration nao e executada pela inicializacao da aplicacao. Aplicacao em banco existente deve ser planejada e revisada explicitamente; nao foi aplicada ao banco principal nesta tarefa.

## Testes e limites da validacao

Jest/Supertest usa pool e transporte simulados, sem carregar dotenv, abrir conexao PostgreSQL ou enviar e-mail. Os casos D2 verificam solicitacao neutra, ausencia de segredo na resposta, falha SMTP, HMAC vinculado ao desafio, emissao de sessao para verificacao valida e bloqueio de cadastro direto sem prova. A migration/integridade precisam ser executadas em PostgreSQL temporario isolado antes de implantacao; nunca no banco `sistema_petshop`.

Permanecem pendentes testes de concorrencia real entre emissoes/confirmacoes, bloqueio exatamente na quinta tentativa em PostgreSQL, rate limit de 10 requisicoes por IP e de tres envios em 15 minutos em PostgreSQL, revogacao real de sessao no banco e recuperacao visual no navegador após expirar a sessão. Os testes Jest cobrem expiração/reuso, cadastro sem prova, tutor inativo, e-mail compartilhado e que `tutor_id` do cliente não substitui o tutor da sessão. A resposta neutra não permite descobrir CPF/e-mail; atendimento assistido é a única recuperação permitida quando o e-mail cadastrado não está acessível.
