const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");
const storage = require("../services/siteGalleryStorage");

const CAMPOS_TEXTO = {
  titulo_principal: 180,
  subtitulo_principal: 500,
  apresentacao: 5000,
  historia_titulo: 180,
  historia: 12000,
  missao: 3000,
  diferenciais: 5000,
  destaque_institucional: 300,
  servicos_titulo: 180,
  servicos_texto: 1000,
  galeria_titulo: 180,
  texto_rodape: 1000,
  horario_funcionamento: 1000,
  nome_comercial: 150,
  telefone: 30,
  whatsapp: 30,
  email: 255,
  cep: 8,
  logradouro: 180,
  numero: 30,
  complemento: 120,
  bairro: 120,
  cidade: 120,
  uf: 2,
  google_maps_url: 2048,
};
const CAMPOS_IMAGEM = ["imagem_principal_id", "imagem_historia_id"];
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

function textoOpcional(valor, max, nome) {
  if (valor === undefined || valor === null || valor === "") return null;
  if (typeof valor !== "string") throw new Error(`${nome} inválido.`);
  const texto = valor.trim();
  if (texto.length > max) throw new Error(`${nome} deve ter no máximo ${max} caracteres.`);
  return texto || null;
}

function idOpcional(valor, nome) {
  if (valor === undefined || valor === null || valor === "") return null;
  const id = Number(valor);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${nome} inválido.`);
  return id;
}

function validarMapsUrl(valor) {
  if (!valor) return null;
  let url;
  try { url = new URL(valor); } catch { throw new Error("Informe um link válido do Google Maps."); }
  const host = url.hostname.toLowerCase();
  const hostsPermitidos = new Set(["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"]);
  if (url.protocol !== "https:" || !hostsPermitidos.has(host) || url.username || url.password || url.port || url.hash) {
    throw new Error("O link deve ser HTTPS e direcionar ao Google Maps.");
  }
  if (["google.com", "www.google.com"].includes(host) && !url.pathname.startsWith("/maps")) {
    throw new Error("O link deve abrir uma página do Google Maps.");
  }
  return url.toString();
}

function validarConfiguracoes(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Conteúdo inválido.");
  const resultado = {};
  for (const [campo, max] of Object.entries(CAMPOS_TEXTO)) {
    resultado[campo] = textoOpcional(body[campo], max, campo);
  }
  for (const campo of CAMPOS_IMAGEM) resultado[campo] = idOpcional(body[campo], campo);
  if (resultado.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resultado.email)) throw new Error("E-mail de atendimento inválido.");
  for (const campo of ["telefone", "whatsapp"]) {
    if (resultado[campo] && !/^[+\d().\s-]+$/.test(resultado[campo])) throw new Error(`${campo} inválido.`);
    if (resultado[campo]) {
      const digitos = resultado[campo].replace(/\D/g, "");
      if (digitos.length < 10 || digitos.length > 15) throw new Error(`${campo} deve conter um número de telefone válido.`);
    }
  }
  if (resultado.cep) {
    const cep = resultado.cep.replace(/\D/g, "");
    if (cep.length !== 8) throw new Error("CEP inválido.");
    resultado.cep = cep;
  }
  if (resultado.uf) {
    resultado.uf = resultado.uf.toUpperCase();
    if (!UFS.has(resultado.uf)) throw new Error("UF inválida.");
  }
  resultado.google_maps_url = validarMapsUrl(resultado.google_maps_url);
  return resultado;
}

function validarPremiacao(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Premiação inválida.");
  const titulo = textoOpcional(body.titulo, 150, "Título");
  if (!titulo) throw new Error("Informe o título.");
  const ano = body.ano === "" || body.ano === null || body.ano === undefined ? null : Number(body.ano);
  if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > 2200)) throw new Error("Informe um ano válido.");
  const ordem = body.ordem === "" || body.ordem === undefined ? 0 : Number(body.ordem);
  if (!Number.isSafeInteger(ordem) || Math.abs(ordem) > 1000000) throw new Error("Ordem inválida.");
  if (typeof body.publicado !== "boolean") throw new Error("Situação de publicação inválida.");
  return {
    titulo,
    descricao: textoOpcional(body.descricao, 3000, "Descrição"),
    instituicao: textoOpcional(body.instituicao, 180, "Instituição"),
    ano,
    imagem_galeria_id: idOpcional(body.imagem_galeria_id, "Imagem"),
    ordem,
    publicado: body.publicado,
  };
}

function validarGaleria(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Dados da imagem inválidos.");
  const alt = textoOpcional(body.texto_alternativo, 255, "Texto alternativo");
  if (!alt) throw new Error("Informe o texto alternativo da imagem.");
  const ordem = body.ordem === "" || body.ordem === undefined ? 0 : Number(body.ordem);
  if (!Number.isSafeInteger(ordem) || Math.abs(ordem) > 1000000) throw new Error("Ordem inválida.");
  if (typeof body.publicado !== "boolean") throw new Error("Situação de publicação inválida.");
  return {
    titulo: textoOpcional(body.titulo, 150, "Título"),
    legenda: textoOpcional(body.legenda, 2000, "Legenda"),
    texto_alternativo: alt,
    categoria: textoOpcional(body.categoria, 60, "Categoria"),
    ordem,
    publicado: body.publicado,
  };
}

async function registrarAuditoria(req, acao, entidade, registroId, anterior, novo) {
  await registrarLog({
    usuarioId: req.usuario.id,
    acao,
    entidade,
    registroId: Number(registroId) || null,
    valorAnterior: anterior,
    valorNovo: novo,
    ip: req.ip,
  });
}

async function validarImagensReferenciadas(client, ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return;
  const result = await client.query(
    "SELECT id FROM site_galeria WHERE id = ANY($1::bigint[]) AND removido_em IS NULL",
    [unicos]
  );
  if (result.rows.length !== unicos.length) throw new Error("Uma das imagens selecionadas não está mais disponível.");
}

async function consultarPublico(req, res) {
  try {
    const [config, premios, imagens] = await Promise.all([
      pool.query(`
        SELECT c.titulo_principal, c.subtitulo_principal, c.apresentacao,
          c.historia_titulo, c.historia, c.missao, c.diferenciais,
          c.destaque_institucional, c.servicos_titulo, c.servicos_texto,
          c.galeria_titulo, c.texto_rodape, c.horario_funcionamento,
          c.nome_comercial, c.telefone, c.whatsapp, c.email, c.cep,
          c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf,
          c.google_maps_url,
          CASE WHEN gi.publicado AND gi.removido_em IS NULL THEN '/site-conteudo/imagens/' || gi.id::text END AS imagem_principal_url,
          CASE WHEN gh.publicado AND gh.removido_em IS NULL THEN '/site-conteudo/imagens/' || gh.id::text END AS imagem_historia_url
        FROM site_conteudo c
        LEFT JOIN site_galeria gi ON gi.id = c.imagem_principal_id
        LEFT JOIN site_galeria gh ON gh.id = c.imagem_historia_id
        WHERE c.id = 1
      `),
      pool.query(`
        SELECT p.id, p.titulo, p.descricao, p.instituicao, p.ano, p.ordem,
          CASE WHEN g.publicado AND g.removido_em IS NULL THEN '/site-conteudo/imagens/' || g.id::text END AS imagem_url,
          CASE WHEN g.publicado AND g.removido_em IS NULL THEN g.texto_alternativo END AS imagem_alt
        FROM site_premiacoes p LEFT JOIN site_galeria g ON g.id = p.imagem_galeria_id
        WHERE p.publicado = TRUE AND p.removido_em IS NULL
        ORDER BY p.ordem, p.id
      `),
      pool.query(`
        SELECT id, titulo, legenda, texto_alternativo, categoria, ordem,
          '/site-conteudo/imagens/' || id::text AS imagem_url
        FROM site_galeria
        WHERE publicado = TRUE AND removido_em IS NULL
        ORDER BY ordem, id LIMIT 100
      `),
    ]);
    return res.status(200).json({ configuracoes: config.rows[0] || {}, premios: premios.rows, galeria: imagens.rows });
  } catch (erro) {
    console.error("Erro ao consultar conteúdo público do site:", erro.message);
    return res.status(500).json({ mensagem: "Não foi possível carregar o conteúdo do site." });
  }
}

async function consultarAdmin(req, res) {
  try {
    const [config, premios, imagens] = await Promise.all([
      pool.query("SELECT * FROM site_conteudo WHERE id = 1"),
      pool.query("SELECT * FROM site_premiacoes WHERE removido_em IS NULL ORDER BY ordem, id"),
      pool.query("SELECT id, titulo, legenda, texto_alternativo, categoria, ordem, publicado, mime_type, tamanho_bytes, criado_por, atualizado_por, criado_em, atualizado_em FROM site_galeria WHERE removido_em IS NULL ORDER BY ordem, id LIMIT 100"),
    ]);
    return res.status(200).json({ configuracoes: config.rows[0] || {}, premios: premios.rows, galeria: imagens.rows });
  } catch (erro) {
    console.error("Erro ao consultar painel de conteúdo:", erro.message);
    return res.status(500).json({ mensagem: "Não foi possível carregar o painel de conteúdo." });
  }
}

async function salvarConfiguracoes(req, res) {
  let dados;
  try { dados = validarConfiguracoes(req.body); } catch (erro) { return res.status(400).json({ mensagem: erro.message }); }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await validarImagensReferenciadas(client, CAMPOS_IMAGEM.map((campo) => dados[campo]));
    const anterior = await client.query("SELECT * FROM site_conteudo WHERE id = 1 FOR UPDATE");
    const campos = Object.keys(dados);
    const placeholders = campos.map((_, index) => `$${index + 1}`).join(", ");
    const updates = campos.map((campo) => `${campo} = EXCLUDED.${campo}`).join(", ");
    const result = await client.query(
      `INSERT INTO site_conteudo (id, ${campos.join(", ")}, criado_por, atualizado_por)
       VALUES (1, ${placeholders}, $${campos.length + 1}, $${campos.length + 1})
       ON CONFLICT (id) DO UPDATE SET ${updates}, atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em = CURRENT_TIMESTAMP
       RETURNING *`,
      [...campos.map((campo) => dados[campo]), req.usuario.id]
    );
    await client.query("COMMIT");
    await registrarAuditoria(req, "CONTEUDO_SITE_ATUALIZADO", "site_conteudo", 1, anterior.rows[0] || null, dados);
    return res.status(200).json({ mensagem: "Conteúdo do site salvo.", configuracoes: result.rows[0] });
  } catch (erro) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Erro ao salvar conteúdo do site:", erro.message);
    return res.status(400).json({ mensagem: erro.message.includes("imagem") ? erro.message : "Não foi possível salvar o conteúdo do site." });
  } finally { client.release(); }
}

async function criarPremiacao(req, res) {
  let dados;
  try { dados = validarPremiacao(req.body); } catch (erro) { return res.status(400).json({ mensagem: erro.message }); }
  try {
    await validarImagensReferenciadas(pool, [dados.imagem_galeria_id]);
    const result = await pool.query(`
      INSERT INTO site_premiacoes
        (titulo, descricao, instituicao, ano, imagem_galeria_id, ordem, publicado, criado_por, atualizado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *
    `, [dados.titulo, dados.descricao, dados.instituicao, dados.ano, dados.imagem_galeria_id, dados.ordem, dados.publicado, req.usuario.id]);
    await registrarAuditoria(req, "PREMIACAO_SITE_CRIADA", "site_premiacoes", result.rows[0].id, null, dados);
    return res.status(201).json({ premiacao: result.rows[0] });
  } catch (erro) {
    console.error("Erro ao criar premiação do site:", erro.message);
    return res.status(400).json({ mensagem: erro.message.includes("imagem") ? erro.message : "Não foi possível criar a premiação." });
  }
}

async function atualizarPremiacao(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensagem: "Identificador inválido." });
  let dados;
  try { dados = validarPremiacao(req.body); } catch (erro) { return res.status(400).json({ mensagem: erro.message }); }
  try {
    await validarImagensReferenciadas(pool, [dados.imagem_galeria_id]);
    const anterior = await pool.query("SELECT * FROM site_premiacoes WHERE id = $1 AND removido_em IS NULL", [id]);
    if (!anterior.rows.length) return res.status(404).json({ mensagem: "Premiação não encontrada." });
    const result = await pool.query(`
      UPDATE site_premiacoes SET titulo=$1, descricao=$2, instituicao=$3, ano=$4,
        imagem_galeria_id=$5, ordem=$6, publicado=$7, atualizado_por=$8, atualizado_em=CURRENT_TIMESTAMP
      WHERE id=$9 AND removido_em IS NULL RETURNING *
    `, [dados.titulo, dados.descricao, dados.instituicao, dados.ano, dados.imagem_galeria_id, dados.ordem, dados.publicado, req.usuario.id, id]);
    await registrarAuditoria(req, "PREMIACAO_SITE_ATUALIZADA", "site_premiacoes", id, anterior.rows[0], dados);
    return res.status(200).json({ premiacao: result.rows[0] });
  } catch (erro) {
    console.error("Erro ao atualizar premiação do site:", erro.message);
    return res.status(400).json({ mensagem: erro.message.includes("imagem") ? erro.message : "Não foi possível atualizar a premiação." });
  }
}

async function removerPremiacao(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensagem: "Identificador inválido." });
  try {
    const result = await pool.query(`UPDATE site_premiacoes SET publicado=FALSE, removido_em=CURRENT_TIMESTAMP,
      removido_por=$1, atualizado_por=$1, atualizado_em=CURRENT_TIMESTAMP WHERE id=$2 AND removido_em IS NULL RETURNING id, titulo`, [req.usuario.id, id]);
    if (!result.rows.length) return res.status(404).json({ mensagem: "Premiação não encontrada." });
    await registrarAuditoria(req, "PREMIACAO_SITE_REMOVIDA", "site_premiacoes", id, result.rows[0], null);
    return res.status(200).json({ mensagem: "Premiação removida." });
  } catch (erro) {
    console.error("Erro ao remover premiação do site:", erro.message);
    return res.status(500).json({ mensagem: "Não foi possível remover a premiação." });
  }
}

function executarUpload(req, res, next) {
  const multer = require("multer");
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: storage.MAX_BYTES, files: 1 },
    fileFilter(_req, file, callback) {
      const extensao = file.originalname.toLowerCase().split(".").pop();
      const permitido = {
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "image/webp": ["webp"],
      };
      if (!permitido[file.mimetype] || !permitido[file.mimetype].includes(extensao)) {
        return callback(new Error("Formato não permitido. Envie JPEG, PNG ou WebP."));
      }
      return callback(null, true);
    },
  }).single("imagem");
  upload(req, res, (erro) => {
    if (!erro) return next();
    const mensagem = erro.code === "LIMIT_FILE_SIZE" ? "A imagem deve ter no máximo 8 MB." : erro.message;
    return res.status(400).json({ mensagem: mensagem || "Não foi possível receber a imagem." });
  });
}

async function enviarImagem(req, res) {
  if (!req.file) return res.status(400).json({ mensagem: "Selecione uma imagem." });
  const mime = storage.detectarMimeImagem(req.file.buffer);
  if (!mime || mime !== req.file.mimetype) return res.status(400).json({ mensagem: "O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP válida." });
  let meta;
  try { meta = validarGaleria({ ...req.body, publicado: req.body.publicado === "true" || req.body.publicado === true }); }
  catch (erro) { return res.status(400).json({ mensagem: erro.message }); }
  let arquivo;
  try {
    arquivo = await storage.salvarImagem(req.file.buffer, mime);
    const result = await pool.query(`
      INSERT INTO site_galeria (arquivo_nome, mime_type, tamanho_bytes, titulo, legenda,
        texto_alternativo, categoria, ordem, publicado, criado_por, atualizado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *
    `, [arquivo.arquivoNome, mime, arquivo.tamanhoBytes, meta.titulo, meta.legenda, meta.texto_alternativo,
      meta.categoria, meta.ordem, meta.publicado, req.usuario.id]);
    const row = result.rows[0];
    await registrarAuditoria(req, "IMAGEM_GALERIA_CRIADA", "site_galeria", row.id, null,
      { id: row.id, titulo: meta.titulo, categoria: meta.categoria, publicado: meta.publicado });
    return res.status(201).json({ imagem: imagemAdmin(row) });
  } catch (erro) {
    if (arquivo) await storage.removerImagem(arquivo.arquivoNome).catch(() => {});
    console.error("Erro ao salvar imagem da galeria:", erro.message);
    return res.status(400).json({ mensagem: erro.message.includes("alternativo") ? erro.message : "Não foi possível salvar a imagem." });
  }
}

function imagemAdmin(row) {
  return { ...row, imagem_url: `/site-conteudo/admin/galeria/${row.id}/imagem` };
}

async function atualizarImagem(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensagem: "Identificador inválido." });
  let dados;
  try { dados = validarGaleria(req.body); } catch (erro) { return res.status(400).json({ mensagem: erro.message }); }
  try {
    const anterior = await pool.query("SELECT * FROM site_galeria WHERE id=$1 AND removido_em IS NULL", [id]);
    if (!anterior.rows.length) return res.status(404).json({ mensagem: "Imagem não encontrada." });
    const result = await pool.query(`UPDATE site_galeria SET titulo=$1, legenda=$2, texto_alternativo=$3,
      categoria=$4, ordem=$5, publicado=$6, atualizado_por=$7, atualizado_em=CURRENT_TIMESTAMP
      WHERE id=$8 AND removido_em IS NULL RETURNING *`, [dados.titulo, dados.legenda, dados.texto_alternativo,
      dados.categoria, dados.ordem, dados.publicado, req.usuario.id, id]);
    await registrarAuditoria(req, "IMAGEM_GALERIA_ATUALIZADA", "site_galeria", id, anterior.rows[0], dados);
    return res.status(200).json({ imagem: imagemAdmin(result.rows[0]) });
  } catch (erro) {
    console.error("Erro ao atualizar imagem da galeria:", erro.message);
    return res.status(500).json({ mensagem: "Não foi possível atualizar a imagem." });
  }
}

async function removerImagem(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensagem: "Identificador inválido." });
  try {
    const result = await pool.query(`UPDATE site_galeria SET publicado=FALSE, removido_em=CURRENT_TIMESTAMP,
      removido_por=$1, atualizado_por=$1, atualizado_em=CURRENT_TIMESTAMP
      WHERE id=$2 AND removido_em IS NULL RETURNING id, titulo, arquivo_nome`, [req.usuario.id, id]);
    if (!result.rows.length) return res.status(404).json({ mensagem: "Imagem não encontrada." });
    await registrarAuditoria(req, "IMAGEM_GALERIA_REMOVIDA", "site_galeria", id,
      { id, titulo: result.rows[0].titulo }, { removida: true });
    // O arquivo segregado fica retido para auditoria/recuperação; o endpoint de imagem
    // exige registro publicado e ativo. Nenhum arquivo de outro módulo é removido.
    return res.status(200).json({ mensagem: "Imagem removida da galeria." });
  } catch (erro) {
    console.error("Erro ao remover imagem da galeria:", erro.message);
    return res.status(500).json({ mensagem: "Não foi possível remover a imagem." });
  }
}

async function servirImagem(req, res, exigirPublicacao) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ mensagem: "Imagem não encontrada." });
  try {
    const result = await pool.query(`SELECT arquivo_nome, mime_type FROM site_galeria
      WHERE id=$1 AND removido_em IS NULL ${exigirPublicacao ? "AND publicado=TRUE" : ""}`, [id]);
    if (!result.rows.length) return res.status(404).json({ mensagem: "Imagem não encontrada." });
    const caminho = storage.resolverCaminho(result.rows[0].arquivo_nome);
    if (!caminho) return res.status(404).json({ mensagem: "Imagem não encontrada." });
    const bytes = await require("fs/promises").readFile(caminho);
    if (storage.detectarMimeImagem(bytes) !== result.rows[0].mime_type) return res.status(404).json({ mensagem: "Imagem não encontrada." });
    res.set("Content-Type", result.rows[0].mime_type);
    res.set("Content-Length", String(bytes.length));
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.status(200).send(bytes);
  } catch (erro) {
    console.error("Erro ao servir imagem da galeria:", erro.message);
    return res.status(404).json({ mensagem: "Imagem não encontrada." });
  }
}

const servirImagemPublica = (req, res) => servirImagem(req, res, true);
const servirImagemAdmin = (req, res) => servirImagem(req, res, false);

module.exports = {
  validarMapsUrl,
  validarConfiguracoes,
  validarPremiacao,
  validarGaleria,
  consultarPublico,
  consultarAdmin,
  salvarConfiguracoes,
  criarPremiacao,
  atualizarPremiacao,
  removerPremiacao,
  executarUpload,
  enviarImagem,
  atualizarImagem,
  removerImagem,
  servirImagemPublica,
  servirImagemAdmin,
};
