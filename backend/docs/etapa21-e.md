# Etapa 21 — Bloco E: conteúdo do site e galeria

O Bloco E permite editar conteúdo institucional sem alterar serviços, preços,
agenda, tutores, pets, atendimentos ou pagamentos. A migration aditiva
`032_conteudo_site_galeria.sql` cria `site_conteudo` (registro único inicial),
`site_premiacoes` e `site_galeria`; ela não modifica linhas operacionais.

## Acesso e API

Administrador e gerente acessam **Sistema → Conteúdo do Site**. A autorização é
verificada no backend em todas as rotas administrativas. Funcionário e visitante
não podem consultar ou alterar o painel. A auditoria administrativa completa
continua exclusiva do administrador; alterações deste módulo usam o registro
de autoria e o mecanismo de logs existente.

`GET /api/site-conteudo/publico` retorna os campos públicos, premiações
publicadas e imagens publicadas. `GET /api/site-conteudo/imagens/:id` serve uma
imagem somente enquanto seu registro estiver publicado e ativo. As rotas sob
`/api/site-conteudo/admin` exigem JWT interno válido e perfil administrador ou
gerente; o preview administrativo também exige autenticação.

O painel possui abas para página inicial, história/informações, endereço e
contatos, premiações e galeria. Os campos ficam vazios até a empresa informar
os dados verdadeiros. Nenhum prêmio, endereço, contato, ano de fundação ou
qualificação é presumido. O link manual de localização só aceita destinos
HTTPS permitidos do Google Maps. O preenchimento de endereço por CEP usa o
serviço público ViaCEP e é opcional. Horários exibidos são informativos e não
alteram a agenda.

Prêmios e imagens podem ser ordenados, publicados, ocultados e removidos
logicamente. As referências e arquivos removidos permanecem preservados. A
página pública não lista itens ocultos ou removidos e oculta prêmios, história
e localização sem conteúdo aplicável.

## Imagens e implantação

O upload aceita JPEG, PNG e WebP de até 8 MiB. Além do MIME e extensão, o
backend valida a estrutura binária do formato, dimensões positivas até 12.000
pixels por lado e até 80 milhões de pixels. Nomes UUID são gerados no servidor;
arquivos são guardados fora de `backend/src/uploads` e do build do frontend.
Os diretórios não são expostos por `express.static`; a API usa IDs e confere
publicação/autorização antes de ler o arquivo. A exclusão é lógica e não apaga
arquivos privados nem registros da galeria.

Por padrão, os arquivos ficam em `backend/storage/site-gallery`. Na implantação,
configure `SITE_GALLERY_STORAGE_DIR` para um volume persistente e exclusivo do
backend, com permissões de escrita restritas à aplicação e backup apropriado.
O volume deve sobreviver a builds e atualizações. Nenhum serviço externo ou
provedor pago foi introduzido. A validação é estrutural e de dimensões; o
projeto não adiciona um decodificador de imagens para recomprimir/normalizar
pixels.

## Banco e validação

Para instalação limpa, `schema.sql` aplica 027, 028, 029, 030, 031 e 032 nessa
ordem. Para upgrade, revise e aplique explicitamente 032 após confirmar as
migrations 027–031 no ambiente escolhido. A aplicação não aplica migrations
na inicialização. Execute `verificar_estrutura.sql` após instalação/upgrade.

A instalação e o verificador foram exercitados em PostgreSQL 17 temporário
isolado, loopback porta 55448, banco `sistema_petshop_teste_instalacao`. O
bootstrap histórico derivado de `pg_dump` 18.6 contém `\restrict` e
`\unrestrict`, que o cliente `psql` 17.0 não reconhece. A suíte foi executada
com uma cópia temporária do banco de scripts, retirando somente esses
metacomandos da cópia; o bootstrap histórico no repositório não foi alterado.
O teste cobriu instalação completa, preservação do registro legado sintético,
constraints, verificação estrutural e rollback dos dados de integridade.

Antes de publicar o site, a empresa ainda precisa fornecer e revisar título,
apresentação, história, missão/diferenciais, prêmios reais, fotos com texto
alternativo, contatos, endereço, horário de atendimento e link do Maps, conforme
quiser exibir. Esses dados não foram inventados ou preenchidos nesta etapa.
