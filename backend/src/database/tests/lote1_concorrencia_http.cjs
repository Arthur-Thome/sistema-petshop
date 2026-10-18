// Integração HTTP real para estoque e Agenda Pública, somente em PostgreSQL temporário.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!["--host", "--port", "--user", "--database", "--data-directory", "--pg-ctl"].includes(key) || !process.argv[i + 1]) {
    throw new Error("Informe os argumentos explicitos do PostgreSQL temporario.");
  }
  args[key.slice(2)] = process.argv[i + 1];
}
for (const key of ["host", "port", "user", "database", "data-directory", "pg-ctl"]) {
  assert.ok(args[key], `Falta --${key}`);
}
assert.equal(args.host, "127.0.0.1");
assert.ok(Number(args.port) > 1024 && ![3001, 5432, 55432].includes(Number(args.port)));
assert.match(args.database, /^sistema_petshop_teste_[a-z0-9_]+$/);
assert.notEqual(args.database, "sistema_petshop");
assert.notEqual(args.database, "amores_pet_homologacao");
assert.ok(path.isAbsolute(args["data-directory"]) && path.isAbsolute(args["pg-ctl"]));
const clusterRelativo = path.relative(os.tmpdir(), path.resolve(args["data-directory"]));
assert.ok(!clusterRelativo.startsWith("..") && !path.isAbsolute(clusterRelativo));
assert.match(clusterRelativo, /^amores-pet-test-[a-f0-9]{32}[\\/]data$/i);
assert.equal(fs.existsSync(args["pg-ctl"]), true);
const statusCluster = spawnSync(args["pg-ctl"], ["-D", args["data-directory"], "status"], {
  encoding: "utf8", windowsHide: true, timeout: 5000,
});
assert.equal(statusCluster.status, 0, "pg_ctl nao confirmou o cluster temporario informado.");
const pidInfo = fs.readFileSync(path.join(args["data-directory"], "postmaster.pid"), "utf8").split(/\r?\n/);
assert.ok(Number(pidInfo[0]) > 0);
assert.equal(path.resolve(pidInfo[1]), path.resolve(args["data-directory"]));
assert.equal(Number(pidInfo[3]), Number(args.port));
assert.ok(pidInfo[5].split(",").map(item => item.trim()).includes(args.host));

// Impede que valores libpq herdados desviem a conexão do teste.
for (const key of Object.keys(process.env)) if (/^(PG|PSQL)/i.test(key)) delete process.env[key];
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "development";
process.env.VERCEL = "0";
process.env.SERVERLESS = "false";
process.env.DB_HOST = args.host;
process.env.DB_PORT = args.port;
process.env.DB_USER = args.user;
process.env.DB_NAME = args.database;
process.env.DB_PASSWORD = "";
process.env.DB_SSL = "disable";
process.env.DB_POOL_MAX = "10";
process.env.JWT_SECRET = "isolated-lote1-integration-test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";

const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const pool = new Pool({
  host: args.host, port: Number(args.port), user: args.user, database: args.database,
  password: "", ssl: false, max: 10, connectionTimeoutMillis: 5000,
});

function criarBodyAgenda(data, horarios) {
  return {
    data_inicio: data,
    data_fim: data,
    dias_semana: [new Date(`${data}T12:00:00.000Z`).getUTCDay()],
    horarios,
    publicado: true,
    tratamento_existentes: "SUBSTITUIR",
    confirmacao_substituicao: true,
  };
}

