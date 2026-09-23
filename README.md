# Sistema de Gestão para Pet Shop

Sistema web desenvolvido para centralizar e facilitar o gerenciamento das principais operações de um pet shop.

O projeto possui frontend, backend e banco de dados separados, com autenticação de usuários, controle de permissões, auditoria e diferentes módulos operacionais.

> A identidade visual e o nome definitivo do estabelecimento serão configurados posteriormente.

---

## Funcionalidades

### Tutores

- Cadastro de tutores
- Edição de dados
- Ativação e inativação
- Consulta de informações
- Vinculação de vários pets ao mesmo tutor
- Vinculação de vários tutores ao mesmo pet
- Desvinculação sem excluir os cadastros

### Pets

- Cadastro de pets
- Edição de informações
- Upload de foto
- Ativação e inativação
- Consulta da ficha do pet
- Definição de tutor principal
- Múltiplos tutores por pet
- Listagem dos pets vinculados a cada tutor

### Produtos e Estoque

- Cadastro de produtos
- Edição de produtos
- Controle de quantidade atual
- Quantidade mínima de estoque
- Entrada de estoque
- Saída de estoque
- Ajustes de estoque
- Histórico de movimentações
- Controle para impedir estoque negativo

### Creche

- Registro de entrada
- Controle de pets atualmente na creche
- Registro de saída
- Histórico de utilização

### Hotel

- Agendamento de hospedagem
- Check-in
- Check-out
- Cancelamento
- Histórico de hospedagens

### Banho e Tosa / Atendimentos

- Cadastro de serviços
- Registro de atendimentos
- Controle de valores
- Controle de pagamentos
- Pagamentos pendentes
- Comprovante interno
- Informações para pagamento via PIX

> A nomenclatura "Banho e Tosa" poderá ser substituída por "Atendimentos" em uma atualização futura.

### Administrativo

Área destinada aos perfis Administrador e Gerente.

Inclui recursos como:

- Histórico de estoque
- Pagamentos pendentes
- Informações administrativas da operação

### Administração do Sistema

Área exclusiva do perfil Administrador.

Inclui:

- Gerenciamento de usuários
- Alteração de nome e e-mail dos usuários
- Alteração de perfil
- Ativação e inativação de usuários
- Redefinição administrativa de senha
- Logs
- Auditoria
- Recursos relacionados à segurança do sistema

### Dashboard

O Dashboard apresenta informações e atalhos de acordo com o perfil do usuário autenticado.

---

## Perfis de acesso

O sistema possui três perfis fixos.

### Administrador

Possui acesso completo ao sistema, incluindo:

- Operação
- Administrativo
- Usuários
- Segurança
- Logs
- Auditoria
- Configurações administrativas

### Gerente

Possui acesso às funções operacionais e administrativas necessárias para gerenciamento do estabelecimento.

Não possui acesso aos recursos sensíveis exclusivos do Administrador.

### Funcionário

Possui acesso às funções necessárias para as atividades operacionais do dia a dia.

Não possui acesso à administração de usuários, auditoria completa ou configurações sensíveis.

> As permissões são verificadas também pelo backend. Ocultar uma opção no frontend não é utilizado como mecanismo de segurança.

---

## Segurança

O projeto utiliza diferentes mecanismos de segurança.

Entre eles:

- Autenticação por JWT
- Senhas armazenadas utilizando hash com bcrypt
- Controle de permissões no backend
- Confirmação de senha para operações críticas
- Invalidação de sessões quando necessário
- Rate limiting em rotas sensíveis
- Helmet
- CORS
- Limite de tamanho para requisições JSON
- Validação de dados
- Logs e auditoria
- Proteção contra estoque negativo
- Transações de banco em operações críticas

Arquivos `.env` não devem ser enviados ao GitHub.

---

# Tecnologias

## Frontend

- React
- Vite
- JavaScript
- HTML
- CSS
- React Router
- Axios

## Backend

- Node.js
- Express
- JWT
- bcrypt
- Multer
- Nodemailer
- Helmet
- express-rate-limit

## Banco de dados

- PostgreSQL

---

# Estrutura do projeto

