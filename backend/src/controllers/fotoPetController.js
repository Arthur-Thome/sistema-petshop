const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../database/connection");
const { buscarSessaoCliente } = require("../services/sessaoClientePublicoService");
const storage = require("../services/petPhotoStorage");
const { registrarLog } = require("../services/logService");

async function identificar(token) {
  if (process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      const result = await pool.query(
        "SELECT id, ativo, versao_sessao FROM usuarios WHERE id=$1",
        [decoded.id]
      );
      const usuario = result.rows[0];
      if (usuario?.ativo && usuario.versao_sessao === decoded.versaoSessao) {
        return { tipo: "interno", id: usuario.id };
      }
    } catch (_) {
      // O token pode pertencer à sessão pública; tente esse fluxo sem expor detalhes.
    }
  }
  try {
    const sessao = await buscarSessaoCliente(token);
    if (sessao) return { tipo: "cliente", id: sessao.tutor_id };
  } catch (_) {
    // Resposta deliberadamente genérica.
  }
  return null;
}

async function servirFotoPet(req, res) {
  const nome = req.params.filename;
  if (typeof nome !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(nome) || nome.includes("..")) {
    return res.status(404).json({ mensagem: "Foto não encontrada." });
  }
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return res.status(401).json({ mensagem: "Identificação necessária." });

  try {
    const identidade = await identificar(token);
    if (!identidade) return res.status(401).json({ mensagem: "Identificação inválida ou expirada." });
    const referencia = `/uploads/pets/${nome}`;
    const parametros = [referencia];
    let filtroVinculo = "";
    if (identidade.tipo === "cliente") {
      parametros.push(identidade.id);
      filtroVinculo = "AND EXISTS (SELECT 1 FROM pet_tutores pt WHERE pt.pet_id=p.id AND pt.tutor_id=$2)";
    }
    const autorizado = await pool.query(
      `SELECT p.id FROM pets p WHERE p.foto=$1 AND p.ativo=TRUE ${filtroVinculo} LIMIT 1`,
      parametros
    );
    if (!autorizado.rows.length) return res.status(404).json({ mensagem: "Foto não encontrada." });

    const extensao = `.${nome.split(".").pop().toLowerCase()}`;
    const contentType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extensao];
    if (!contentType) return res.status(404).json({ mensagem: "Foto não encontrada." });
    const bytes = await storage.lerFoto(nome);
    res.set({ "Content-Type": contentType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    return res.status(200).send(bytes);
  } catch (_) {
    return res.status(500).json({ mensagem: "Não foi possível carregar a foto." });
  }
}

async function criarUploadDireto(req, res) {
  const petId = Number(req.params.id);
  const { mime_type: mimeType, tamanho_bytes: tamanhoBytes } = req.body || {};
  const extensoes = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  if (!Number.isSafeInteger(petId) || petId < 1 || !extensoes[mimeType] || !Number.isInteger(tamanhoBytes) || tamanhoBytes < 1 || tamanhoBytes > storage.MAX_BYTES) {
    return res.status(400).json({ mensagem: "Foto invalida ou acima do limite de 5 MB." });
  }
  try { if (storage.modoArmazenamento() === "local") return res.status(200).json({ modo: "local" }); }
  catch (_) { return res.status(503).json({ mensagem: "Armazenamento temporariamente indisponivel." }); }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) return res.status(503).json({ mensagem: "Upload direto temporariamente indisponivel." });
  try {
    const pet = await pool.query("SELECT id FROM pets WHERE id=$1", [petId]);
    if (!pet.rows.length) return res.status(404).json({ mensagem: "Pet nao encontrado." });
    const uploadId = crypto.randomUUID();
    const nomeFinal = `${crypto.randomUUID()}${extensoes[mimeType]}`;
    const upload = storage.prepararUploadDireto(uploadId, nomeFinal, mimeType);
    await pool.query(`
      INSERT INTO object_upload_intents (upload_id, resource_kind, owner_user_id, object_key, cleanup_after)
      VALUES ($1, 'PET_PHOTO', $2, $3, CURRENT_TIMESTAMP + INTERVAL '24 hours')
    `, [uploadId, req.usuario.id, upload.key]);
    const uploadToken = jwt.sign({ finalidade: "FOTO_PET_UPLOAD", usuario_id: req.usuario.id, pet_id: petId,
      upload_id: uploadId, chave_temporaria: upload.key, nome_final: nomeFinal, mime_type: mimeType,
      tamanho_bytes: tamanhoBytes }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "5m" });
    return res.status(200).json({ modo: "s3", url: upload.url, headers: upload.headers, uploadToken, expira_segundos: 300 });
  } catch (_) {
    return res.status(503).json({ mensagem: "Nao foi possivel autorizar o upload direto." });
  }
}