async function aguardarBloqueios(query, valores, quantidade, descricao) {
  const limite = Date.now() + 8000;
  let bloqueados = [];
  while (Date.now() < limite) {
    const atual = await pool.query(query, valores);
    bloqueados = atual.rows;
    if (bloqueados.length >= quantidade) return bloqueados;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Nao observei ${quantidade} conexoes independentes aguardando bloqueio em ${descricao}; observadas=${bloqueados.length}`);
}

async function criarDia(offset, usuarioId, horarios) {
  const dia = (await pool.query(`
    INSERT INTO agenda_publica_dias (data, aberto, publicado, criado_por, atualizado_por)
    VALUES (CURRENT_DATE + $1::integer, true, true, $2, $2)
    RETURNING id, data::text AS data
  `, [offset, usuarioId])).rows[0];
  for (const slot of horarios) {
    await pool.query(`
      INSERT INTO agenda_publica_horarios
        (agenda_dia_id, horario, status, criado_por, atualizado_por)
      VALUES ($1, $2::time, $3, $4, $4)
    `, [dia.id, slot.horario, slot.status, usuarioId]);
  }
  return dia;
}

async function listarHorarios(diaId) {
  return (await pool.query(`
    SELECT to_char(horario, 'HH24:MI') AS horario, status
    FROM agenda_publica_horarios
    WHERE agenda_dia_id = $1
    ORDER BY horario
  `, [diaId])).rows;
}

async function main() {
  const identidade = (await pool.query(`
    SELECT current_database() AS database, current_user AS username,
      replace(current_setting('data_directory'), chr(92), '/') AS data_directory,
      host(inet_server_addr()) AS host, inet_server_port() AS port,
      EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sistema_petshop') AS has_primary,
      EXISTS (SELECT 1 FROM pg_database WHERE datname = 'amores_pet_homologacao') AS has_homologation
  `)).rows[0];
  assert.equal(identidade.database, args.database);
  assert.equal(identidade.username, args.user);
  assert.equal(identidade.host, args.host);
  assert.equal(Number(identidade.port), Number(args.port));
  assert.equal(identidade.data_directory.replaceAll("/", path.sep).toLowerCase(), path.resolve(args["data-directory"]).toLowerCase());
  assert.equal(identidade.has_primary, false);
  assert.equal(identidade.has_homologation, false);

  const idsAntes = new Set();
  const sessoes = await Promise.all([pool.connect(), pool.connect()]);
  try {
    for (const sessao of sessoes) idsAntes.add((await sessao.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
  } finally {
    sessoes.forEach(sessao => sessao.release());
  }
  assert.equal(idsAntes.size, 2, "A instancia isolada precisa aceitar conexoes PostgreSQL independentes.");

  const sufixo = crypto.randomBytes(12).toString("hex");
  const usuario = (await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
    VALUES ($1, $2, 'hash-apenas-de-teste', 'administrador', true)
    RETURNING id, versao_sessao
  `, [`Gerente de integracao ${sufixo}`, `gerente-${sufixo}@example.invalid`])).rows[0];
  const token = jwt.sign({ id: usuario.id, versaoSessao: usuario.versao_sessao }, process.env.JWT_SECRET, { algorithm: "HS256" });
  const app = require("../../../app");

  // Dois pedidos HTTP são mantidos atrás do mesmo row lock. Assim o teste prova
  // que o controller usa conexões distintas e revalida saldo após a primeira saída.
  const produto = (await pool.query(`
    INSERT INTO produtos (nome, unidade, quantidade_atual, quantidade_minima, ativo)
    VALUES ($1, 'un', 5, 1, true) RETURNING id
  `, [`Produto concorrente ${sufixo}`])).rows[0];
  const bloqueioEstoque = await pool.connect();
  let estoqueBloqueado = false;
  let respostasEstoque;
  try {
    await bloqueioEstoque.query("BEGIN");
    await bloqueioEstoque.query("SELECT id FROM produtos WHERE id = $1 FOR UPDATE", [produto.id]);
    const pendentes = [1, 2].map(() => request(app)
      .post(`/api/estoque/produtos/${produto.id}/movimentacoes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "SAIDA", quantidade: 4, motivo: "Concorrencia isolada" })
      .then(resposta => resposta));
    const bloqueados = await aguardarBloqueios(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = $1 AND wait_event_type = 'Lock'
        AND query ILIKE '%FROM produtos%' AND query ILIKE '%FOR UPDATE%'
    `, [args.database], 2, "estoque");
    assert.equal(new Set(bloqueados.map(linha => linha.pid)).size, 2);
    await bloqueioEstoque.query("ROLLBACK");
    estoqueBloqueado = true;
    respostasEstoque = await Promise.all(pendentes);
  } finally {
    if (!estoqueBloqueado) await bloqueioEstoque.query("ROLLBACK").catch(() => {});
    bloqueioEstoque.release();
  }
  assert.deepEqual(respostasEstoque.map(resposta => resposta.status).sort(), [201, 400]);
  assert.ok(respostasEstoque.some(resposta => /Estoque insuficiente/i.test(resposta.body.mensagem || "")));
  const estadoEstoque = (await pool.query(`
    SELECT p.quantidade_atual, count(m.id)::integer AS movimentos,
      min(m.quantidade_anterior)::integer AS quantidade_anterior,
      min(m.quantidade_posterior)::integer AS quantidade_posterior
    FROM produtos p LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id
    WHERE p.id = $1 GROUP BY p.id
  `, [produto.id])).rows[0];
  assert.deepEqual(estadoEstoque, { quantidade_atual: 1, movimentos: 1, quantidade_anterior: 5, quantidade_posterior: 1 });

  // A falha ao inserir o histórico precisa reverter também a atualização do saldo.
  const nomeFuncaoEstoque = `lote1_fail_move_${sufixo}`;
  const nomeTriggerEstoque = `lote1_fail_move_${sufixo}`;
  await pool.query(`CREATE FUNCTION public.${nomeFuncaoEstoque}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'falha sintetica de rollback do teste'; END $$`);
  await pool.query(`CREATE TRIGGER ${nomeTriggerEstoque} BEFORE INSERT ON public.movimentacoes_estoque
    FOR EACH ROW EXECUTE FUNCTION public.${nomeFuncaoEstoque}()`);
  const consoleError = console.error;
  console.error = () => {};
  let respostaRollbackEstoque;
  try {
    respostaRollbackEstoque = await request(app)
      .post(`/api/estoque/produtos/${produto.id}/movimentacoes`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tipo: "ENTRADA", quantidade: 2, motivo: "Rollback isolado" });
  } finally {
    console.error = consoleError;
    await pool.query(`DROP TRIGGER ${nomeTriggerEstoque} ON public.movimentacoes_estoque`);
    await pool.query(`DROP FUNCTION public.${nomeFuncaoEstoque}()`);
  }
  assert.equal(respostaRollbackEstoque.status, 500);
  const estadoAposRollback = (await pool.query(`
    SELECT p.quantidade_atual, count(m.id)::integer AS movimentos
    FROM produtos p LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id
    WHERE p.id = $1 GROUP BY p.id
  `, [produto.id])).rows[0];
  assert.deepEqual(estadoAposRollback, { quantidade_atual: 1, movimentos: 1 });

  const offset = 12000 + crypto.randomInt(0, 40000);
  const diaReservado = await criarDia(offset, usuario.id, [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "10:00", status: "RESERVADO" },
  ]);
  const substituicaoReservado = criarBodyAgenda(diaReservado.data, ["09:00", "14:00"]);
  const bloqueioAgenda = await pool.connect();
  let agendaBloqueada = false;
  let respostasReservado;
  try {
    await bloqueioAgenda.query("BEGIN");
    await bloqueioAgenda.query("SELECT id FROM agenda_publica_dias WHERE id = $1 FOR UPDATE", [diaReservado.id]);
    const pendentes = [1, 2].map(() => request(app)
      .post("/api/agenda-publica/admin/operacoes/massa")
      .set("Authorization", `Bearer ${token}`)
      .send(substituicaoReservado)
      .then(resposta => resposta));
    const bloqueados = await aguardarBloqueios(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = $1 AND wait_event_type = 'Lock'
        AND query ILIKE '%agenda_publica_dias%' AND query ILIKE '%FOR UPDATE%'
    `, [args.database], 2, "substituicao de agenda reservada");
    assert.equal(new Set(bloqueados.map(linha => linha.pid)).size, 2);
    await bloqueioAgenda.query("ROLLBACK");
    agendaBloqueada = true;
    respostasReservado = await Promise.all(pendentes);
  } finally {
    if (!agendaBloqueada) await bloqueioAgenda.query("ROLLBACK").catch(() => {});
    bloqueioAgenda.release();
  }
  assert.deepEqual(respostasReservado.map(resposta => resposta.status), [409, 409]);
  assert.deepEqual(await listarHorarios(diaReservado.id), [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "10:00", status: "RESERVADO" },
  ]);
  assert.equal((await pool.query("SELECT count(*)::integer AS total FROM agenda_publica_operacoes WHERE data_inicio = $1", [diaReservado.data])).rows[0].total, 0);

  const diaLivre = await criarDia(offset + 1, usuario.id, [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "14:00", status: "DISPONIVEL" },
  ]);
  const substituicaoLivre = await request(app)
    .post("/api/agenda-publica/admin/operacoes/massa")
    .set("Authorization", `Bearer ${token}`)
    .send(criarBodyAgenda(diaLivre.data, ["11:00", "13:00"]));
  assert.equal(substituicaoLivre.status, 200);
  assert.deepEqual(await listarHorarios(diaLivre.id), [
    { horario: "11:00", status: "DISPONIVEL" },
    { horario: "13:00", status: "DISPONIVEL" },
  ]);

  // Duas substituições concorrentes no dia livre são serializadas pelo lock da data;
  // o resultado final precisa corresponder integralmente à última configuração.
  const diaConcorrente = await criarDia(offset + 2, usuario.id, [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "14:00", status: "DISPONIVEL" },
  ]);
  const configsConcorrentes = [
    criarBodyAgenda(diaConcorrente.data, ["09:30", "13:30"]),
    criarBodyAgenda(diaConcorrente.data, ["10:30", "14:30"]),
  ];
  const bloqueioConcorrente = await pool.connect();
  let concorrenciaLiberada = false;
  let respostasConcorrentes;
  try {
    await bloqueioConcorrente.query("BEGIN");
    await bloqueioConcorrente.query("SELECT id FROM agenda_publica_dias WHERE id = $1 FOR UPDATE", [diaConcorrente.id]);
    const pendentes = configsConcorrentes.map(body => request(app)
      .post("/api/agenda-publica/admin/operacoes/massa")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .then(resposta => resposta));
    const bloqueados = await aguardarBloqueios(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = $1 AND wait_event_type = 'Lock'
        AND query ILIKE '%agenda_publica_dias%' AND query ILIKE '%FOR UPDATE%'
    `, [args.database], 2, "substituicao concorrente de horarios livres");
    assert.equal(new Set(bloqueados.map(linha => linha.pid)).size, 2);
    await bloqueioConcorrente.query("ROLLBACK");
    concorrenciaLiberada = true;
    respostasConcorrentes = await Promise.all(pendentes);
  } finally {
    if (!concorrenciaLiberada) await bloqueioConcorrente.query("ROLLBACK").catch(() => {});
    bloqueioConcorrente.release();
  }
  assert.deepEqual(respostasConcorrentes.map(resposta => resposta.status).sort(), [200, 200]);
  const horariosFinais = (await listarHorarios(diaConcorrente.id)).map(linha => linha.horario);
  const configuracoesValidas = [["09:30", "13:30"], ["10:30", "14:30"]];
  assert.ok(configuracoesValidas.some(configuracao => JSON.stringify(configuracao) === JSON.stringify(horariosFinais)),
    `A substituicao concorrente deixou um conjunto parcial ou inesperado: ${JSON.stringify(horariosFinais)}`);
  assert.equal((await pool.query("SELECT count(*)::integer AS total FROM agenda_publica_operacoes WHERE data_inicio = $1", [diaConcorrente.data])).rows[0].total, 2);

  const diaRollback = await criarDia(offset + 3, usuario.id, [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "14:00", status: "DISPONIVEL" },
  ]);
  const nomeFuncaoAgenda = `lote1_fail_agenda_${sufixo}`;
  const nomeTriggerAgenda = `lote1_fail_agenda_${sufixo}`;
  await pool.query(`CREATE FUNCTION public.${nomeFuncaoAgenda}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.data_inicio = DATE '${diaRollback.data}' THEN RAISE EXCEPTION 'falha sintetica de rollback do teste'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER ${nomeTriggerAgenda} BEFORE INSERT ON public.agenda_publica_operacoes
    FOR EACH ROW EXECUTE FUNCTION public.${nomeFuncaoAgenda}()`);
  const oldConsoleError = console.error;
  console.error = () => {};
  let respostaRollbackAgenda;
  try {
    respostaRollbackAgenda = await request(app)
      .post("/api/agenda-publica/admin/operacoes/massa")
      .set("Authorization", `Bearer ${token}`)
      .send(criarBodyAgenda(diaRollback.data, ["11:00", "15:00"]));
  } finally {
    console.error = oldConsoleError;
    await pool.query(`DROP TRIGGER ${nomeTriggerAgenda} ON public.agenda_publica_operacoes`);
    await pool.query(`DROP FUNCTION public.${nomeFuncaoAgenda}()`);
  }
  assert.equal(respostaRollbackAgenda.status, 500);
  assert.deepEqual(await listarHorarios(diaRollback.id), [
    { horario: "09:00", status: "DISPONIVEL" },
    { horario: "14:00", status: "DISPONIVEL" },
  ]);
  assert.equal((await pool.query("SELECT count(*)::integer AS total FROM agenda_publica_operacoes WHERE data_inicio = $1", [diaRollback.data])).rows[0].total, 0);

  console.log("PASS: PostgreSQL HTTP real — saidas concorrentes mantiveram saldo e historico, rollback do estoque, horarios RESERVADO preservados, substituicao livre e concorrente serializada, rollback da Agenda.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
