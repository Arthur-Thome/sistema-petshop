# Etapa 25 — roteiro de homologação manual

Este roteiro é para execução humana no ambiente **de homologação isolado**. Os testes automatizados validam código, mas não aprovam experiência visual nem comportamento manual. Nenhum caso começa aprovado: em todos, a situação inicial é **Aguardando teste manual**. Só o usuário que executar o roteiro deve preencher resultado, erro e observações.

## Preparação e regras para todos os testes

1. Confirme que a janela aberta é a homologação, que a aplicação aponta para o banco de teste e que a identificação exibida pelo inicializador corresponde à documentação local. Se houver dúvida sobre o banco, pare sem gravar dados.
2. Use somente dados fictícios. Identificadores abaixo são exemplos; acrescente um sufixo aleatório (por exemplo, `HML-20261014-01`) para evitar colisão.
3. Não use CPF, telefone, e-mail, senha, token, código de verificação, pagamento ou fotografia de pessoa/animal real. Para CPF de teste, utilize apenas número de validação reservado pelo procedimento de homologação local, sem reaproveitar dados pessoais.
4. Antes de cada caso, confira seu perfil. Não use credencial de produção. Para reset do ambiente, utilize apenas o procedimento separado e explicitamente identificado como homologação; nunca use ações de limpeza no banco principal.
5. Para cada falha, anote ID do caso, hora local, versão/branch, perfil, caminho da tela, dados sintéticos, passos, resultado esperado e observado, mensagem/HTTP e identificador da requisição, se existir. Remova dados pessoais, cookies, tokens, códigos e cabeçalhos de autenticação dos prints/logs.
6. Capturas: use os nomes listados no catálogo. Antes de enviar ao ChatGPT, confira a imagem em tamanho real, oculte qualquer dado privado e não inclua ferramentas de desenvolvedor com headers/secrets. O manual só deve receber capturas feitas pelo usuário na aplicação real.

### Dados fictícios sugeridos

- Tutor: `HML Tutor Aurora`, e-mail em domínio reservado `example.invalid`, telefone sintético não discável, endereço fictício.
- Pet: `HML Nuvem`, espécie conforme formulário, raça `SRD`, porte `Médio`, alergia `HML sem alergia`, observação `Dado fictício de homologação`.
- Serviço: `HML Banho teste`, descrição `Serviço sintético`, preço de teste baixo e duração válida.
- Produto: `HML Shampoo teste`, categoria `HML`, saldo inicial pequeno, mínimo maior que zero.
- Usuário: nomes `HML Admin`, `HML Gerente`, `HML Funcionário`; senhas distribuídas fora dos documentos e criadas pelo procedimento local.
- Agenda: data futura autorizada no banco isolado; nunca escolha uma data de cliente real.

## Autenticação e navegação

### HML-001 — Login administrativo válido
- **Perfil:** cada um dos três perfis, em execuções separadas.
- **Pré-requisitos:** contas sintéticas ativas; tela `/login`.
- **Passos:** 1) Abra `/login`. 2) Informe os campos rotulados **E-mail** e **Senha** com a conta de homologação. 3) Acione **Entrar**. 4) Confira destino e nome/perfil exibido.
- **Esperado:** sessão interna abre a área protegida correta; identidade/perfil são os da conta usada.
- **Dados:** HML Admin/Gerente/Funcionário.
- **Print:** `HML-001-login-perfis.png`, após entrar, sem capturar senha.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-002 — Credenciais incorretas e logout
- **Perfil:** funcionário (também repetir com gerente se necessário).
- **Pré-requisitos:** conta sintética e sessão iniciada.
- **Passos:** 1) Em `/login`, tente senha inválida. 2) Confira erro sem detalhes sensíveis. 3) Faça login válido. 4) No menu, use a ação de sair. 5) Tente voltar à página interna pelo navegador.
- **Esperado:** falha não autentica; logout remove a sessão e rota protegida solicita login.
- **Dados:** conta HML Funcionário; senha inválida fictícia não reutilizada.
- **Print:** `HML-002-login-logout.png`, na mensagem genérica ou login após saída.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-003 — Recuperação e redefinição de senha
- **Perfil:** funcionário de homologação.
- **Pré-requisitos:** e-mail SMTP de teste/simulador habilitado; acesso ao canal de teste. Sem isso, registrar dependência externa e não inventar sucesso.
- **Passos:** 1) Em `/login`, abra `/esqueci-senha`. 2) Solicite recuperação para a conta sintética. 3) Use somente o link recebido no transporte configurado de teste. 4) Em `/redefinir-senha`, preencha **Digite a nova senha** e **Digite novamente**. 5) Entre com a nova senha e teste o link/token uma segunda vez.
- **Esperado:** redefinição válida funciona uma vez; token inválido/reutilizado é recusado; respostas não enumeram contas.
- **Dados:** conta de teste, e-mail `example.invalid` entregue pelo simulador.
- **Print:** `HML-003-redefinicao.png`, formulário sem token visível, depois da mensagem final.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações/dependência:** ____.

