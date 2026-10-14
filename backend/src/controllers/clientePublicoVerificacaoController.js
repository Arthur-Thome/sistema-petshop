const crypto = require("crypto");
const pool = require("../database/connection");
const { criarSessaoCliente } = require("../services/sessaoClientePublicoService");
const { enviarCodigoVerificacao } = require("../services/emailService");
const { validarCPF, formatarCPF } = require("../utils/cpf");
const v = require("../services/verificacaoClientePublicoService");

const RESPOSTA_NEUTRA = "Se os dados corresponderem a um cadastro elegivel, enviaremos um codigo ao e-mail informado. Se nao tiver acesso ao e-mail cadastrado, procure a equipe Amores Pet para atendimento assistido.";

function respostaErro(res, error, fallback) {
  if (error.status === 429) {
    res.set("Retry-After", String(error.retryAfter));
    return res.status(429).json({ codigo: "LIMITE_TEMPORARIO", mensagem: "Aguarde antes de tentar novamente.", tentar_novamente_em: error.retryAfter });
  }
  if (error.code === "VERIFICACAO_NAO_CONFIGURADA") {
    return res.status(503).json({ codigo: "SERVICO_INDISPONIVEL", mensagem: "A identificacao por e-mail esta temporariamente indisponivel." });
  }
  console.error(fallback);
  return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Nao foi possivel concluir a operacao." });
}

