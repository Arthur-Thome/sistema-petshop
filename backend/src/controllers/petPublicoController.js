const fotoStorage = require("../services/petPhotoStorage");
const path = require("path");
const pool = require("../database/connection");
const verificacao = require("../services/verificacaoClientePublicoService");

const PORTES = new Set(["pequeno", "medio", "grande", "gigante"]);
const DESCONHECIDA = "N\u00e3o sei informar";

function normalizarRaca(valor) {
  if (typeof valor !== "string") return "";
  const texto = valor.trim().replace(/\s+/g, " ");
  return /^n(?:\u00e3o|ao)\s+sei\s+informar$/i.test(texto) ? DESCONHECIDA : texto;
}

function validarPet(body) {
  const pet = body?.pet && typeof body.pet === "object" && !Array.isArray(body.pet) ? body.pet : body;
  const texto = (valor) => typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  const raca = normalizarRaca(pet?.raca);
  const porte = texto(pet?.porte).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nome = texto(pet?.nome);
  const especie = texto(pet?.especie);
  const sexo = texto(pet?.sexo).toLocaleLowerCase("pt-BR");
  const dataNascimento = texto(pet?.data_nascimento);
  const idade = pet?.idade_aproximada_anos === "" || pet?.idade_aproximada_anos == null ? null : Number(pet.idade_aproximada_anos);
  const peso = pet?.peso === "" || pet?.peso == null ? null : Number(pet.peso);
  const castrado = pet?.castrado === "" || pet?.castrado == null ? null : pet.castrado;
  const camposLongos = [pet?.alergias, pet?.necessidades_especiais, pet?.comportamento, pet?.observacoes];
  const erros = [];

  if (!nome || nome.length > 150) erros.push("Informe o nome do pet (até 150 caracteres).");
  if (!especie || especie.length > 50) erros.push("Informe uma espécie válida (até 50 caracteres).");
  if (!raca || raca.length > 100) erros.push("Informe a raça do pet (até 100 caracteres).");
  if (raca === DESCONHECIDA && !PORTES.has(porte)) erros.push("Para raça não identificada, informe o porte do animal.");
  if (porte && !PORTES.has(porte)) erros.push("Selecione um porte válido.");
  if (sexo && !["macho", "fêmea", "femea"].includes(sexo)) erros.push("Selecione um sexo válido.");
  if (dataNascimento && !dataRealNaoFutura(dataNascimento)) erros.push("Informe uma data de nascimento real e não futura.");
  if (dataNascimento && idade !== null) erros.push("Informe a data de nascimento ou a idade aproximada, não as duas.");
  if (idade !== null && (!Number.isInteger(idade) || idade < 0 || idade > 100)) erros.push("Informe uma idade aproximada válida, entre 0 e 100 anos.");
  if (peso !== null && (!Number.isFinite(peso) || peso <= 0 || peso > 1000)) erros.push("Informe um peso válido.");
  if (castrado !== null && typeof castrado !== "boolean") erros.push("A informação de castração é inválida.");
  if (camposLongos.some((valor) => valor != null && (typeof valor !== "string" || valor.trim().length > 2000))) erros.push("Alergias, necessidades, comportamento e observações aceitam até 2000 caracteres.");
  if (pet?.cor != null && (typeof pet.cor !== "string" || pet.cor.trim().length > 100)) erros.push("A cor deve possuir no máximo 100 caracteres.");

  return {
    erros,
    dados: {
      nome,
      especie,
      raca,
      sexo: sexo === "fêmea" ? "femea" : sexo || null,
      dataNascimento: dataNascimento || null,
      idade,
      peso,
      cor: texto(pet?.cor) || null,
      porte: porte || null,
      castrado,
      alergias: texto(pet?.alergias) || null,
      necessidades: texto(pet?.necessidades_especiais) || null,
      comportamento: texto(pet?.comportamento) || null,
      observacoes: texto(pet?.observacoes) || null,
    },
  };
}

function dataRealNaoFutura(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const hoje = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const hojeLocal = `${hoje.year}-${hoje.month}-${hoje.day}`;
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia && valor <= hojeLocal;
}

function caminhoFoto(req) {
  return req.file ? `/uploads/pets/${path.basename(req.file.filename)}` : null;
}

function apagarUpload(req) {
  if (req.file?._objetoPersistido) fotoStorage.removerFoto(req.file.filename).catch(() => {});
}