### HML-004 — Dashboard e estado vazio/erro
- **Perfil:** funcionário, gerente e administrador.
- **Pré-requisitos:** login; conjunto pequeno de dados fictícios.
- **Passos:** 1) Abra `/dashboard`. 2) Aguarde os indicadores. 3) Compare um indicador simples com registros HML conhecidos. 4) Repita após limpar filtros disponíveis na interface; em ambiente offline, registre a mensagem exibida.
- **Esperado:** carregamento, dados, vazio ou erro são compreensíveis; solicitações pendentes/recusadas não aparecem como receita ou atendimentos confirmados.
- **Dados:** um atendimento confirmado, um pendente e um recusado sintéticos, se as telas permitirem criá-los.
- **Print:** `HML-004-dashboard.png`, dashboard carregado e sem dados privados.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Tutores, pets e cadastros

### HML-005 — Cadastrar e pesquisar tutor
- **Perfil:** funcionário.
- **Pré-requisitos:** `/tutores`; dados HML novos.
- **Passos:** 1) Abra `/tutores`. 2) Use a ação da tela para iniciar cadastro. 3) Preencha os campos de tutor da tela (`FormularioTutor.jsx`), incluindo CPF sintético válido, e-mail reservado, telefone e endereço. 4) Salve. 5) Pesquise pelo campo **Buscar por nome, CPF, telefone ou e-mail...**.
- **Esperado:** cadastro aparece uma vez e pesquisa localiza o mesmo tutor.
- **Dados:** HML Tutor Aurora; nenhum contato real.
- **Print:** `HML-005-tutor-lista.png`, resultado da pesquisa sem CPF/contato legíveis.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-006 — Validações e duplicidade de tutor
- **Perfil:** funcionário.
- **Pré-requisitos:** HML-005 concluído.
- **Passos:** 1) Em `/tutores/novo`, tente CPF inválido e campos obrigatórios vazios. 2) Tente novamente com e-mail/telefone inválido. 3) Tente CPF já usado em HML-005. 4) Corrija e salve somente após registrar mensagens.
- **Esperado:** entradas inválidas são explicadas e não criam registro parcial; duplicidade é tratada sem erro 500.
- **Dados:** novo CPF sintético inválido; duplicidade apenas do registro HML.
- **Print:** `HML-006-validacao-tutor.png`, mensagem de validação sem número completo.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-007 — Editar, pesquisar e inativar tutor
- **Perfil:** funcionário.
- **Pré-requisitos:** tutor de teste criado e vínculo com pet/atendimento anotado.
- **Passos:** 1) Pesquise e abra o tutor. 2) Edite um campo fictício. 3) Salve e reabra para confirmar. 4) Use a ação de inativação disponível, se permitida. 5) Verifique se os vínculos e históricos continuam consultáveis.
- **Esperado:** alterações persistem; inativação não apaga histórico nem desvincula registros.
- **Dados:** HML Tutor Aurora.
- **Print:** `HML-007-detalhe-tutor.png`, detalhe com informações fictícias.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-008 — Cadastrar pet, raça livre, porte e foto
- **Perfil:** funcionário.
- **Pré-requisitos:** tutor HML ativo; rota `/pets/novo`.
- **Passos:** 1) Abra o cadastro e vincule o tutor sintético. 2) Preencha nome, espécie e **Raça do pet** como texto livre. 3) Teste também `SRD`; em outro registro use `Não sei informar` e porte válido. 4) Envie apenas imagem sintética sem dados reais, dentro do limite mostrado. 5) Salve e abra `/pets/:id`.
- **Esperado:** raça persiste; raça desconhecida exige porte; foto é opcional e formato/tamanho inválido é recusado.
- **Dados:** HML Nuvem, HML Faísca; imagens abstratas de teste.
- **Print:** `HML-008-pet-detalhe.png`, raça/porte visíveis e imagem sintética.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-009 — Complementar raça/porte e editar pet
- **Perfil:** funcionário.
- **Pré-requisitos:** pet HML com raça ausente ou desconhecida; `/pets/:id/editar`.
- **Passos:** 1) Abra o pet. 2) Corrija raça em texto livre. 3) Teste `Não sei informar` sem porte e com porte. 4) Salve, reabra e confira os campos de cuidados/observações.
- **Esperado:** validação impede raça vazia e exige porte para raça desconhecida; outros dados não são perdidos.
- **Dados:** HML Nuvem.
- **Print:** `HML-009-edicao-raca-porte.png`, campos corrigidos.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-010 — Vínculos tutor–pet e acesso indevido
- **Perfil:** funcionário; também testar portal público como dois tutores distintos.
- **Pré-requisitos:** dois tutores sintéticos, cada qual com um pet; fluxo de identificação por e-mail em modo de teste.
- **Passos:** 1) Confira cada pet na ficha do tutor correto. 2) Identifique publicamente o Tutor A. 3) Tente selecionar/acessar ID do pet do Tutor B apenas pelos controles normais disponíveis. 4) Repita logado como Tutor B.
- **Esperado:** cada sessão lista somente pets vinculados ao tutor validado; compartilhamento de endereço de teste não amplia acesso.
- **Dados:** HML Tutor Aurora/HML Tutor Brisa e pets Nuvem/Faísca.
- **Print:** `HML-010-vinculos-pets.png`, tela com identificadores anonimizados; nunca capturar códigos.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Serviços, produtos e estoque

