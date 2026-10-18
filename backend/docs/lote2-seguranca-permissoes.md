# Lote 2 — Segurança e permissões

## Política de perfis

- `administrador` conserva os acessos administrativos atuais.
- `super_administrador` recebe recursos superiores deste lote; cada rota continua validando seu perfil no backend.
- Gerente e Funcionário permanecem limitados às permissões operacionais. Alterações na Galeria exigem autorização de outro Administrador ou Super Administrador ativo.
- Administração da Agenda Pública, serviços e conteúdo geral do site é restrita a Administrador e Super Administrador.
- Administradores comuns não podem criar nem promover contas a Super Administrador.
- Super Administrador é um perfil da aplicação neste banco; não concede permissões PostgreSQL em outros bancos.

## Autorizações por operação

A migration 036 cria `operation_authorizations`, que armazena hash do token, participantes, operação, recurso, hash do contexto, expiração e consumo. O token não é armazenado em claro, vale por cinco minutos e só pode ser consumido uma vez. Emissão e consumo gravam auditoria sem senha ou token. O limite é compartilhado no PostgreSQL por IP e conta autorizadora.

A exceção da Galeria admite criação, edição e remoção lógica com autorização individual de outro usuário Administrador ou Super Administrador ativo. O hash do arquivo escolhido integra o contexto de upload. Exclusão definitiva exige autorização do próprio Super, vinculada ao ID, motivo e confirmação reforçada.

## Exclusões definitivas e retenção

Somente as entidades habilitadas em `hardDeleteService.js` podem ser consultadas: tutores inativos sem dependências; pets inativos sem histórico/dependências; produtos inativos com saldo zero e sem histórico/dependências; serviços inativos nunca utilizados; usuários desativados sem operações ou referências de auditoria; imagens/conteúdos removidos; e horários sem reservas ou solicitações. A avaliação verifica as chaves estrangeiras e bloqueia referências. A configuração singleton `site_conteudo.id = 1` é protegida.

Pagamentos, estornos, comprovantes, movimentações de estoque, logs, autorizações, atendimentos e reservas com histórico não podem ser excluídos pela interface. Não há exclusão em massa. A fila de arquivos permite remoção retomável após a exclusão transacional do metadado. Nenhuma exclusão definitiva foi executada em banco persistente.

A retenção financeira/fiscal operacional de cinco anos, ou prazo maior aplicável, precisa de validação do responsável contábil antes de uso em produção. Dados pessoais são conservados conforme finalidade e obrigação aplicável; o limite operacional de até 30 dias para pedidos de apagamento não é apresentado como prazo legal universal. Não há exclusão automática por prazo.

## Migrations e ambiente

O responsável confirmou que 036 e 037 foram aplicadas e validadas em `amores_pet_homologacao`, com backup, restauração descartável, comparação estrutural/de dados e preservação das contagens. A execução atual não reaplicou migrations nem conectou-se a banco persistente. `sistema_petshop` não foi acessado.

A migration 036 cria a autorização de uso único e a fila segura de remoção de arquivos. A migration 037 atualiza a função de notificações para o quarto perfil. O health check verifica as duas estruturas.

## Provisionamento da nova conta Super

O usuário confirmou o e-mail `superadmin@homologacao.invalid` para uma conta nova, independente, com nome `Super Administrador Homologação`, ativa, exclusivamente em `amores_pet_homologacao` no host `127.0.0.1`, porta `55432`. `admin@homologacao.invalid` deve permanecer Administrador e inalterado.

O executor local é `scripts/homologacao/Criar-Super-Administrador-Lote2.vbs`, com PowerShell em `scripts/homologacao/Criar-Super-Administrador-Lote2.ps1` e helper `src/database/criarSuperAdministradorHomologacao.cjs`. Ele não eleva privilégios nem contorna ACLs. Valida ACL, configuração privada, marcador e identidade do cluster/processo/listener, versão PostgreSQL, host, porta, banco e role. Faz preflight SQL somente de leitura, exige e-mail não cadastrado e Administrador de referência ativo, e então pede confirmação local explícita de destino/conta e senha oculta duas vezes. A política existente valida a senha; bcrypt gera o hash. A criação é transacional, revalida o Administrador e registra auditoria sem senha/hash. O processo filho remove variáveis herdadas relacionadas a PostgreSQL, SMTP, JWT, pepper e configuração de Node.

O provisionador e o helper foram testados em PostgreSQL 17 descartável: criação de exatamente uma conta sintética, hash e login HTTP, auditoria, rejeição de destino divergente, duplicidade, confirmação incorreta e tentativa de criação/promoção por Administrador comum. O registro sintético de referência permaneceu inalterado.

