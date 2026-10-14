# Etapa 21 — Bloco D3: tutores e pets

## Regras entregues

- Novos pets do fluxo público exigem raça em texto livre, normalizada e limitada a 100 caracteres. `SRD` é aceito. `Não sei informar` é persistido de forma canônica, mantém o aviso para a equipe e exige porte Pequeno, Médio, Grande ou Gigante.
- Tutor já identificado pode adicionar pet pelo endpoint `/meus-pets`; tutor é derivado somente da sessão. Inserção em `pets` e vínculo em `pet_tutores` usam a mesma transação. Foto é opcional e passa pelo filtro JPG/PNG/WEBP de até 5 MB já usado internamente.
- Pet ativo vinculado que esteja sem raça interrompe a continuidade do agendamento. A rota PATCH verifica vínculo e sessão, atualiza raça/porte e permite continuar sem reiniciar o fluxo. Contato compartilhado pode ser verificado para CPF novo; CPF existente continua bloqueado e o e-mail compartilhado nunca autentica cadastros existentes.
- Dados do pet (raça, porte, sexo, alergias, necessidades e comportamento) estão disponíveis na ficha interna e nos detalhes/listagem de atendimentos para uso da equipe e da futura fila D4.
- A criação interna de atendimento também rejeita pet sem raça e exige porte quando a raça estiver como desconhecida; o formulário aponta para a edição da ficha do pet.
- Validações públicas verificam CPF, e-mail, telefone com DDD, CEP, UF, datas reais não futuras, limites textuais e duplicidade por CPF. Nomes iguais de pets continuam permitidos.

## Persistência

Migration aditiva `031_porte_gigante_pet.sql` amplia a constraint `chk_pets_porte`, preservando `NULL` para registros existentes e aceitando `gigante`. Não cria coluna nem impõe raça global. Instalador, schema, verificador estrutural e SQL de integridade incluem a migration e o novo valor. A migration não foi aplicada a banco algum nesta implementação.

## Proteções e validação

Endpoints novos usam middleware de sessão pública D2. Cadastro exige token válido, tutor ativo, e consulta/alteração de pet exige vínculo sessão–pet no banco. Novas inclusões usam limite persistente por IP (D2) e até cinco pets por tutor em 15 minutos. Nenhuma rota aceita `tutor_id` do cliente como autorização.

Os testes D3 essenciais cobrem validação livre de raça, SRD, raça desconhecida com porte obrigatório, cadastro transacional com tutor da sessão, rejeição de pet alheio, rollback de vínculo incompleto e rejeição de foto fora dos formatos aceitos. A suíte D2 continua cobrindo prova de e-mail antes do cadastro. A instalação/migration SQL deve ser rodada somente em PostgreSQL temporário comprovadamente isolado; nenhum teste escreve no banco principal.