### HML-011 — Consultar e cadastrar serviço
- **Perfil:** gerente ou administrador.
- **Pré-requisitos:** `/atendimentos/servicos`.
- **Passos:** 1) Consulte a lista e pesquise no campo **Buscar serviço...**. 2) Abra o cadastro de serviço. 3) Informe nome, descrição, preço e duração válidos. 4) Salve e consulte novamente.
- **Esperado:** serviço aparece com dados corretos e pode ser selecionado em atendimento.
- **Dados:** HML Banho teste, valor sintético de R$ 1,23.
- **Print:** `HML-011-servicos.png`, lista com serviço HML.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-012 — Editar/inativar serviço e preservar snapshots
- **Perfil:** gerente ou administrador.
- **Pré-requisitos:** serviço HML e atendimento com snapshot de seu preço.
- **Passos:** 1) Edite preço/nome do serviço. 2) Reabra atendimento criado antes da alteração. 3) Verifique o snapshot. 4) Inative o serviço se houver controle visível e tente novo agendamento.
- **Esperado:** novo uso segue configuração atual; atendimento antigo preserva valor/descrição registrados.
- **Dados:** serviço HML Banho teste.
- **Print:** `HML-012-snapshot-servico.png`, detalhe sem dados de cliente real.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-013 — Cadastrar produto e consultar estoque
- **Perfil:** gerente ou administrador.
- **Pré-requisitos:** `/produtos` e controles de gestão disponíveis.
- **Passos:** 1) Use **+ Novo Produto**. 2) Preencha nome/categoria/unidade e saldo inicial de teste conforme formulário. 3) Salve. 4) Pesquise por **Pesquisar por produto ou categoria...**.
- **Esperado:** produto aparece e quantidade inicial corresponde ao valor fictício.
- **Dados:** HML Shampoo teste, saldo 5, mínimo 2.
- **Print:** `HML-013-produto.png`, produto sintético na lista.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-014 — Movimentações de entrada, saída e saldo mínimo
- **Perfil:** gerente ou administrador.
- **Pré-requisitos:** produto HML com saldo conhecido.
- **Passos:** 1) Abra movimentação do produto. 2) Registre entrada de 2 unidades com justificativa HML. 3) Registre saída de 1. 4) Tente saída acima do saldo sem confirmar se a tela alertar que é uma operação irreversível; use somente dados HML. 5) Consulte histórico.
- **Esperado:** saldo não fica negativo; cada movimento registra tipo, quantidade e autoria; aviso de mínimo reflete saldo.
- **Dados:** HML Shampoo teste.
- **Print:** `HML-014-movimentacao-estoque.png`, histórico sintético.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-015 — Permissões e histórico de estoque
- **Perfil:** funcionário, gerente e administrador.
- **Pré-requisitos:** contas por perfil; `/administrativo/estoque` e `/produtos`.
- **Passos:** 1) Entre por perfil. 2) Abra a consulta e o histórico. 3) Tente as ações de gestão que a interface apresentar. 4) Para ações proibidas, faça tentativa somente por navegação normal; se validação de API for necessária, operador técnico registra sem expor token.
- **Esperado:** visibilidade e escrita seguem permissões; funcionário não recebe permissão gerencial indevida; histórico preserva movimentos.
- **Dados:** produto HML.
- **Print:** `HML-015-permissoes-estoque.png`, perfil e tela sem credenciais.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Creche e hotel