**Estado persistente:** a nova conta ainda não foi criada. O sandbox não acessa a configuração e ACL privada do Windows, e o executor exige confirmação presencial/local após verificar o destino. A sintaxe do PowerShell 5.1 foi validada, mas a execução local real, a validação da ACL e o consentimento do operador ainda precisam ocorrer pela conta Windows proprietária. Não compartilhar senha no chat.

## Homologação consolidada — 17/10/2026

### Testes e resultados

- **Backend/Jest:** `npm.cmd test -- --silent`: 40 suítes aprovadas, 294 testes aprovados, 2 suítes/4 testes opt-in ignorados pelo comando padrão; 0 falhas.
- **PostgreSQL 17 descartável — regressões anteriores:** quatro suítes e 28 testes de instalação/contratos, concorrência, rate limit e solicitações públicas passaram em cluster aleatório sob TEMP. Resultado anterior mantido; não repetido.
- **PostgreSQL 17 descartável — Lote 2:** `node src/database/tests/run_lote1_isolado.cjs --lote2-only`: 9 cenários aprovados, 0 falhos. Incluiu os fluxos de quatro perfis, criação sintética/hash/login/auditoria, bloqueio de criação e promoção por Administrador, autorização de Galeria (senha incorreta, autoautorização, expiração, uso único e auditoria), invalidação de sessão, exclusões bloqueadas e exclusão apenas de fixture, e notificações 037. O cluster descartável foi encerrado e removido.
- **Playwright/Chromium:** 10 testes aprovados, 0 falhos, sobre o build compilado. Cobriu menus por perfil, formulário comum sem perfil Super, edição direta e autorização cruzada da Galeria, mensagem de senha inválida, prévia/bloqueio/cancelamento/confirmação da exclusão e painel de notificações. A API foi controlada por mocks: comprova interações do frontend, não integração navegador→backend→PostgreSQL. A integração real do backend foi exercitada separadamente no PostgreSQL descartável.
- **Frontend:** `npm.cmd run build` passou (191 módulos); `npm.cmd run lint` passou. Playwright foi adicionado como dependência de desenvolvimento para a suíte de Chromium. A auditoria npm inicialmente apontou `source-map-js` transitivo desatualizado; foi atualizado somente de 1.2.1 para 1.2.2, e a auditoria final passou com 0 vulnerabilidades.
- **Validação auxiliar:** parser PowerShell 5.1 aceitou o provisionador; `git diff --check` passou, com avisos de conversão CRLF/LF.
- **Persistência:** nenhuma operação realizada por esta execução em `sistema_petshop` ou `amores_pet_homologacao`; nenhuma conta real promovida/criada e nenhuma exclusão real executada.

### Estado por requisito

- **Implementado e aprovado em testes automatizados:** permissões por perfil em APIs, administração do site/Agenda/serviços, controles de sessão, autorizações de Galeria, notificações do perfil Super e guardas/auditoria de exclusão definitiva.
- **UI automatizada:** principais telas e fluxos testados em Chromium com API mockada. Não classificada como homologação manual nem como integração real.
- **Destruição de dados:** somente uma fixture foi excluída no PostgreSQL descartável, depois da confirmação reforçada; registros financeiros, fiscais, logs, históricos e movimentos protegidos foram testados como bloqueados. Nenhuma exclusão persistente.
- **Migrations:** 036/037 continuam consideradas concluídas com base na validação prévia confirmada pelo responsável; não foram reaplicadas.
- **Produção:** falta validação contábil da retenção financeira/fiscal antes de habilitar qualquer exclusão sujeita a esses prazos em produção.

## Pendências para declarar o Lote 2 concluído

1. Executar uma vez `scripts/homologacao/Criar-Super-Administrador-Lote2.vbs` pela conta Windows proprietária. Conferir o destino apresentado e confirmar localmente a criação única. Definir a senha no prompt oculto; não enviá-la no chat. O executor interrompe se ACL, identidade, e-mail ou conta Administrador de referência não corresponderem.
2. Após o relatório local confirmar a criação, validar o login e os acessos reais da nova conta Super na homologação. Os testes sintéticos não substituem essa confirmação da conta persistente.
3. Obter validação contábil da retenção antes de disponibilizar as operações relacionadas em produção.

**Conclusão:** o Lote 2 ainda não está 100% homologado. As suítes Jest, PostgreSQL descartável e Chromium passaram; permanecem a confirmação local/criação da nova conta e a verificação de seu login/permissões no banco de homologação. A retenção legal é pendência para produção.

### Correção do provisionador — 17/10/2026