```text
sistema-petshop/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── database/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── uploads/
│   │       └── pets/
│   │
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   │
│   ├── .env
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

# Requisitos

Antes de executar o projeto, instale:

- Git
- Node.js
- PostgreSQL
- Visual Studio Code ou outro editor

Também é recomendado possuir:

- pgAdmin

---

# Instalação

## 1. Clonar o projeto

Abra o terminal e execute:

```bash
git clone https://github.com/Arthur-Thome/sistema-petshop.git
```

Entre na pasta:

```bash
cd sistema-petshop
```

---

# Backend

## 2. Instalar as dependências

Entre na pasta:

```bash
cd backend
```

Execute:

```bash
npm install
```

---

## 3. Criar o banco de dados

No PostgreSQL, crie um banco chamado:

```text
sistema_petshop
```

Depois execute o arquivo:

```text
backend/src/database/schema.sql
```

Esse arquivo contém a estrutura necessária para o banco de dados.

---

## 4. Configurar as variáveis de ambiente

Na pasta:

```text
backend/
```

utilize o arquivo:

```text
.env.example
```

como referência para criar:

```text
.env
```

Preencha as configurações de acordo com o ambiente utilizado.

As informações sensíveis, como:

- senha do PostgreSQL
- JWT secret
- senha de aplicativo do e-mail
- chave PIX

não devem ser colocadas no README nem enviadas ao GitHub.

---

## 5. Criar o primeiro Administrador

O projeto possui o mecanismo utilizado para criação do primeiro usuário Administrador.

Antes de executá-lo, configure no `.env` os dados necessários do administrador inicial.

Utilize somente esse procedimento para a configuração inicial do ambiente.

Depois disso, novos usuários devem ser administrados através do próprio sistema.

---

## 6. Iniciar o backend

Dentro de:

```text
backend/
```

execute:

```bash
npm run dev
```

ou, conforme os scripts disponíveis:

```bash
npm start
```

Por padrão, durante o desenvolvimento, a API utiliza:

```text
http://localhost:3001
```

---

# Frontend

Abra outro terminal.

Entre na pasta do frontend:

```bash
cd frontend
```

Instale as dependências:

```bash
npm install
```

Caso seja necessário instalar também dependências opcionais:

```bash
npm install --include=optional
```

---

## 7. Configurar o frontend

Crie/configure:

```text
frontend/.env
```

Durante o desenvolvimento local:

```env
VITE_API_URL=http://localhost:3001/api
```

---

## 8. Iniciar o frontend

Execute:

```bash
npm run dev
```

O Vite mostrará no terminal o endereço utilizado para acessar o sistema.

Normalmente:

```text
http://localhost:5173
```

---

# Atualizando o projeto em outro computador

Se o projeto já estiver clonado em outro computador, não é necessário cloná-lo novamente.

Entre na pasta:

```bash
cd sistema-petshop
```

Confira se existem alterações locais:

```bash
git status
```

Se estiver tudo limpo, execute:

```bash
git pull origin main
```

Depois atualize as dependências do backend:

```bash
cd backend
npm install
```

E as do frontend:

```bash
cd ../frontend
npm install
```

> Os arquivos `.env` não são baixados do GitHub e devem permanecer configurados individualmente em cada computador.

---

# Banco de dados

O banco principal utilizado pelo projeto é:

```text
sistema_petshop
```

Entre as estruturas do banco está o relacionamento:

```text
pet_tutores
```

que permite:

```text
Tutor 1 ───────┐
               ├── Pet
Tutor 2 ───────┘

Tutor ───────── Pet 1
      └──────── Pet 2
```

Assim, um Tutor pode possuir vários Pets e um Pet pode possuir vários Tutores.

Cada Pet possui apenas um Tutor marcado como principal.

Durante a migração do sistema, o campo legado `pets.tutor_id` pode continuar presente para compatibilidade com módulos que ainda dependam dele.

---

# Upload de fotos

As fotos dos pets são armazenadas pelo backend.

A aplicação possui validações de:

- tamanho
- extensão
- tipo MIME

Os arquivos enviados durante o uso do sistema não devem ser versionados no Git.

---

# Recuperação de senha

O sistema possui recuperação de senha por e-mail.

Para utilizar o recurso, é necessário configurar corretamente as variáveis de e-mail no `.env` do backend.

As credenciais de e-mail nunca devem ser enviadas ao repositório.

---

# Logs e Auditoria

Operações relevantes do sistema podem gerar registros contendo informações como:

- usuário responsável
- operação executada
- registro afetado
- dados anteriores
- dados posteriores
- data e hora
- informações disponíveis da requisição

O acesso completo aos logs e à auditoria é exclusivo do Administrador.

---

# Desenvolvimento

Antes de realizar um commit:

```bash
git status
```

Confira as alterações.

Depois:

```bash
git diff --check
```

Adicione os arquivos:

```bash
git add .
```

Faça o commit:

```bash
git commit -m "Descricao da alteracao"
```

E envie:

```bash
git push origin main
```

Nunca faça commit de:

```text
.env
```

ou de arquivos contendo senhas, tokens ou outras credenciais.

---

# Status do projeto

O sistema encontra-se em desenvolvimento.

As principais funcionalidades operacionais, administrativas, autenticação, permissões e auditoria já foram implementadas.

Ainda podem ser realizadas melhorias de interface, configuração, identidade visual, implantação e funcionalidades adicionais.

---

# Autor

Desenvolvido por Arthur Thomé.