### HML-016 — Entrada na creche
- **Perfil:** funcionário.
- **Pré-requisitos:** pet HML ativo e sem entrada atual; `/creche`.
- **Passos:** 1) Clique **+ Registrar Entrada**. 2) Pesquise por pet, tutor ou raça. 3) Selecione HML Nuvem. 4) Preencha observação fictícia no campo **Informações importantes para a permanência do pet...**. 5) Registre a entrada.
- **Esperado:** pet aparece em **Pets na creche agora** com tutor e hora de entrada corretos.
- **Dados:** HML Nuvem.
- **Print:** `HML-016-entrada-creche.png`, card HML.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-017 — Saída e histórico da creche
- **Perfil:** funcionário.
- **Pré-requisitos:** HML-016 concluído.
- **Passos:** 1) Abra o registro ativo. 2) Use a ação de saída. 3) Preencha observação no campo **Ex.: Pet entregue ao tutor sem intercorrências.** com nota fictícia. 4) Confirme. 5) Abra **Histórico**.
- **Esperado:** pet sai da lista atual; histórico mantém entrada, saída e observação.
- **Dados:** HML Nuvem.
- **Print:** `HML-017-historico-creche.png`, histórico HML.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-018 — Busca, estados vazios e filtro da creche
- **Perfil:** funcionário.
- **Pré-requisitos:** `/creche` com ao menos um registro HML ou vazio controlado.
- **Passos:** 1) Busque por parte do nome. 2) Busque termo inexistente. 3) Abra `/creche/historico`. 4) Confira estado vazio/erro quando não houver registro.
- **Esperado:** resultados filtrados sem registros alheios; estado vazio é compreensível.
- **Dados:** HML Nuvem e termo `HML inexistente`.
- **Print:** `HML-018-creche-busca.png`, estado pesquisado.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-019 — Criar reserva de hotel
- **Perfil:** funcionário.
- **Pré-requisitos:** pet HML livre; `/hotel/nova-reserva`.
- **Passos:** 1) Selecione o pet usando **Buscar pet ou tutor...**. 2) Escolha período futuro fictício. 3) Preencha observações de hospedagem. 4) Salve e abra o detalhe da reserva.
- **Esperado:** período, tutor, pet e estado aparecem corretamente; conflito de período é recusado.
- **Dados:** HML Nuvem, datas futuras apenas no banco de homologação.
- **Print:** `HML-019-reserva-hotel.png`, detalhe da reserva sintética.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-020 — Check-in, check-out e histórico de hotel
- **Perfil:** funcionário.
- **Pré-requisitos:** reserva HML criada.
- **Passos:** 1) Abra `/hotel/:id/checkin`. 2) Confira pet/reserva e registre nota sintética. 3) Faça check-out em `/hotel/:id/checkout`, informando nota de saída. 4) Consulte `/hotel/historico` e o detalhe.
- **Esperado:** estados e horários mudam uma vez; eventos e notas permanecem consultáveis.
- **Dados:** reserva HML Nuvem.
- **Print:** `HML-020-hotel-checkin-checkout.png`, tela final com dados fictícios.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-021 — Cancelamento e reativação de reserva
- **Perfil:** funcionário/gerente conforme controles expostos.
- **Pré-requisitos:** reserva sintética cancelável; outra reserva sintética elegível para reativação, se a tela suportar.
- **Passos:** 1) Abra o cancelamento. 2) Leia a confirmação. 3) Use motivo fictício obrigatório. 4) Confira histórico. 5) Teste reativação somente se houver ação visível e permitido no estado.
- **Esperado:** motivo e autoria ficam no histórico; não há exclusão silenciosa nem reativação duplicada.
- **Dados:** HML reserva.
- **Print:** `HML-021-cancelamento-hotel.png`, confirmação/status após operação.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Atendimentos e solicitações públicas

### HML-022 — Criar atendimento interno
- **Perfil:** funcionário.
- **Pré-requisitos:** pet, serviço e agenda sintéticos; `/atendimentos/novo`.
- **Passos:** 1) Selecione tutor/pet válido. 2) Escolha serviço e data futura no formulário. 3) Informe observação HML. 4) Salve. 5) Abra `/atendimentos` e detalhe.
- **Esperado:** atendimento interno mantém fluxo histórico `AGENDADO`; serviços e valores do snapshot correspondem ao momento da criação.
- **Dados:** HML Nuvem, HML Banho teste.
- **Print:** `HML-022-atendimento-criado.png`, detalhe sintético.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-023 — Iniciar e finalizar atendimento
- **Perfil:** funcionário.
- **Pré-requisitos:** atendimento HML em estado elegível.
- **Passos:** 1) Abra `/atendimentos/:id`. 2) Use a ação disponível para iniciar. 3) Confirme o estado e histórico. 4) Abra `/atendimentos/:id/finalizar`. 5) Preencha observação final HML e conclua.
- **Esperado:** sequência válida de estados; atendimento pendente de confirmação pública não pode iniciar/finalizar.
- **Dados:** HML Nuvem.
- **Print:** `HML-023-atendimento-finalizado.png`, estado final e histórico.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-024 — Cancelar atendimento e preservar dados
- **Perfil:** funcionário, gerente e administrador.
- **Pré-requisitos:** atendimento elegível; um caso com pagamento pendente e um, se viável, com pago já estornado sinteticamente.
- **Passos:** 1) Abra detalhe. 2) Use **Cancelar agendamento**. 3) Informe motivo não vazio. 4) Para caso pago sem estorno, confirme que operação é recusada e não alterou dados. 5) Para pendente/estornado, complete cancelamento permitido e reabra histórico.
- **Esperado:** motivo/autoria preservados; pagamento PAGO exige estorno; ESTORNADO não é modificado; histórico não é apagado.
- **Dados:** HML atendimento; não use pagamento bancário real.
- **Print:** `HML-024-cancelamento-atendimento.png`, resultado e estado financeiro sintético.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-025 — Comprovante PDF do atendimento
- **Perfil:** funcionário.
- **Pré-requisitos:** atendimento elegível com serviços sintéticos; rota `/atendimentos/:id/comprovante`.
- **Passos:** 1) Abra comprovante. 2) Confira tutor, pet, serviços e totais. 3) Use a ação de gerar/baixar disponível. 4) Abra o PDF local sem enviá-lo a terceiros.
- **Esperado:** PDF legível, referente ao atendimento selecionado, sem dados de outro tutor.
- **Dados:** HML Nuvem e serviço HML.
- **Print:** `HML-025-comprovante-tela.png`, tela antes da geração; não fotografar PDF com outros clientes.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-026 — Caminhos legados de Atendimentos
- **Perfil:** funcionário.
- **Pré-requisitos:** login; links antigos de compatibilidade.
- **Passos:** 1) Acesse `/atendimentos`. 2) Abra `/banho-tosa` no navegador. 3) Abra link antigo com subcaminho se disponível no registro HML. 4) Confira destino.
- **Esperado:** nomenclatura de interface é Atendimentos; aliases continuam redirecionando e dados permanecem acessíveis.
- **Dados:** sem nova gravação; IDs de homologação.
- **Print:** `HML-026-alias-atendimentos.png`, URL de destino sem ID real.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-027 — Identificação de tutor existente por e-mail
- **Perfil:** cliente sintético.
- **Pré-requisitos:** Amores Pet iniciado pelo atalho de homologação; tutor HML associado a e-mail `example.invalid`; SMTP sink local ativo; nenhum e-mail real.
- **Passos:** 1) Abra `/agendar`. 2) Informe os dados solicitados para identificar o tutor. 3) Solicite código. 4) Abra `scripts/homologacao/Ver-Codigo-Email-Homologacao.vbs` e confirme o código sem copiá-lo ao print. 5) Confira os pets vinculados.
- **Esperado:** e-mail precisa ser comprovado; tutor só enxerga pets próprios; sem sessão definitiva em falha de envio/código.
- **Dados:** HML Tutor Aurora.
- **Print:** `HML-027-identificacao-publica.png`, tela após sucesso sem e-mail ou código visível.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações/dependência SMTP:** ____.

