const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../database/connection");
const { registrarLogObrigatorio } = require("./logService");

const OPERACOES = Object.freeze({
  GALERIA_CRIAR: { entity: "site_galeria", selfAuthorize: false },
  GALERIA_ATUALIZAR: { entity: "site_galeria", selfAuthorize: false },
  GALERIA_REMOVER: { entity: "site_galeria", selfAuthorize: false },
  PERMANENT_DELETE: { selfAuthorize: true },
});
const ENTIDADES_EXCLUIVEIS = new Set([
  "tutores", "pets", "produtos", "servicos", "usuarios",
  "site_galeria", "site_premiacoes", "agenda_publica_horarios",
]);

function serializarEstavel(valor) {
  if (Array.isArray(valor)) return `[${valor.map(serializarEstavel).join(",")}]`;
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor).sort().map(chave => `${JSON.stringify(chave)}:${serializarEstavel(valor[chave])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

function hashContexto(contexto) {
  return crypto.createHash("sha256").update(serializarEstavel(contexto ?? null)).digest("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validarContexto(contexto) {
  if (contexto === undefined) return null;
  const json = JSON.stringify(contexto);
  if (json.length > 12000) throw new Error("O contexto da autorização excede o limite permitido.");
  return contexto;
}

async function emitirAutorizacao({
  requesterId,
  authorizerId,
  password,
  operation,
  entity,
  resourceId = null,
  context = null,
  ip = null,
}, executor = pool) {
  const regra = OPERACOES[operation];
  if (!regra) throw Object.assign(new Error("Operação não autorizada por este mecanismo."), { status: 400 });
  if (regra.entity && entity !== regra.entity) throw Object.assign(new Error("Entidade incompatível com a autorização."), { status: 400 });
  if (!Number.isSafeInteger(Number(requesterId)) || !Number.isSafeInteger(Number(authorizerId)) || !password) {
    throw Object.assign(new Error("Dados de autorização incompletos."), { status: 400 });
  }
  if (!regra.selfAuthorize && Number(requesterId) === Number(authorizerId)) {
    throw Object.assign(new Error("O solicitante não pode autorizar a própria operação."), { status: 403 });
  }
  const contexto = validarContexto(context);
  if (operation === "PERMANENT_DELETE") {
    const motivo = typeof contexto?.motivo === "string" ? contexto.motivo.trim() : "";
    if (!ENTIDADES_EXCLUIVEIS.has(entity) || !resourceId || motivo.length < 10 || motivo.length > 500
      || contexto?.confirmacao !== `EXCLUIR ${resourceId}` || contexto?.confirmacao_irreversivel !== true) {
      throw Object.assign(new Error("A confirmação reforçada da exclusão está incompleta ou incompatível."), { status: 400 });
    }
  }
  const client = executor === pool ? await executor.connect() : executor;
  const ownsClient = executor === pool;
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  try {
    await client.query("BEGIN");
    const users = await client.query(
      `SELECT id, perfil, senha_hash
         FROM usuarios
        WHERE id = ANY($1::integer[]) AND ativo = TRUE
        ORDER BY id FOR UPDATE`,
      [[...new Set([Number(requesterId), Number(authorizerId)])]]
    );
    const byId = new Map(users.rows.map(user => [Number(user.id), user]));
    const requester = byId.get(Number(requesterId));
    const authorizer = byId.get(Number(authorizerId));
    if (!requester || !authorizer) throw Object.assign(new Error("Solicitante ou autorizador inativo ou não encontrado."), { status: 403 });

    if (operation === "PERMANENT_DELETE") {
      if (requester.perfil !== "super_administrador" || Number(requesterId) !== Number(authorizerId)) {
        throw Object.assign(new Error("Somente o Super Administrador pode autorizar esta exclusão com a própria senha."), { status: 403 });
      }
    } else {
      if (!["gerente", "funcionario"].includes(requester.perfil)) {
        throw Object.assign(new Error("Esta operação exige um solicitante Gerente ou Funcionário."), { status: 403 });
      }
      if (!["administrador", "super_administrador"].includes(authorizer.perfil)) {
        throw Object.assign(new Error("O autorizador precisa ser Administrador ou Super Administrador ativo."), { status: 403 });
      }
    }

    if (!(await bcrypt.compare(password, authorizer.senha_hash))) {
      throw Object.assign(new Error("Senha do autorizador incorreta."), { status: 401 });
    }

    await client.query(
      `INSERT INTO operation_authorizations
        (token_hash, requester_user_id, authorizer_user_id, operation, entity, resource_id, context_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [tokenHash, requesterId, authorizerId, operation, entity || null, resourceId == null ? null : String(resourceId), hashContexto(contexto)]
    );
    await registrarLogObrigatorio({
      usuarioId: Number(requesterId),
      acao: "AUTORIZACAO_OPERACAO_EMITIDA",
      entidade: entity || "operacao",
      registroId: Number.isSafeInteger(Number(resourceId)) ? Number(resourceId) : null,
      valorNovo: { solicitante_id: Number(requesterId), autorizador_id: Number(authorizerId), operacao: operation },
      ip,
    }, client);
    await client.query("COMMIT");
    return { token, expira_em_segundos: 300 };
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    if (ownsClient) client.release();
  }
}

async function consumirAutorizacao({ token, requesterId, operation, entity, resourceId = null, context, ip = null }, executor = pool) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) {
    throw Object.assign(new Error("Autorização da operação ausente ou inválida."), { status: 401 });
  }
  const client = executor === pool ? await executor.connect() : executor;
  const ownsClient = executor === pool;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, requester_user_id, authorizer_user_id, operation, entity, resource_id, context_hash,
              consumed_at, expires_at > CURRENT_TIMESTAMP AS ativa
         FROM operation_authorizations
        WHERE token_hash = $1
        FOR UPDATE`,
      [hashToken(token)]
    );
    const grant = result.rows[0];
    if (!grant || Number(grant.requester_user_id) !== Number(requesterId)
      || grant.operation !== operation || grant.entity !== (entity || null)
      || String(grant.resource_id ?? "") !== String(resourceId ?? "")
      || grant.context_hash !== hashContexto(validarContexto(context))) {
      throw Object.assign(new Error("A autorização não corresponde a esta operação."), { status: 403 });
    }
    if (!grant.ativa || grant.consumed_at) {
      throw Object.assign(new Error("A autorização expirou ou já foi utilizada."), { status: 409 });
    }
    const updated = await client.query(
      `UPDATE operation_authorizations SET consumed_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        RETURNING id`,
      [grant.id]
    );
    if (updated.rowCount !== 1) throw Object.assign(new Error("A autorização expirou ou já foi utilizada."), { status: 409 });
    await registrarLogObrigatorio({
      usuarioId: Number(requesterId),
      acao: "AUTORIZACAO_OPERACAO_CONSUMIDA",
      entidade: entity || "operacao",
      registroId: Number.isSafeInteger(Number(resourceId)) ? Number(resourceId) : null,
      valorNovo: { solicitante_id: Number(requesterId), autorizador_id: Number(grant.authorizer_user_id), operacao: operation },
      ip,
    }, client);
    await client.query("COMMIT");
    return { requesterId: Number(requesterId), authorizerId: Number(grant.authorizer_user_id), operation };
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    if (ownsClient) client.release();
  }
}

module.exports = { emitirAutorizacao, consumirAutorizacao, hashContexto, serializarEstavel };