async function finalizarUploadDireto(req, res) {
  let token;
  try { token = jwt.verify(req.body?.uploadToken, process.env.JWT_SECRET, { algorithms: ["HS256"] }); }
  catch (_) { return res.status(401).json({ mensagem: "A autorizacao do upload expirou. Inicie o envio novamente." }); }
  const petId = Number(req.params.id);
  if (token.finalidade !== "FOTO_PET_UPLOAD" || Number(token.usuario_id) !== Number(req.usuario.id) || Number(token.pet_id) !== petId) {
    return res.status(403).json({ mensagem: "Autorizacao de upload invalida." });
  }
  const referencia = `/uploads/pets/${token.nome_final}`;
  const jaFinalizado = await pool.query("SELECT id, foto FROM pets WHERE id=$1", [petId]);
  if (!jaFinalizado.rows.length) return res.status(404).json({ mensagem: "Pet nao encontrado." });
  if (jaFinalizado.rows[0].foto === referencia) {
    await pool.query("UPDATE object_upload_intents SET finalized_at=COALESCE(finalized_at,CURRENT_TIMESTAMP) WHERE upload_id=$1 AND owner_user_id=$2 AND resource_kind='PET_PHOTO' AND object_key=$3", [token.upload_id, req.usuario.id, token.chave_temporaria]);
    return res.status(200).json({ mensagem: "Foto atualizada com sucesso." });
  }
  const intent = await pool.query(`SELECT upload_id FROM object_upload_intents
    WHERE upload_id=$1 AND owner_user_id=$2 AND resource_kind='PET_PHOTO' AND object_key=$3
      AND finalized_at IS NULL AND cleaned_at IS NULL AND cleanup_claimed_at IS NULL AND cleanup_after > CURRENT_TIMESTAMP`,
  [token.upload_id, req.usuario.id, token.chave_temporaria]);
  if (!intent.rows.length) return res.status(410).json({ mensagem: "Este upload expirou. Inicie o envio novamente." });
  let arquivoPromovido = false;
  try {
    const objeto = await storage.examinarUploadDireto(token.chave_temporaria);
    if (!objeto || objeto.tamanhoBytes !== token.tamanho_bytes || objeto.tamanhoBytes > storage.MAX_BYTES) {
      return res.status(400).json({ mensagem: "O arquivo enviado nao corresponde ao tamanho autorizado." });
    }
    const bytes = await storage.promoverUploadDireto(token.chave_temporaria, token.nome_final, token.mime_type, objeto.tamanhoBytes);
    arquivoPromovido = true;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const atual = await client.query("SELECT id, foto FROM pets WHERE id=$1 FOR UPDATE", [petId]);
      if (!atual.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ mensagem: "Pet nao encontrado." }); }
      if (atual.rows[0].foto !== referencia) {
        await client.query("UPDATE pets SET foto=$1, atualizado_em=CURRENT_TIMESTAMP WHERE id=$2", [referencia, petId]);
        const atualizado = await client.query(`UPDATE object_upload_intents SET finalized_at=CURRENT_TIMESTAMP
          WHERE upload_id=$1 AND owner_user_id=$2 AND resource_kind='PET_PHOTO' AND object_key=$3
            AND finalized_at IS NULL AND cleaned_at IS NULL AND cleanup_claimed_at IS NULL`, [token.upload_id, req.usuario.id, token.chave_temporaria]);
        if (atualizado.rowCount !== 1) throw new Error("Autorizacao de upload nao esta mais ativa.");
        await client.query("COMMIT");
        try { await registrarLog({ usuarioId: req.usuario.id, acao: "ALTERAR_FOTO_PET", entidade: "pets", registroId: petId, valorAnterior: { foto: atual.rows[0].foto }, valorNovo: { foto: referencia }, ip: req.ip }); } catch (_) {}
      } else await client.query("COMMIT");
    } catch (erro) { await client.query("ROLLBACK").catch(() => {}); throw erro; }
    finally { client.release(); }
    await storage.removerUploadDireto(token.chave_temporaria).catch(() => {});
    return res.status(200).json({ mensagem: "Foto atualizada com sucesso." });
  } catch (_) {
    // Uma imagem permanente sem referência é removida apenas quando este fluxo a criou.
    if (arquivoPromovido) await storage.removerFoto(token.nome_final).catch(() => {});
    return res.status(502).json({ mensagem: "Nao foi possivel validar e registrar a foto." });
  }
}

module.exports = { servirFotoPet, criarUploadDireto, finalizarUploadDireto };