### HML-028 — Cadastro público de novo tutor e pet
- **Perfil:** cliente sintético.
- **Pré-requisitos:** Amores Pet iniciado pelo atalho de homologação; SMTP sink local ativo; CPF sintético novo.
- **Passos:** 1) Abra `/agendar` e escolha o fluxo de novo tutor. 2) Preencha dados sintéticos. 3) Informe raça do primeiro pet; teste raça vazia e `Não sei informar` sem porte antes da tentativa válida. 4) Solicite o código, abra `scripts/homologacao/Ver-Codigo-Email-Homologacao.vbs` e confirme o e-mail. 5) Conclua cadastro e confira seleção do pet.
- **Esperado:** verificação precede sessão/cadastro; CPF duplicado não dá acesso à conta existente; raça desconhecida exige porte.
- **Dados:** HML Tutor Brisa, HML Faísca.
- **Print:** `HML-028-novo-tutor-verificado.png`, conclusão sem dados de contato legíveis.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações/dependência SMTP:** ____.

### HML-029 — Adicionar pet e completar dados no portal
- **Perfil:** cliente sintético identificado.
- **Pré-requisitos:** HML-027; sessão de Tutor Aurora.
- **Passos:** 1) Na seleção de pets, adicione HML Faísca com campos fictícios. 2) Confirme vínculo/seleção. 3) Selecione pet antigo sem raça e tente avançar. 4) Preencha raça/porte requerido. 5) Continue sem reiniciar fluxo.
- **Esperado:** pet fica ligado ao tutor da sessão e não a ID enviado fora dela; avanço só após dados obrigatórios válidos.
- **Dados:** HML Faísca, `SRD` ou raça de texto livre.
- **Print:** `HML-029-adicionar-pet-publico.png`, pet selecionado sem informação privada.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-030 — Solicitação pública ponta a ponta
- **Perfil:** cliente sintético identificado.
- **Pré-requisitos:** tutor/pet/raça/porte verificados, serviço ativo, horário futuro publicado, e-mail simulado.
- **Passos:** 1) Em `/agendar`, selecione pet. 2) Selecione serviço(s), dia e horário disponível. 3) Confira valores e observação. 4) Envie solicitação. 5) Anote identificador sintético e peça à equipe para consultar `/atendimentos/solicitacoes`.
- **Esperado:** mensagem diz “Sua solicitação foi recebida e aguarda confirmação da equipe Amores Pet.”; estado é pendente, slot reservado e não há cobrança até confirmação.
- **Dados:** HML Tutor Aurora, HML Nuvem, horário futuro HML.
- **Print:** `HML-030-solicitacao-recebida.png`, tela final sem token/código.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-031 — Confirmar e recusar solicitação na fila
- **Perfil:** funcionário, gerente e administrador, em solicitações separadas.
- **Pré-requisitos:** uma solicitação futura pendente para confirmar e outra para recusar; `/atendimentos/solicitacoes`.
- **Passos:** 1) Confira data/filtro/busca e abra **Abrir detalhes**. 2) Confirme uma solicitação futura. 3) Verifique atendimento, slot e cobrança. 4) Abra outra; escolha **Recusar**. 5) Tente enviar motivo em branco e depois motivo fictício válido. 6) Consulte histórico operacional.
- **Esperado:** três perfis operam; confirmação gera uma cobrança pendente única; recusa exige motivo; autoria/data ficam no histórico.
- **Dados:** duas solicitações sintéticas independentes.
- **Print:** `HML-031-fila-confirmacao-recusa.png`, detalhe e resultado sem tutor identificável.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-032 — Horário, conflitos e reutilização
- **Perfil:** cliente sintético e funcionário.
- **Pré-requisitos:** dois navegadores/perfis de teste, dois tutores/pets fictícios e um único slot HML; sem tráfego de produção.
- **Passos:** 1) Abra o mesmo horário disponível em duas sessões. 2) Envie as duas solicitações quase simultaneamente. 3) Confira apenas uma reserva ativa. 4) Recuse/cancele a solicitação vencedora. 5) Verifique se dia/slot ainda estão publicados, abertos e futuros. 6) Confira disponibilidade e histórico antigo.
- **Esperado:** no máximo uma reserva concorrente; slot só reabre se elegível; registro anterior permanece; dia fechado/passado não é reaberto.
- **Dados:** slot e clientes sintéticos isolados.
- **Print:** `HML-032-conflito-horario.png`, resultado do calendário sem dados pessoais.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-033 — Agenda pública e alterações de oferta
- **Perfil:** funcionário, gerente e administrador.
- **Pré-requisitos:** `/agenda-publica`; data/slot fictícios futuros.
- **Passos:** 1) Consulte mês e navegue anterior/próximo. 2) Confira dia e horários individuais publicados. 3) Tente ação de alteração como gerente/admin. 4) Como funcionário, valide fluxo de autorização requerido sem expor senha. 5) Feche/retire da oferta slot livre e slot ocupado somente seguindo confirmação da própria interface.
- **Esperado:** calendário usa disponibilidade explícita, horários arbitrários e não apaga vínculo ocupado; funcionários não alteram sem autorizador válido.
- **Dados:** slot HML exclusivo.
- **Print:** `HML-033-agenda-publica-interna.png`, calendário/filtro fictício.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-034 — Sessões públicas expiradas e recuperação
- **Perfil:** cliente sintético.
- **Pré-requisitos:** sessão pública HML válida; nenhuma sessão/identidade real.
- **Passos:** 1) Preencha etapa pública sem enviar dados. 2) Deixe a sessão expirar conforme duração configurada ou use somente o método de teste documentado. 3) Tente avançar. 4) Identifique novamente outro tutor sintético e confirme que dados do primeiro não liberam pets ao segundo.
- **Esperado:** HTTP 401 encaminha à identificação; token inválido é removido; dados não sensíveis preenchidos podem permanecer, mas acesso/pets anteriores não são restaurados.
- **Dados:** Tutor Aurora e Brisa.
- **Print:** `HML-034-sessao-expirada.png`, tela de reidentificação sem token.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Financeiro, comprovantes e comunicação