async function solicitar(req, res, contexto) {
  const cpf = v.cpfNormalizado(contexto === "CADASTRO" ? req.body?.tutor?.cpf : req.body?.cpf);
  const emailInformado = contexto === "CADASTRO" ? v.emailNormalizado(req.body?.tutor?.email) : "";
  if (!cpf || !validarCPF(cpf) || (contexto === "CADASTRO" && !emailInformado)) {
    return res.status(400).json({ codigo: "DADOS_INVALIDOS", mensagem: "Confira o CPF e o e-mail informado." });
  }

  let client;
  let tx = false;
  let challenge;
  let code;
  let tutorId = null;
  let destino = null;
  let podeEnviar = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN"); tx = true;
    await v.limitePorIp(client, req);
    const cpfHash = v.hmac(`cpf:${cpf}`);
    await v.advisoryLock(client, `desafio:${contexto}:${cpfHash}`);
    await v.consumirLimite(client, v.hmac(`identidade:${cpfHash}`), 3, 60_000);

    if (contexto === "IDENTIFICACAO") {
      const found = await client.query(
        `SELECT id, email, ativo FROM tutores WHERE cpf = $1 LIMIT 1 FOR UPDATE`, [formatarCPF(cpf)]
      );
      if (found.rows[0]?.ativo && found.rows[0].email) {
        const linked = await client.query("SELECT COUNT(*)::int AS quantidade FROM tutores WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) AND ativo = TRUE", [found.rows[0].email]);
        if (Number(linked.rows[0].quantidade) === 1) {
          const candidate = v.emailNormalizado(found.rows[0].email);
          if (candidate) { tutorId = found.rows[0].id; destino = candidate; podeEnviar = true; }
        }
      }
    } else {
      const existing = await client.query("SELECT id FROM tutores WHERE cpf = $1 LIMIT 1", [formatarCPF(cpf)]);
      if (!existing.rows.length) { destino = emailInformado; podeEnviar = true; }
    }

    if (podeEnviar) {
      await v.advisoryLock(client, `email:${v.hmac(`email:${destino}`)}`);
      const shared = await client.query("SELECT COUNT(*)::int AS quantidade FROM tutores WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) AND ativo = TRUE", [destino]);
      // Contato compartilhado pode cadastrar um CPF novo, mas nunca autentica
      // tutor existente: essa identificacao exige e-mail exclusivo.
      if (contexto === "IDENTIFICACAO" && Number(shared.rows[0].quantidade) !== 1) podeEnviar = false;
    }

    await client.query("UPDATE verificacoes_cliente_publico SET confirmado_em = CURRENT_TIMESTAMP WHERE cpf_hash = $1 AND contexto = $2 AND confirmado_em IS NULL", [cpfHash, contexto]);
    challenge = v.tokenAleatorio();
    code = v.codigoAleatorio();
    const codeDigest = v.codigoHash(challenge, code);
    await client.query(
      `INSERT INTO verificacoes_cliente_publico
       (tutor_id, canal, destino_normalizado, codigo_hash, expira_em, contexto, cpf_hash, desafio_hash, enviado_em)
       VALUES ($1, 'EMAIL', $2, $3, CURRENT_TIMESTAMP + INTERVAL '10 minutes', $4, $5, $6,
         CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [tutorId, podeEnviar ? destino : null, podeEnviar ? codeDigest : v.hmac(`decoy:${challenge}`), contexto, cpfHash, v.hmac(`desafio:${challenge}`), podeEnviar]
    );
    await client.query("COMMIT"); tx = false;

    if (podeEnviar) {
      try { await enviarCodigoVerificacao({ para: destino, codigo: code, contexto }); }
      catch (_) {
        await pool.query("UPDATE verificacoes_cliente_publico SET confirmado_em = CURRENT_TIMESTAMP WHERE desafio_hash = $1 AND confirmado_em IS NULL", [v.hmac(`desafio:${challenge}`)]);
        return res.status(503).json({ codigo: "ENVIO_INDISPONIVEL", mensagem: "Nao foi possivel enviar o e-mail agora. Tente novamente mais tarde." });
      }
    }
    return res.status(202).json({ encontrado: true, desafio: challenge, mensagem: RESPOSTA_NEUTRA, expira_em: new Date(Date.now() + v.DURACAO_MS).toISOString() });
  } catch (error) {
    if (client && tx) { try { await client.query("ROLLBACK"); } catch (_) {} }
    return respostaErro(res, error, "Falha ao solicitar codigo de verificacao.");
  } finally { if (client) client.release(); }
}

async function solicitarIdentificacao(req, res) { return solicitar(req, res, "IDENTIFICACAO"); }
async function solicitarCadastro(req, res) { return solicitar(req, res, "CADASTRO"); }

function dadosCadastroValidos(body) {
  const tutor = body?.tutor;
  const pet = body?.pet;
  if (!tutor || typeof tutor !== "object" || Array.isArray(tutor) || !pet || typeof pet !== "object" || Array.isArray(pet)) return false;
  const texto = (value) => typeof value === "string" ? value.trim() : "";
  const nome = texto(tutor.nome); const telefone = texto(tutor.telefone); const cep = texto(tutor.cep);
  const endereco = texto(tutor.endereco); const numero = texto(tutor.numero); const bairro = texto(tutor.bairro);
  const cidade = texto(tutor.cidade); const estado = texto(tutor.estado).toUpperCase();
  const email = v.emailNormalizado(tutor.email);
  const petNome = texto(pet.nome); const especie = texto(pet.especie); const porte = texto(pet.porte).toLowerCase();
  const raca = texto(pet.raca);
  const idade = pet.idade_aproximada_anos === undefined || pet.idade_aproximada_anos === null || pet.idade_aproximada_anos === ""
    ? null : Number(pet.idade_aproximada_anos);
  const peso = pet.peso === undefined || pet.peso === null || pet.peso === "" ? null : Number(pet.peso);
  const textosLongosValidos = [pet.alergias, pet.necessidades_especiais, pet.comportamento, pet.observacoes]
    .every((value) => value === undefined || value === null || (typeof value === "string" && value.trim().length <= 2000));
  const racaDesconhecida = raca.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "nao sei informar";
  const ufs = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
  return Boolean(
    nome && nome.length <= 150 && /^\d{10,11}$/.test(telefone.replace(/\D/g, "")) && email &&
    /^\d{5}-?\d{3}$/.test(cep) &&
    endereco && endereco.length <= 255 && numero && numero.length <= 20 && texto(tutor.complemento).length <= 100 &&
    bairro && bairro.length <= 100 && cidade && cidade.length <= 100 && ufs.has(estado) &&
    petNome && petNome.length <= 150 && especie && especie.length <= 50 &&
    raca.length > 0 && raca.length <= 100 &&
    (!porte || ["pequeno", "medio", "grande", "gigante"].includes(porte)) &&
    (!racaDesconhecida || ["pequeno", "medio", "grande", "gigante"].includes(porte)) &&
    (!pet.sexo || ["macho", "femea"].includes(texto(pet.sexo).toLowerCase())) &&
    (!pet.data_nascimento || dataNascimentoValida(texto(pet.data_nascimento))) &&
    !(pet.data_nascimento && idade !== null) &&
    (idade === null || (Number.isInteger(idade) && idade >= 0 && idade <= 100)) &&
    (peso === null || (Number.isFinite(peso) && peso > 0 && peso <= 1000)) &&
    (pet.castrado === undefined || pet.castrado === null || typeof pet.castrado === "boolean") &&
    textosLongosValidos
  );
}

function dataNascimentoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const hoje = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const hojeLocal = `${hoje.year}-${hoje.month}-${hoje.day}`;
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia && valor <= hojeLocal;
}

async function solicitarCadastroValidado(req, res) {
  if (!dadosCadastroValidos(req.body)) return res.status(400).json({ codigo: "DADOS_INVALIDOS", mensagem: "Confira os dados obrigatorios do tutor e do pet." });
  return solicitarCadastro(req, res);
}

async function confirmar(req, res, contexto) {
  const challenge = typeof req.body?.desafio === "string" ? req.body.desafio : "";
  const code = typeof req.body?.codigo === "string" ? req.body.codigo.trim() : "";
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(challenge) || !/^\d{6}$/.test(code)) return res.status(400).json({ codigo: "CODIGO_INVALIDO", mensagem: "O codigo e invalido ou expirou." });
  let client; let tx = false;
  try {
    client = await pool.connect(); await client.query("BEGIN"); tx = true;
    await v.limitePorIp(client, req);
    const result = await client.query(
      `SELECT v.*, t.nome AS tutor_nome, t.ativo AS tutor_ativo, t.email AS tutor_email
       FROM verificacoes_cliente_publico v LEFT JOIN tutores t ON t.id = v.tutor_id
       WHERE v.desafio_hash = $1 AND v.contexto = $2 FOR UPDATE OF v`,
      [v.hmac(`desafio:${challenge}`), contexto]
    );
    const row = result.rows[0];
    if (!row || !row.enviado_em || row.confirmado_em || new Date(row.expira_em).getTime() <= Date.now() || Number(row.tentativas) >= 5) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(400).json({ codigo: "CODIGO_INVALIDO", mensagem: "O codigo e invalido ou expirou." });
    }
    if (!v.compararHmac(`codigo:${challenge}:${code}`, row.codigo_hash)) {
      await client.query("UPDATE verificacoes_cliente_publico SET tentativas = tentativas + 1, confirmado_em = CASE WHEN tentativas + 1 >= 5 THEN CURRENT_TIMESTAMP ELSE confirmado_em END WHERE id = $1", [row.id]);
      await client.query("COMMIT"); tx = false;
      return res.status(400).json({ codigo: "CODIGO_INVALIDO", mensagem: "O codigo e invalido." });
    }
    if (contexto === "IDENTIFICACAO") {
      const valid = row.tutor_ativo && v.emailNormalizado(row.tutor_email) === row.destino_normalizado;
      if (!valid) { await client.query("ROLLBACK"); tx = false; return res.status(400).json({ codigo: "CODIGO_INVALIDO", mensagem: "O codigo e invalido ou expirou." }); }
      const shared = await client.query("SELECT COUNT(*)::int AS quantidade FROM tutores WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1)) AND ativo = TRUE", [row.destino_normalizado]);
      if (Number(shared.rows[0].quantidade) !== 1) { await client.query("ROLLBACK"); tx = false; return res.status(403).json({ codigo: "CONTATO_COMPARTILHADO", mensagem: "Para proteger os cadastros, fale com a equipe Amores Pet para confirmar sua identidade." }); }
      await client.query("UPDATE verificacoes_cliente_publico SET confirmado_em = CURRENT_TIMESTAMP WHERE id = $1", [row.id]);
      const { token, sessao } = await criarSessaoCliente(row.tutor_id, client);
      await client.query("COMMIT"); tx = false;
      return res.status(200).json({ token, expira_em: sessao.expira_em, tutor: { id: row.tutor_id, nome: row.tutor_nome } });
    }
    const proof = v.tokenAleatorio();
    await client.query("UPDATE verificacoes_cliente_publico SET confirmado_em = CURRENT_TIMESTAMP, prova_cadastro_hash = $2, prova_expira_em = CURRENT_TIMESTAMP + INTERVAL '10 minutes' WHERE id = $1", [row.id, v.hmac(`prova:${proof}`)]);
    await client.query("COMMIT"); tx = false;
    return res.status(200).json({ prova_cadastro: proof, expira_em: new Date(Date.now() + v.DURACAO_MS).toISOString(), mensagem: "E-mail verificado. Conclua o cadastro para prosseguir ao agendamento." });
  } catch (error) {
    if (client && tx) { try { await client.query("ROLLBACK"); } catch (_) {} }
    return respostaErro(res, error, "Falha ao confirmar codigo.");
  } finally { if (client) client.release(); }
}

async function confirmarIdentificacao(req, res) { return confirmar(req, res, "IDENTIFICACAO"); }
async function confirmarCadastro(req, res) { return confirmar(req, res, "CADASTRO"); }

module.exports = { solicitarIdentificacao, solicitarCadastro: solicitarCadastroValidado, confirmarIdentificacao, confirmarCadastro };
