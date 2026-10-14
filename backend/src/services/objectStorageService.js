const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

function modoArmazenamento(env = process.env) {
  const modo = String(env.FILE_STORAGE_MODE || "local").toLowerCase();
  if (!['local', 's3'].includes(modo)) throw new Error("FILE_STORAGE_MODE deve ser local ou s3.");
  return modo;
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function chaveAssinatura(secret, data, region) {
  const dataKey = hmac(`AWS4${secret}`, data);
  const regionKey = crypto.createHmac("sha256", dataKey).update(region).digest();
  const serviceKey = crypto.createHmac("sha256", regionKey).update("s3").digest();
  return crypto.createHmac("sha256", serviceKey).update("aws4_request").digest();
}

function configuracaoS3(env = process.env) {
  const config = {
    endpoint: env.AWS_ENDPOINT_URL_S3,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
  };
  if (!config.endpoint || !config.region || !config.accessKeyId || !config.secretAccessKey) {
    const erro = new Error("Armazenamento S3 nao configurado.");
    erro.code = "ARMAZENAMENTO_NAO_CONFIGURADO";
    throw erro;
  }
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
    throw new Error("Endpoint S3 remoto precisa usar HTTPS.");
  }
  config.endpoint = endpoint;
  return config;
}

function urlObjeto(config, bucket, key) {
  if (config.endpoint.search || config.endpoint.hash) throw new Error("Endpoint S3 nao pode conter query ou fragmento.");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket || "") ||
      typeof key !== "string" || !/^[A-Za-z0-9._/-]{1,240}$/.test(key) || key.split("/").some((parte) => !parte || parte === "." || parte === "..")) {
    throw new Error("Identificador de objeto invalido.");
  }
  const url = new URL(config.endpoint.toString());
  const base = url.pathname.replace(/\/$/, "");
  url.pathname = `${base}/${bucket}/${key}`;
  return url;
}

function headersAssinados(config, method, url, body, contentType, now = new Date()) {
  const data = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = data.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(body || Buffer.alloc(0)).digest("hex");
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": data,
  };
  if (contentType) headers["content-type"] = contentType;
  if (config.sessionToken) headers["x-amz-security-token"] = config.sessionToken;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((key) => `${key}:${String(headers[key]).trim()}\n`).join("");
  const canonicalUri = url.pathname.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
  const canonical = [method, canonicalUri, url.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dia}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", data, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signature = crypto.createHmac("sha256", chaveAssinatura(config.secretAccessKey, dia, config.region)).update(stringToSign).digest("hex");
  const output = { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
  return output;
}

async function requisitarS3({ method, bucket, key, body, contentType, env, fetch = globalThis.fetch, timeoutMs }) {
  const config = configuracaoS3(env);
  const url = urlObjeto(config, bucket, key);
  let response;
  try {
    const opcoes = { method, headers: headersAssinados(config, method, url, body, contentType), body: method === "GET" || method === "DELETE" ? undefined : body };
    if (timeoutMs !== undefined) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error("Timeout S3 invalido.");
      opcoes.signal = AbortSignal.timeout(timeoutMs);
    }
    response = await fetch(url, opcoes);
  } catch (_) {
    const erro = new Error("Nao foi possivel acessar o armazenamento de objetos.");
    erro.code = "ARMAZENAMENTO_INDISPONIVEL";
    throw erro;
  }
  if (!response.ok && !(method === "DELETE" && response.status === 404)) {
    const erro = new Error("Operacao recusada pelo armazenamento de objetos.");
    erro.code = "ARMAZENAMENTO_ERRO_REMOTO";
    throw erro;
  }
  if (method === "GET") return Buffer.from(await response.arrayBuffer());
  if (method === "HEAD") return { tamanhoBytes: Number(response.headers.get("content-length") || 0), contentType: response.headers.get("content-type") || null };
  return true;
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function presignPut({ bucket, key, contentType, expiresSeconds = 300, env = process.env, now = new Date() }) {
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 600) throw new Error("Validade de upload invalida.");
  const config = configuracaoS3(env);
  const url = urlObjeto(config, bucket, key);
  const data = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = data.slice(0, 8);
  const scope = `${dia}/${config.region}/s3/aws4_request`;
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": data,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "content-type;host",
  };
  if (config.sessionToken) params["X-Amz-Security-Token"] = config.sessionToken;
  const canonicalQuery = Object.entries(params)
    .map(([name, value]) => [awsEncode(name), awsEncode(value)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const canonicalUri = url.pathname.split("/").map((part) => awsEncode(decodeURIComponent(part))).join("/");
  const canonical = ["PUT", canonicalUri, canonicalQuery, `content-type:${contentType.trim()}\nhost:${url.host}\n`, "content-type;host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", data, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const signature = crypto.createHmac("sha256", chaveAssinatura(config.secretAccessKey, dia, config.region)).update(stringToSign).digest("hex");
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

async function examinarObjeto({ bucket, key, env = process.env }) {
  return requisitarS3({ method: "HEAD", bucket, key, env });
}

async function gravar({ bucket, key, buffer, contentType, localPath, env = process.env }) {
  if (modoArmazenamento(env) === "s3") return requisitarS3({ method: "PUT", bucket, key, body: buffer, contentType, env });
  if (env.VERCEL === "1") {
    const erro = new Error("Armazenamento local nao e persistente neste ambiente.");
    erro.code = "ARMAZENAMENTO_LOCAL_EPHEMERO";
    throw erro;
  }
  const destino = path.resolve(localPath);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, buffer, { flag: "wx", mode: 0o640 });
  return true;
}

async function ler({ bucket, key, localPath, env = process.env }) {
  if (modoArmazenamento(env) === "s3") return requisitarS3({ method: "GET", bucket, key, env });
  if (env.VERCEL === "1") {
    const erro = new Error("Armazenamento local nao esta disponivel neste ambiente.");
    erro.code = "ARMAZENAMENTO_LOCAL_EPHEMERO";
    throw erro;
  }
  return fs.readFile(path.resolve(localPath));
}

async function remover({ bucket, key, localPath, env = process.env, timeoutMs }) {
  if (modoArmazenamento(env) === "s3") return requisitarS3({ method: "DELETE", bucket, key, env, timeoutMs });
  if (env.VERCEL === "1") {
    const erro = new Error("Armazenamento local nao e persistente neste ambiente.");
    erro.code = "ARMAZENAMENTO_LOCAL_EPHEMERO";
    throw erro;
  }
  try { await fs.unlink(path.resolve(localPath)); return true; }
  catch (erro) { if (erro.code === "ENOENT") return false; throw erro; }
}

module.exports = { modoArmazenamento, configuracaoS3, urlObjeto, headersAssinados, requisitarS3, presignPut, examinarObjeto, gravar, ler, remover };