### HML-035 — Pagamento autorizado e PIX
- **Perfil:** gerente/administrador; funcionário conforme autorização atual.
- **Pré-requisitos:** atendimento confirmado com cobrança HML pendente; tela `/atendimentos/:id/pagamento`.
- **Passos:** 1) Abra pagamento. 2) Confira valor sintético. 3) Gere/exiba PIX sem efetuar transferência real. 4) Teste que funcionário não consegue marcar como pago sem regra/autorização aplicável. 5) Confirme pagamento só com perfil permitido e dados de teste.
- **Esperado:** PIX corresponde ao total; nenhuma cobrança duplica; restrições financeiras permanecem.
- **Dados:** pagamento HML de R$ 1,23; não use QR pago em banco real.
- **Print:** `HML-035-pagamento-pix.png`, ocultando chave/identificador completo se houver.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-036 — Pagamentos pendentes, filtros e detalhes
- **Perfil:** gerente/administrador.
- **Pré-requisitos:** rota `/administrativo/pagamentos-pendentes`; cobrança HML pendente.
- **Passos:** 1) Acesse lista. 2) Pesquise pelo nome HML. 3) Abra detalhe/ação compatível. 4) Compare valor com snapshot de serviços. 5) Tente consulta como funcionário e registre a resposta.
- **Esperado:** pendente listado uma vez; funcionário não recebe privilégio financeiro por acesso direto.
- **Dados:** HML Nuvem, cobrança sintética.
- **Print:** `HML-036-pagamentos-pendentes.png`, sem dados pessoais completos.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-037 — Estorno e cancelamento financeiro
- **Perfil:** gerente/administrador; funcionário com autorizador válido se permitido.
- **Pré-requisitos:** pagamento HML marcado como pago de forma sintética; endpoint/tela de estorno disponível.
- **Passos:** 1) Tente cancelar atendimento pago antes de estornar e confira bloqueio. 2) Estorne pela ação disponível com motivo HML. 3) Confira que registro original e dados do estorno permanecem. 4) Cancele atendimento após estorno se elegível.
- **Esperado:** pago exige estorno prévio; estorno não apaga/reescreve pagamento original; não vira receita recebida nos relatórios.
- **Dados:** transação fictícia, sem operação bancária.
- **Print:** `HML-037-estorno.png`, estado financeiro e histórico sem dados de pagamento reais.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-038 — Envio manual por WhatsApp
- **Perfil:** funcionário.
- **Pré-requisitos:** atendimento sintético e número fictício sob controle de teste; app de mensagens em modo manual.
- **Passos:** 1) Abra atendimento. 2) Use **Lembrar pelo WhatsApp** ou link manual disponível. 3) Confira texto pré-preenchido sem enviar mensagem para número real. 4) Cancele a ação externa.
- **Esperado:** abre conversa/manual sem afirmar envio concluído e sem enviar automaticamente.
- **Dados:** destino sintético não discável.
- **Print:** `HML-038-whatsapp-manual.png`, preferência/aba sem número visível.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-039 — WhatsApp Business simulado e disponibilidade
- **Perfil:** administrador/gerente autorizado.
- **Pré-requisitos:** transporte simulado habilitado pela configuração local, sem credenciais Meta reais; PDF de atendimento HML.
- **Passos:** 1) Abra fluxo de comunicação. 2) Confira indicação do modo disponível. 3) Teste mensagem e PDF com destinatário sintético/consentimento registrado. 4) Simule retorno inválido/falha. 5) Não habilite Meta real nem repita chamada incerta.
- **Esperado:** interface indica indisponibilidade quando não configurado; simulação não se apresenta como entrega Meta real; falha não vaza segredo nem duplica tentativa.
- **Dados:** HML; destino simulado.
- **Print:** `HML-039-whatsapp-simulado.png`, estado do simulador sem token ou número.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações/dependência externa:** ____.