async function criarPetCliente(req, res) {
  const { erros, dados } = validarPet(req.body);
  if (erros.length) { apagarUpload(req); return res.status(400).json({ codigo: "DADOS_INVALIDOS", mensagem: erros[0], erros }); }
  const tutorId = Number(req.clientePublico?.tutorId);
  if (!Number.isSafeInteger(tutorId) || tutorId <= 0) { apagarUpload(req); return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Identifique-se novamente para continuar." }); }
  const client = await pool.connect();
  let tx = false;
  try {
    await client.query("BEGIN"); tx = true;
    await verificacao.limitePorIp(client, req);
    await verificacao.consumirLimite(client, verificacao.hmac(`pets:${tutorId}`), 5);
    const tutor = await client.query("SELECT id FROM tutores WHERE id = $1 AND ativo = TRUE FOR SHARE", [tutorId]);
    if (!tutor.rows.length) { await client.query("ROLLBACK"); tx = false; apagarUpload(req); return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Identifique-se novamente para continuar." }); }
    if (req.file) {
      await fotoStorage.salvarFoto(req.file.buffer, req.file.mimetype, req.file.filename);
      req.file._objetoPersistido = true;
    }
    const result = await client.query(
      `INSERT INTO pets (tutor_id, nome, especie, raca, sexo, data_nascimento, peso, cor, foto, observacoes,
         porte, castrado, alergias, necessidades_especiais, comportamento, idade_aproximada_anos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tutorId, dados.nome, dados.especie, dados.raca, dados.sexo, dados.dataNascimento, dados.peso, dados.cor,
        caminhoFoto(req), dados.observacoes, dados.porte, dados.castrado, dados.alergias, dados.necessidades, dados.comportamento, dados.idade]
    );
    const pet = result.rows[0];
    await client.query("INSERT INTO pet_tutores (pet_id, tutor_id, principal) VALUES ($1, $2, TRUE)", [pet.id, tutorId]);
    await client.query("COMMIT"); tx = false;
    return res.status(201).json({ pet });
  } catch (erro) {
    if (tx) { try { await client.query("ROLLBACK"); } catch (_) {} }
    apagarUpload(req);
    if (erro.code === "VERIFICACAO_NAO_CONFIGURADA") return res.status(503).json({ codigo: "SERVICO_INDISPONIVEL", mensagem: "A identificacao por e-mail esta temporariamente indisponivel." });
    console.error("Falha ao cadastrar pet do cliente público.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível cadastrar o pet." });
  } finally { client.release(); }
}

async function atualizarRacaPetCliente(req, res) {
  const petId = Number(req.params.id);
  if (!Number.isSafeInteger(petId) || petId <= 0) return res.status(400).json({ codigo: "PET_INVALIDO", mensagem: "Pet inválido." });
  const raca = normalizarRaca(req.body?.raca);
  if (!raca || raca.length > 100) return res.status(400).json({ codigo: "RACA_INVALIDA", mensagem: "Informe a raça do pet, com até 100 caracteres." });
  const porteEnviado = req.body?.porte;
  const porte = typeof porteEnviado === "string" ? porteEnviado.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  if (raca === DESCONHECIDA && porteEnviado !== undefined && !PORTES.has(porte)) return res.status(400).json({ codigo: "PORTE_OBRIGATORIO", mensagem: "Para raça não identificada, informe o porte do animal." });
  if (porteEnviado !== undefined && porte && !PORTES.has(porte)) return res.status(400).json({ codigo: "PORTE_INVALIDO", mensagem: "Selecione um porte válido." });
  const tutorId = Number(req.clientePublico?.tutorId);
  if (!Number.isSafeInteger(tutorId) || tutorId <= 0) return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Identifique-se novamente para continuar." });
  const client = await pool.connect(); let tx = false;
  try {
    await client.query("BEGIN"); tx = true;
    const found = await client.query(
      `SELECT p.id, p.porte FROM pets p JOIN pet_tutores pt ON pt.pet_id = p.id
       WHERE p.id = $1 AND pt.tutor_id = $2 AND p.ativo = TRUE FOR UPDATE OF p`, [petId, tutorId]
    );
    if (!found.rows.length) { await client.query("ROLLBACK"); tx = false; return res.status(404).json({ codigo: "PET_NAO_ENCONTRADO", mensagem: "Pet não encontrado." }); }
    const porteFinal = porteEnviado === undefined ? found.rows[0].porte : (porte || null);
    if (raca === DESCONHECIDA && !PORTES.has(String(porteFinal || ""))) { await client.query("ROLLBACK"); tx = false; return res.status(400).json({ codigo: "PORTE_OBRIGATORIO", mensagem: "Para raça não identificada, informe o porte do animal." }); }
    const updated = await client.query(
      `UPDATE pets SET raca = $1, porte = $2, atualizado_em = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [raca, porteFinal, petId]
    );
    await client.query("COMMIT"); tx = false;
    return res.status(200).json({ pet: updated.rows[0] });
  } catch (_) {
    if (tx) { try { await client.query("ROLLBACK"); } catch (_) {} }
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível atualizar os dados do pet." });
  } finally { client.release(); }
}

module.exports = { atualizarRacaPetCliente, criarPetCliente, dataRealNaoFutura, DESCONHECIDA, normalizarRaca, validarPet };