A execução local anterior parou antes de consultar o PostgreSQL. `Criar-Super-Administrador-Lote2.ps1` chamava `Get-AmoresPetPrivateAclSnapshot` sem importar `Acl-Privada.psm1`. A função existia e era exportada; faltava carregar o módulo. O provisionador agora importa o módulo pelo caminho baseado em `$PSScriptRoot` e confere as quatro exportações esperadas antes de validar ACLs ou prosseguir. O ramo de e-mail duplicado registra `CONTA_JA_EXISTE_SEM_ALTERACAO` e encerra antes de qualquer prompt de escrita.

Validação desta correção: PowerShell 5.1, 10 verificações do módulo/provisionador aprovadas; dois testes Jest direcionados, 15 testes aprovados; PostgreSQL 17 aleatório em TEMP, 9 cenários de integração aprovados e 0 falhos. A integração agora também executa `preflightSuperAdministradorHomologacao` após criar a conta fixture e confirma que o e-mail duplicado é detectado pelo caminho de consulta somente de leitura; a conta Administrador fixture continua inalterada. O cluster temporário foi encerrado e removido. O teste está em `scripts/homologacao/Testar-Modulo-Provisionador-Lote2.ps1`.

O contrato do atalho VBS foi validado por inspeção automatizada: caminho relativo ao próprio atalho, janela visível, espera síncrona e `RemoteSigned`. O VBS real não foi iniciado por esta execução, pois seu preflight depende da configuração/ACL local protegida e pode prosseguir até uma confirmação humana no banco persistente. Nenhum ACL foi alterado.

**Conta persistente:** estado ainda não consultado. A falha anterior ocorreu durante validação ACL, antes de iniciar o processo Node que faz a consulta SQL, então não há resultado de existência a reportar. Uma única execução local do atalho fará primeiro a consulta somente de leitura: se o e-mail já existir, interromperá sem alteração; se estiver ausente, exibirá o destino e exigirá confirmação explícita e senha local oculta antes da criação.

### SQLSTATE 42501 no preflight do provisionador — 17/10/2026

**Causa identificada no código e reproduzida em ambiente descartável:** a consulta inicial de identidade do helper lia `current_setting('data_directory')`. Essa configuração do servidor é restrita a superusuário ou a membros de `pg_read_all_settings`; a role de aplicação é intencionalmente não administrativa. A instrução executava antes das consultas do schema e da existência da conta, por isso a execução parava no preflight sem iniciar escrita. A mesma leitura privilegiada também existia na validação de identidade dentro da transação.

**Correção:** removida a leitura SQL de `data_directory`. A identidade SQL agora compara banco, role, endereço/porta, versão e `pg_postmaster_start_time()` com o timestamp do `postmaster.pid` validado localmente. O PowerShell continua conferindo processo, executável, linha de comando, diretório do cluster, listener e ACL privada; o helper valida novamente a identidade pela própria conexão antes do preflight e dentro da transação. Nenhum privilégio foi concedido ou alterado. As consultas do provisionador agora têm rótulos fixos; erros SQL são reportados com a etapa e SQLSTATE, sem stderr ou dados confidenciais.

**Validação desta correção:** PowerShell 5.1, 11 verificações aprovadas e 0 falhas; Jest direcionado, 2 suítes/16 testes aprovados; PostgreSQL 17 descartável, 10 cenários do Lote 2 aprovados e 0 falhos. A role de teste foi criada `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`, sem associação a `pg_read_all_settings`: a leitura de `data_directory` reproduziu 42501 e a identidade substituta passou sem privilégio elevado. O fluxo PostgreSQL também confirmou rejeição de destino divergente e duplicidade, criação sintética com hash/login/auditoria, preservação da conta Administrador e rollback integral quando falta permissão para inserir auditoria. O cluster temporário foi removido. `git diff --check` passou; o Git emitiu apenas avisos de conversão de finais de linha em arquivos previamente modificados.

O primeiro teste do cluster descartável dentro do sandbox foi bloqueado por `initdb` ao criar token restrito do Windows, antes de iniciar o PostgreSQL. A execução autorizada fora do sandbox concluiu o teste em cluster temporário, sem conexão a bancos persistentes.

**Conta persistente:** continua sem consulta por esta execução e sem criação. Não foi acessado `amores_pet_homologacao` nem `sistema_petshop`. A próxima e única ação local continua sendo executar uma vez `scripts/homologacao/Criar-Super-Administrador-Lote2.vbs`; o próprio preflight fará primeiro a consulta somente de leitura e interromperá sem escrita se o e-mail já existir. Se estiver ausente, a criação só prosseguirá após conferência do destino, confirmação local já autorizada e senha digitada no prompt oculto.