### HML-040 — Notificações e preferência exclusiva
- **Perfil:** cada perfil interno.
- **Pré-requisitos:** `NotificaçãoSino` no Layout; eventos HML gerados por fluxo de teste.
- **Passos:** 1) Abra o controle **Notificações não lidas**. 2) Consulte a **Central de notificações**. 3) Marque como lida conforme ação visível. 4) Em preferências, selecione aviso visual e depois sonoro, nunca ambos ao mesmo tempo; provoque evento de teste.
- **Esperado:** escopo individual e status lido persistem; preferência escolhida é exclusiva e evento só gera canal selecionado.
- **Dados:** evento sintético; não gerar evento operacional real.
- **Print:** `HML-040-central-notificacoes.png`, painel sem nomes privados.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Relatórios, site e administração

### HML-041 — Relatórios operacionais
- **Perfil:** gerente/administrador.
- **Pré-requisitos:** dados HML conhecidos e `/relatorios`.
- **Passos:** 1) Escolha tipo de relatório. 2) Preencha **De** e **Até** com intervalo contendo dados sintéticos. 3) Se aplicável, filtre por **Situação** e **Serviço**. 4) Acione **Gerar relatório**. 5) Compare linhas e resumo com fontes HML.
- **Esperado:** período inclusivo e fuso indicados; registros sintéticos corretos; pendentes/recusados não se tornam receita/confirmados.
- **Dados:** uma linha de cada situação pertinente.
- **Print:** `HML-041-relatorio-operacional.png`, tabela anonimizada.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-042 — Relatório financeiro e autorização
- **Perfil:** gerente/administrador; tentativa de funcionário.
- **Pré-requisitos:** pagamentos HML pendente, pago e estornado em períodos conhecidos.
- **Passos:** 1) Gere relatório financeiro. 2) Compare totais ao conjunto sintético, sem duplicação por múltiplos serviços. 3) Confirme estornado excluído da receita paga. 4) Tente acessar pela conta funcionário, tanto menu quanto rota direta.
- **Esperado:** backend protege dados; somas corretas; estornado não contado como receita; não há duplicação de valor.
- **Dados:** HML R$ 1,23/2,34 sintéticos.
- **Print:** `HML-042-relatorio-financeiro.png`, valores sintéticos e controle de acesso sem URL sensível.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-043 — Exportar CSV e imprimir/salvar PDF pelo navegador
- **Perfil:** gerente/administrador.
- **Pré-requisitos:** relatório HML carregado.
- **Passos:** 1) Use **Exportar CSV**. 2) Abra arquivo local e confira cabeçalhos e registros. 3) Use **Imprimir / salvar PDF** e escolha destino local de homologação. 4) Confira que arquivo contém apenas dados do filtro.
- **Esperado:** exportações respeitam período e autorização; arquivo legível e sem registro de fora do filtro.
- **Dados:** somente HML.
- **Print:** `HML-043-exportacao.png`, tela de impressão antes de gravar/CSV aberto com valores fictícios.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-044 — Site institucional público e conteúdo neutro
- **Perfil:** administrador/gerente para edição; público para consulta.
- **Pré-requisitos:** tela `/sistema/conteudo-site`; informações institucionais confirmadas ou fixture sintética claramente marcada.
- **Passos:** 1) Abra **Conteúdo do Site**. 2) Revise abas **Página inicial**, **História e informações institucionais**, **Endereço, contatos e localização**. 3) Não publique conteúdo fictício como verdadeiro. 4) Confira `/` em outra aba e acesso direto à rota.
- **Esperado:** campos vazios não inventam fatos; conteúdo só é exposto conforme publicação; tela pública não quebra.
- **Dados:** textos com prefixo HML, mantidos não publicados.
- **Print:** `HML-044-site-publico.png`, site neutro sem endereço/contato privado.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-045 — Premiações e galeria administrável
- **Perfil:** gerente/administrador; funcionário tenta alteração.
- **Pré-requisitos:** armazenamento local de homologação; imagem abstrata sintética JPEG/PNG/WebP menor que limite da interface.
- **Passos:** 1) Em **Conteúdo do Site**, abra **Prêmios e conquistas** e crie premiação HML não publicada. 2) Em **Galeria de fotos**, use **Enviar fotografia**, preencha título/categoria/texto alternativo/legenda e deixe publicação desmarcada. 3) Edite e publique somente fixture. 4) Confira `/galeria`. 5) Como funcionário, tente acesso/alteração por navegação/API somente em ambiente HML. 6) Remova fixture apenas pelo controle da própria galeria e após confirmar que é sintética.
- **Esperado:** público exibe somente publicados; fotos de pets não são afetadas; funcionário não altera conteúdo; texto alternativo disponível.
- **Dados:** imagem abstrata gerada para teste, sem animal/pessoa real.
- **Print:** `HML-045-galeria-publicada.png`, fixture sintética publicada na galeria.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-046 — Administração de usuários
- **Perfil:** administrador.
- **Pré-requisitos:** `/administracao/usuarios`; usuário sintético inativo ou novo.
- **Passos:** 1) Abra administração. 2) Consulte usuários. 3) Crie usuário HML em um perfil permitido, altere status/dados sintéticos e confira. 4) Como gerente/funcionário, acesse rota e registre bloqueio.
- **Esperado:** operação exclusiva de administrador também protegida pelo backend; usuário novo recebe perfil correto.
- **Dados:** HML Funcionário Auxiliar.
- **Print:** `HML-046-administracao-usuarios.png`, nomes fictícios, sem e-mail/senha.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-047 — Auditoria e histórico operacional
- **Perfil:** administrador; funcionário/gerente para testar restrição.
- **Pré-requisitos:** operação HML auditável e `/administracao/auditoria`.
- **Passos:** 1) Faça alteração sintética autorizada. 2) Como administrador, abra auditoria e detalhe o evento. 3) Confira autor, ação e horário. 4) Tente abrir auditoria com gerente/funcionário. 5) Consulte histórico de atendimento sem usar auditoria administrativa.
- **Esperado:** autoria preservada; auditoria administrativa exclusiva do administrador; histórico operacional continua disponível conforme permissão.
- **Dados:** alteração em registro HML não financeiro.
- **Print:** `HML-047-auditoria.png`, evento sem detalhes pessoais/segredos.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-048 — Permissões por perfil e tentativa de acesso direto
- **Perfil:** funcionário, gerente e administrador.
- **Pré-requisitos:** três contas HML; matriz atual do sistema; caminhos `/administracao`, `/administracao/auditoria`, `/relatorios`, `/agenda-publica`, `/atendimentos/solicitacoes`.
- **Passos:** 1) Acesse cada caminho com cada perfil. 2) Registre se a tela permite leitura. 3) Teste ação administrativa/financeira que não pertence ao perfil somente em dados HML. 4) Registre bloqueio e mensagem. 5) Não altere permissões para fazer o teste passar.
- **Esperado:** funcionário pode operar o que é operacionalmente autorizado, mas não recebe auditoria/administração/financeiro; gerente não herda exclusividades de admin; backend valida cada ação.
- **Dados:** usuários e registros HML.
- **Print:** `HML-048-matriz-permissoes.png`, perfil e bloqueio sem capturar token.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-049 — Responsividade e acesso direto às rotas
- **Perfil:** cada perfil interno e público.
- **Pré-requisitos:** navegador atualizado e viewport de celular/tablet/desktop; build de homologação.
- **Passos:** 1) Acesse diretamente `/`, `/galeria`, `/agendar`, `/login`, `/dashboard`, `/atendimentos/solicitacoes`, `/relatorios`. 2) Repita em tamanhos celular, tablet e computador. 3) Confira navegação, modais, formulário, tabelas e imagens. 4) Recarregue a rota profunda.
- **Esperado:** SPA carrega URL direta; layout permanece utilizável sem conteúdo cortado ou ação inacessível; login protege caminhos internos.
- **Dados:** somente fixtures HML.
- **Print:** `HML-049-responsividade.png`, uma captura por viewport conforme catálogo.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

### HML-050 — Falhas recuperáveis e mensagens
- **Perfil:** funcionário e cliente sintético.
- **Pré-requisitos:** aplicação HML; operação não destrutiva disponível.
- **Passos:** 1) Pesquise termo sem resultados. 2) Simule falha de rede desligando a rede local por alguns segundos (não reinicie banco/processos desconhecidos). 3) Reative e recarregue. 4) Em um formulário, tente dado inválido antes de salvar. 5) Confira que dados preenchidos seguros permanecem ou que a interface explica o que ocorreu.
- **Esperado:** loading, vazio, erro e recuperação são identificáveis; nenhum erro técnico sensível aparece; nenhuma gravação parcial inesperada.
- **Dados:** termo `HML ausente`; formulário não submetido.
- **Print:** `HML-050-mensagem-erro-recuperacao.png`, mensagem compreensível sem stack trace.
- **Situação:** Aguardando teste manual. **Erro:** ____. **Observações:** ____.

## Registro de execução

O tracker CSV correspondente contém uma linha para cada código. Atualize apenas a situação depois de executar manualmente. Valores permitidos: `Aguardando teste manual`, `Erro encontrado`, `Correção realizada`, `Aprovado pelo usuário`, `Pendente externo`. Não marque como aprovado com base em Jest, build, inspeção de código ou relato de terceiro. Para um caso com dependência externa, mantenha `Aguardando teste manual` até o usuário decidir que o teste é executável; use o campo de observações para `Pendente externo: ...`.
