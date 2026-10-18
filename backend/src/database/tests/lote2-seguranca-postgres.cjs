'use strict';

// Integrações reais do Lote 2. Só aceita o cluster aleatório criado pelo harness,
// dentro de TEMP, e não recebe nem usa configuração privada persistente.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const request = require('supertest');
const pool = require('../connection');
const app = require('../../../app');
const { DESTINO_HOMOLOGACAO } = require('../provisionarSuperAdministradorDestino.cjs');
const {
  CONTA,
  CONFIRMACAO_LOCAL,
  criarSuperAdministradorHomologacao,
  preflightSuperAdministradorHomologacao,
  validarIdentidadeCompleta,
} = require('../criarSuperAdministradorHomologacao.cjs');

const TEST_PASSWORD = 'Lote2-Synthetic-Password-2026';
const FIXTURE_MARK = crypto.randomUUID();
const named = new Map();
let passed = 0;
let failed = 0;

function expectStatus(response, status, context) {
  assert.equal(response.status, status, `${context}: HTTP ${response.status}`);
}

function failureLocation(error) {
  const match = String(error?.stack || '').match(/lote2-seguranca-postgres\.cjs:(\d+):(\d+)/);
  return match ? `lote2-seguranca-postgres.cjs:${match[1]}` : 'lote2-seguranca-postgres.cjs';
}

async function run(name, action) {
  try {
    await action();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed += 1;
    const safeDelta = error?.code === 'POSTMASTER_EPOCH_MISMATCH' && Number.isFinite(error.delta)
      ? `; diferença do início do cluster=${error.delta}s` : '';
    process.stderr.write(`FAIL ${name}: ${error.code || error.name || 'ASSERTION'} at ${failureLocation(error)}${safeDelta}\n`);
  }
}

function makeToken(user) {
  return jwt.sign({ id: Number(user.id), versaoSessao: user.versao_sessao }, process.env.JWT_SECRET, {
    expiresIn: '10m', algorithm: 'HS256',
  });
}

function auth(token) { return { Authorization: `Bearer ${token}` }; }

async function ensureDisposableTarget() {
  const result = await pool.query(`SELECT current_database() AS database, current_user AS role,
      inet_server_addr()::text AS host, inet_server_port() AS port,
      extract(epoch FROM pg_postmaster_start_time())::bigint AS server_start_epoch,
      current_setting('server_version_num')::integer AS server_version_num,
      pg_has_role(current_user, 'pg_read_all_settings', 'MEMBER') AS has_read_all_settings`);
  const target = result.rows[0];
  const expectedData = path.resolve(process.env.AMORES_PG_DATA_DIRECTORY || '');
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, expectedData);
  assert.match(target.database, /^sistema_petshop_teste_[a-f0-9]{32}$/, 'database name is not a disposable test database');
  assert.notEqual(target.database, 'sistema_petshop', 'database points to the primary database');
  assert.notEqual(target.database, 'amores_pet_homologacao', 'database points to persistent homologation');
  assert.equal(target.role, 'amores_pet_homologacao_app', 'database role differs from the homologation application role');
  assert.ok(['127.0.0.1', '127.0.0.1/32', '::ffff:127.0.0.1'].includes(target.host), 'database server is not IPv4 loopback');
  assert.equal(Number(target.port), Number(process.env.AMORES_PG_PORT), 'database port differs from disposable cluster');
  assert.ok(Number(target.server_version_num) >= 170000 && Number(target.server_version_num) < 180000, 'server is not PostgreSQL 17');
  const startEpochDelta = Math.abs(Number(target.server_start_epoch) - Number(process.env.AMORES_PG_POSTMASTER_START_EPOCH));
  if (!Number.isFinite(startEpochDelta) || startEpochDelta > 1) {
    throw Object.assign(new Error('SQL start epoch differs from the locally verified postmaster.pid.'), {
      code: 'POSTMASTER_EPOCH_MISMATCH', delta: startEpochDelta,
    });
  }
  assert.equal(target.has_read_all_settings, false, 'test role unexpectedly has pg_read_all_settings');
  assert.ok(path.isAbsolute(expectedData), 'expected database directory is not absolute');
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'database cluster is outside TEMP');
  return target;
}

async function createUser(name, email, profile, { active = true, password = TEST_PASSWORD } = {}) {
  const passwordHash = await bcrypt.hash(password, 5);
  const result = await pool.query(`INSERT INTO public.usuarios (nome,email,senha_hash,perfil,ativo)
    VALUES ($1,$2,$3,$4,$5) RETURNING id,nome,email,perfil,ativo,versao_sessao`, [name, email, passwordHash, profile, active]);
  return result.rows[0];
}

async function main() {
  if (process.env.NODE_ENV !== 'development' || process.env.DATABASE_URL) {
    throw new Error('L2 test environment rejected.');
  }
  const target = await ensureDisposableTarget();
  const expected = { host: '127.0.0.1', port: Number(target.port), database: target.database, user: target.role };
  const employee = await createUser('L2 Synthetic Employee', `l2-employee-${FIXTURE_MARK}@example.invalid`, 'funcionario');
  const manager = await createUser('L2 Synthetic Manager', `l2-manager-${FIXTURE_MARK}@example.invalid`, 'gerente');
  const admin = await createUser('Administrador Homologação', 'admin@homologacao.invalid', 'administrador');
  const inactiveSuper = await createUser('L2 Inactive Super', `l2-inactive-super-${FIXTURE_MARK}@example.invalid`, 'super_administrador', { active: false });
  const originalAdmin = { ...admin };
  const provisionInput = {
    confirmacao: CONFIRMACAO_LOCAL,
    operador: 'Teste sintético Lote 2',
    password: TEST_PASSWORD,
    passwordConfirm: TEST_PASSWORD,
  };
  let superUser;
  let galleryId;
  let eligibleTutorId;
  let dependentTutorId;
  let dependentPetId;
  const createdTutorIds = [];
  const testUsers = [employee, manager, admin, inactiveSuper];

  try {
    await run('identidade PostgreSQL 17 isolada e guard de destino', async () => {
      assert.equal(validarIdentidadeCompleta(target, expected, process.env.AMORES_PG_POSTMASTER_START_EPOCH), true);
      assert.throws(() => validarIdentidadeCompleta({ ...target, database: 'sistema_petshop' }, expected, process.env.AMORES_PG_POSTMASTER_START_EPOCH));
      await assert.rejects(pool.query("SELECT current_setting('data_directory')"), error => error.code === '42501');
      assert.deepEqual(await pool.query(`SELECT to_regclass('public.operation_authorizations') AS operation_auth,
        to_regclass('public.permanent_file_deletion_queue') AS deletion_queue,
        to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)') AS notify_fn`).then(r => r.rows[0]), {
        operation_auth: 'operation_authorizations', deletion_queue: 'permanent_file_deletion_queue',
        notify_fn: 'emitir_notificacao_equipe(text,text,text,text,text)',
      });
    });

    await run('SQLSTATE 42501 em auditoria reverte a inserção parcial da conta', async () => {
      const privileged = new Client({
        host: '127.0.0.1', port: Number(target.port), database: target.database,
        user: 'postgres', password: '', ssl: false, connectionTimeoutMillis: 5000,
      });
      await privileged.connect();
      try {
        await privileged.query('ALTER TABLE public.logs OWNER TO postgres');
        await privileged.query('GRANT SELECT ON public.logs TO amores_pet_homologacao_app');
        await privileged.query('GRANT USAGE, SELECT ON SEQUENCE public.logs_id_seq TO amores_pet_homologacao_app');
        const appPrivilege = await pool.query(`SELECT has_table_privilege(current_user,'public.logs','INSERT') AS can_insert,
          pg_has_role(current_user,'pg_read_all_settings','MEMBER') AS can_read_settings`);
        assert.equal(appPrivilege.rows[0].can_insert, false);
        assert.equal(appPrivilege.rows[0].can_read_settings, false);

        const client = await pool.connect();
        try {
          await assert.rejects(criarSuperAdministradorHomologacao({
            client, input: provisionInput, identity: target, expected,
            expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
            windowsUser: 'runner-disposable',
          }), error => error.code === 'AP-SUPER-PROVISION-SQL-AUDIT'
            && error.sqlState === '42501'
            && /registro de auditoria inicial; SQLSTATE 42501/.test(error.message)
            && !error.message.includes(TEST_PASSWORD));
        } finally { client.release(); }

        assert.equal((await pool.query('SELECT id FROM public.usuarios WHERE lower(email)=lower($1)', [CONTA.email])).rowCount, 0);
        assert.equal((await pool.query(`SELECT id FROM public.logs WHERE acao='PROVISIONAR_SUPER_ADMINISTRADOR_CRIADO'`)).rowCount, 0);
        assert.deepEqual(await pool.query('SELECT id,nome,email,perfil,ativo,versao_sessao FROM usuarios WHERE id=$1', [admin.id]).then(r => r.rows[0]), originalAdmin);
      } finally {
        await privileged.query('ALTER SEQUENCE public.logs_id_seq OWNER TO amores_pet_homologacao_app').catch(() => {});
        await privileged.query('ALTER TABLE public.logs OWNER TO amores_pet_homologacao_app').catch(() => {});
        await privileged.end();
      }
    });

    await run('provisionamento novo: hash, perfil, login e auditoria', async () => {
      assert.equal(expected.database.startsWith('sistema_petshop_teste_'), true);
      const client = await pool.connect();
      try {
        const result = await criarSuperAdministradorHomologacao({
          client,
          input: provisionInput,
          identity: target,
          expected,
          expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
          windowsUser: 'runner-disposable',
        });
        superUser = result.account;
        assert.equal(result.adminUnchanged, true);
        assert.equal(superUser.email, CONTA.email);
        assert.equal(superUser.perfil, 'super_administrador');
        assert.equal(superUser.ativo, true);
      } finally { client.release(); }
      const stored = await pool.query('SELECT senha_hash FROM public.usuarios WHERE id=$1', [superUser.id]);
      assert.equal(await bcrypt.compare(TEST_PASSWORD, stored.rows[0].senha_hash), true);
      assert.notEqual(stored.rows[0].senha_hash, TEST_PASSWORD);
      const audit = await pool.query(`SELECT usuario_id,acao,entidade,registro_id,valor_novo::text AS detail
        FROM public.logs WHERE acao='PROVISIONAR_SUPER_ADMINISTRADOR_CRIADO' AND registro_id=$1`, [superUser.id]);
      assert.equal(audit.rowCount, 1);
      assert.equal(audit.rows[0].usuario_id, null);
      assert.match(audit.rows[0].detail, /superadmin@homologacao\.invalid/);
      assert.doesNotMatch(audit.rows[0].detail, new RegExp(TEST_PASSWORD));
      assert.deepEqual(await pool.query('SELECT id,nome,email,perfil,ativo,versao_sessao FROM usuarios WHERE id=$1', [admin.id]).then(r => r.rows[0]), originalAdmin);
      const response = await request(app).post('/api/auth/login').send({ email: CONTA.email, senha: TEST_PASSWORD });
      expectStatus(response, 200, 'Super Administrador login');
      const me = await request(app).get('/api/auth/me').set(auth(response.body.token));
      expectStatus(me, 200, 'Super Administrador session');
      assert.equal(me.body.usuario.perfil, 'super_administrador');
    });

    await run('provisionamento recusa destino divergente, e-mail repetido e entrada inválida', async () => {
      assert.throws(() => validarIdentidadeCompleta({ ...target, role: 'postgres' }, expected, process.env.AMORES_PG_POSTMASTER_START_EPOCH));
      const client = await pool.connect();
      try {
        await assert.rejects(criarSuperAdministradorHomologacao({
          client, input: provisionInput, identity: target, expected: { ...expected, host: '192.0.2.99' },
          expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
        }));
        await assert.rejects(criarSuperAdministradorHomologacao({
          client, input: { ...provisionInput, confirmacao: 'wrong' }, identity: target, expected,
          expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
        }));
        await assert.rejects(criarSuperAdministradorHomologacao({
          client, input: provisionInput, identity: target, expected,
          expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
        }), error => error.code === 'DUPLICATE_EMAIL');
        await assert.rejects(preflightSuperAdministradorHomologacao({
          client, identity: target, expected,
          expectedStartEpoch: process.env.AMORES_PG_POSTMASTER_START_EPOCH,
        }), error => error.code === 'DUPLICATE_EMAIL');
      } finally { client.release(); }
      const counts = await pool.query(`SELECT count(*)::int AS total FROM usuarios WHERE lower(email)=lower($1)`, [CONTA.email]);
      assert.equal(counts.rows[0].total, 1);
      assert.equal((await pool.query('SELECT perfil FROM usuarios WHERE id=$1', [admin.id])).rows[0].perfil, 'administrador');
    });

    await run('quatro perfis: rotas de administração, usuários, site, serviços e agenda', async () => {
      const users = [employee, manager, admin, superUser];
      for (const user of users) {
        const token = makeToken(user);
        const adminSite = await request(app).get('/api/site-conteudo/admin').set(auth(token));
        const usersRoute = await request(app).get('/api/usuarios').set(auth(token));
        const serviceWrite = await request(app).post('/api/servicos').set(auth(token)).send({});
        const agendaWrite = await request(app).post('/api/agenda-publica/admin/operacoes/massa').set(auth(token)).send({});
        const allowed = ['administrador', 'super_administrador'].includes(user.perfil);
        expectStatus(adminSite, allowed ? 200 : 403, `${user.perfil} site administration`);
        expectStatus(usersRoute, allowed ? 200 : 403, `${user.perfil} user administration`);
        expectStatus(serviceWrite, allowed ? 400 : 403, `${user.perfil} services write gate`);
        expectStatus(agendaWrite, allowed ? 400 : 403, `${user.perfil} public agenda write gate`);
      }
      const adminAttempt = await request(app).post('/api/usuarios').set(auth(makeToken(admin))).send({
        nome: 'L2 Forbidden Super', email: `l2-forbidden-${FIXTURE_MARK}@example.invalid`, senha: TEST_PASSWORD, perfil: 'super_administrador',
      });
      expectStatus(adminAttempt, 403, 'common Administrator cannot create Super Administrator');
      assert.equal((await pool.query('SELECT id FROM usuarios WHERE email=$1', [`l2-forbidden-${FIXTURE_MARK}@example.invalid`])).rowCount, 0);

      const promotionAttempt = await request(app).patch(`/api/usuarios/${employee.id}/perfil`)
        .set({ ...auth(makeToken(admin)), 'X-Confirm-Password': TEST_PASSWORD })
        .send({ perfil: 'super_administrador' });
      expectStatus(promotionAttempt, 403, 'common Administrator cannot promote an existing account to Super Administrator');
      assert.equal((await pool.query('SELECT perfil FROM usuarios WHERE id=$1', [employee.id])).rows[0].perfil, 'funcionario');
    });

    await run('Galeria: autorizadores, senha inválida, autoautorização, cruzada, expiração, uso único e auditoria', async () => {
      const fileName = `${crypto.randomUUID()}.png`;
      const created = await pool.query(`INSERT INTO site_galeria
        (arquivo_nome,mime_type,tamanho_bytes,titulo,texto_alternativo,publicado,criado_por)
        VALUES ($1,'image/png',1,'L2 synthetic','Synthetic image',FALSE,$2) RETURNING id`, [fileName, admin.id]);
      galleryId = Number(created.rows[0].id);
      const requesterToken = makeToken(manager);
      const authorizers = await request(app).get('/api/operacoes/autorizacoes/autorizadores').set(auth(requesterToken));
      expectStatus(authorizers, 200, 'gallery authorizer list');
      assert.deepEqual(authorizers.body.map(x => Number(x.id)).sort((a, b) => a - b), [Number(admin.id), Number(superUser.id)].sort((a, b) => a - b));

      const context = { titulo: 'Authorized update', legenda: 'Synthetic fixture', texto_alternativo: 'Synthetic image updated', categoria: 'L2', ordem: 2, publicado: false };
      const baseAuthBody = { operacao: 'GALERIA_ATUALIZAR', entidade: 'site_galeria', registro_id: galleryId, contexto: context };
      const wrongPassword = await request(app).post('/api/operacoes/autorizacoes').set(auth(requesterToken)).send({
        ...baseAuthBody, autorizador_id: admin.id, senha: 'incorrect-test-only',
      });
      expectStatus(wrongPassword, 401, 'wrong gallery authorizer password');
      const self = await request(app).post('/api/operacoes/autorizacoes').set(auth(requesterToken)).send({
        ...baseAuthBody, autorizador_id: manager.id, senha: TEST_PASSWORD,
      });
      expectStatus(self, 403, 'gallery self-authorization');

      const issued = await request(app).post('/api/operacoes/autorizacoes').set(auth(requesterToken)).send({
        ...baseAuthBody, autorizador_id: admin.id, senha: TEST_PASSWORD,
      });
      expectStatus(issued, 201, 'Manager authorized by Administrator');
      const updated = await request(app).put(`/api/site-conteudo/admin/galeria/${galleryId}`).set(auth(requesterToken))
        .set('X-Operation-Authorization', issued.body.autorizacao).send(context);
      expectStatus(updated, 200, 'single authorized gallery update');
      const reused = await request(app).put(`/api/site-conteudo/admin/galeria/${galleryId}`).set(auth(requesterToken))
        .set('X-Operation-Authorization', issued.body.autorizacao).send(context);
      expectStatus(reused, 409, 'gallery authorization reuse');

      const employeeToken = makeToken(employee);
      const expired = await request(app).post('/api/operacoes/autorizacoes').set(auth(employeeToken)).send({
        ...baseAuthBody, autorizador_id: superUser.id,
        contexto: { ...context, titulo: 'Expired attempt' }, senha: TEST_PASSWORD,
      });
      expectStatus(expired, 201, 'Employee authorized by Super Administrator');
      await pool.query(`WITH item AS (
        SELECT id FROM operation_authorizations WHERE requester_user_id=$1 AND operation='GALERIA_ATUALIZAR'
          ORDER BY id DESC LIMIT 1
      ) UPDATE operation_authorizations a SET created_at=CURRENT_TIMESTAMP-INTERVAL '10 minutes',
          expires_at=CURRENT_TIMESTAMP-INTERVAL '5 minutes' FROM item WHERE a.id=item.id`, [employee.id]);
      const expiredUpdate = await request(app).put(`/api/site-conteudo/admin/galeria/${galleryId}`).set(auth(employeeToken))
        .set('X-Operation-Authorization', expired.body.autorizacao).send({ ...context, titulo: 'Expired attempt' });
      expectStatus(expiredUpdate, 409, 'expired gallery authorization');

      const audit = await pool.query(`SELECT acao,valor_novo::text AS value FROM logs
        WHERE registro_id=$1 AND entidade='site_galeria'
          AND acao IN ('AUTORIZACAO_OPERACAO_EMITIDA','AUTORIZACAO_OPERACAO_CONSUMIDA','IMAGEM_GALERIA_ATUALIZADA')`, [galleryId]);
      assert.ok(audit.rows.some(row => row.acao === 'AUTORIZACAO_OPERACAO_EMITIDA' && row.value.includes(`"autorizador_id": ${admin.id}`)));
      assert.ok(audit.rows.some(row => row.acao === 'AUTORIZACAO_OPERACAO_CONSUMIDA' && row.value.includes(`"autorizador_id": ${admin.id}`)));
      assert.ok(audit.rows.some(row => row.acao === 'IMAGEM_GALERIA_ATUALIZADA'));
      assert.ok(audit.rows.every(row => !row.value.includes(TEST_PASSWORD) && !row.value.includes(issued.body.autorizacao)));
      const hashes = await pool.query(`SELECT bool_and(token_hash ~ '^[a-f0-9]{64}$' AND context_hash ~ '^[a-f0-9]{64}$') AS valid
        FROM operation_authorizations WHERE requester_user_id=ANY($1::integer[])`, [[Number(manager.id), Number(employee.id)]]);
      assert.equal(hashes.rows[0].valid, true);
    });

    await run('exclusões: gate Super, dependências, retenção protegida e pré-validação obrigatória', async () => {
      const tutor = await pool.query(`INSERT INTO tutores (nome,telefone,endereco,ativo)
        VALUES ($1,'11999990000','Endereço sintético',FALSE) RETURNING id`, [`L2 dependent ${FIXTURE_MARK}`]);
      dependentTutorId = Number(tutor.rows[0].id); createdTutorIds.push(dependentTutorId);
      const pet = await pool.query(`INSERT INTO pets (tutor_id,nome,especie,ativo)
        VALUES ($1,$2,'cao',FALSE) RETURNING id`, [dependentTutorId, `L2 Pet ${FIXTURE_MARK}`]);
      dependentPetId = Number(pet.rows[0].id);

      const denied = await request(app).get(`/api/exclusoes-definitivas/tutores/${dependentTutorId}`).set(auth(makeToken(admin)));
      expectStatus(denied, 403, 'only Super Administrator can preview permanent deletion');
      const blocked = await request(app).get(`/api/exclusoes-definitivas/tutores/${dependentTutorId}`).set(auth(makeToken(superUser)));
      expectStatus(blocked, 200, 'dependency preview');
      assert.equal(blocked.body.elegivel, false);
      assert.ok(blocked.body.dependencias.includes('pets'));
      for (const protectedEntity of ['pagamentos', 'documentos_fiscais', 'movimentacoes_estoque', 'banho_tosa', 'logs', 'operation_authorizations']) {
        const response = await request(app).get(`/api/exclusoes-definitivas/${protectedEntity}/1`).set(auth(makeToken(superUser)));
        expectStatus(response, 400, `protected entity ${protectedEntity}`);
      }
      const missingConfirm = await request(app).delete(`/api/exclusoes-definitivas/tutores/${dependentTutorId}`)
        .set(auth(makeToken(superUser))).send({ motivo: 'Synthetic blocked delete' });
      expectStatus(missingConfirm, 400, 'missing explicit deletion confirmation');
      assert.equal((await pool.query('SELECT id FROM tutores WHERE id=$1', [dependentTutorId])).rowCount, 1);
    });

    await run('exclusão sintética validada no cluster descartável com senha, frase, motivo e auditoria', async () => {
      const tutor = await pool.query(`INSERT INTO tutores (nome,telefone,endereco,ativo)
        VALUES ($1,'11999990001','Endereço sintético',FALSE) RETURNING id`, [`L2 eligible ${FIXTURE_MARK}`]);
      eligibleTutorId = Number(tutor.rows[0].id); createdTutorIds.push(eligibleTutorId);
      const preview = await request(app).get(`/api/exclusoes-definitivas/tutores/${eligibleTutorId}`).set(auth(makeToken(superUser)));
      expectStatus(preview, 200, 'eligible synthetic preview');
      assert.equal(preview.body.elegivel, true);

      const reason = 'Remoção de fixture sintética do teste L2';
      const context = { motivo: reason, confirmacao: `EXCLUIR ${eligibleTutorId}`, confirmacao_irreversivel: true };
      const authResponse = await request(app).post('/api/operacoes/autorizacoes').set(auth(makeToken(superUser))).send({
        operacao: 'PERMANENT_DELETE', entidade: 'tutores', registro_id: eligibleTutorId,
        contexto: context, autorizador_id: superUser.id, senha: TEST_PASSWORD,
      });
      expectStatus(authResponse, 201, 'Super reauthentication for synthetic delete');
      const deleted = await request(app).delete(`/api/exclusoes-definitivas/tutores/${eligibleTutorId}`)
        .set(auth(makeToken(superUser))).set('X-Operation-Authorization', authResponse.body.autorizacao)
        .send({ motivo: reason, confirmacao: `EXCLUIR ${eligibleTutorId}`, confirmacao_irreversivel: true });
      expectStatus(deleted, 200, 'synthetic hard delete');
      assert.equal((await pool.query('SELECT id FROM tutores WHERE id=$1', [eligibleTutorId])).rowCount, 0);
      const audit = await pool.query(`SELECT usuario_id,valor_novo::text AS value FROM logs
        WHERE acao='EXCLUSAO_DEFINITIVA' AND entidade='tutores' AND registro_id=$1`, [eligibleTutorId]);
      assert.equal(audit.rowCount, 1);
      assert.equal(Number(audit.rows[0].usuario_id), Number(superUser.id));
      assert.ok(audit.rows[0].value.includes(`"solicitante_id": ${superUser.id}`));
      assert.ok(audit.rows[0].value.includes(`"autorizador_id": ${superUser.id}`));
      assert.ok(audit.rows[0].value.includes(reason));
    });

    await run('notificações: função 037 inclui perfis ativos e exclui Super inativo', async () => {
      await pool.query(`SELECT public.emitir_notificacao_equipe($1,'NOVO_ATENDIMENTO','L2 synthetic notice',
        'Mensagem sintética de integração.','/atendimentos')`, [`l2-test:${FIXTURE_MARK}`]);
      const recipients = await pool.query(`SELECT u.id,u.perfil,u.ativo FROM notificacoes_internas n
        JOIN usuarios u ON u.id=n.usuario_id WHERE n.chave_dedupe=$1`, [`l2-test:${FIXTURE_MARK}`]);
      assert.deepEqual(recipients.rows.map(row => Number(row.id)).sort((a, b) => a - b),
        [employee.id, manager.id, admin.id, superUser.id].map(Number).sort((a, b) => a - b));
      assert.ok(recipients.rows.every(row => row.ativo));
      assert.ok(!recipients.rows.some(row => Number(row.id) === Number(inactiveSuper.id)));
      for (const user of [employee, manager, admin, superUser]) {
        const response = await request(app).get('/api/notificacoes').set(auth(makeToken(user)));
        expectStatus(response, 200, `${user.perfil} notifications`);
        assert.ok(response.body.notificacoes.some(item => item.evento === 'NOVO_ATENDIMENTO' && item.titulo === 'L2 synthetic notice'));
      }
    });

    await run('invalidação imediata de JWT após mudança de perfil e bloqueio de usuário inativo', async () => {
      const oldToken = makeToken(manager);
      const before = await request(app).get('/api/auth/me').set(auth(oldToken));
      expectStatus(before, 200, 'active session before role change');
      const updated = await pool.query(`UPDATE usuarios SET perfil='funcionario',versao_sessao=versao_sessao+1 WHERE id=$1
        RETURNING id,nome,email,perfil,ativo,versao_sessao`, [manager.id]);
      const stale = await request(app).get('/api/auth/me').set(auth(oldToken));
      expectStatus(stale, 401, 'session after role change');
      const freshToken = makeToken(updated.rows[0]);
      const fresh = await request(app).get('/api/auth/me').set(auth(freshToken));
      expectStatus(fresh, 200, 'new role session');
      await pool.query('UPDATE usuarios SET ativo=FALSE,versao_sessao=versao_sessao+1 WHERE id=$1', [employee.id]);
      const inactive = await request(app).get('/api/auth/me').set(auth(makeToken(employee)));
      expectStatus(inactive, 403, 'inactive user session');
    });
  } finally {
    // Só remove fixtures deste banco TEMP de nome aleatório, depois de reafirmar identidade.
    await ensureDisposableTarget();
    if (galleryId) await pool.query('DELETE FROM site_galeria WHERE id=$1', [galleryId]).catch(() => {});
    if (dependentPetId) await pool.query('DELETE FROM pets WHERE id=$1', [dependentPetId]).catch(() => {});
    if (createdTutorIds.length) await pool.query('DELETE FROM tutores WHERE id=ANY($1::integer[])', [createdTutorIds]).catch(() => {});
    const userIds = [...testUsers.map(user => Number(user.id)), ...(superUser ? [Number(superUser.id)] : [])];
    await pool.query('DELETE FROM notificacoes_internas WHERE usuario_id=ANY($1::integer[])', [userIds]).catch(() => {});
    await pool.query('DELETE FROM logs WHERE usuario_id=ANY($1::integer[]) OR registro_id=ANY($1::integer[])', [userIds]).catch(() => {});
    await pool.query('DELETE FROM operation_authorizations WHERE requester_user_id=ANY($1::integer[]) OR authorizer_user_id=ANY($1::integer[])', [userIds]).catch(() => {});
    await pool.query('DELETE FROM preferencias_notificacao WHERE usuario_id=ANY($1::integer[])', [userIds]).catch(() => {});
    await pool.query('DELETE FROM usuarios WHERE id=ANY($1::integer[])', [userIds]).catch(() => {});
    await pool.end();
  }

  process.stdout.write(`Lote 2 PostgreSQL: ${passed} aprovados; ${failed} falhos.\n`);
  if (failed) process.exitCode = 1;
}

main().catch(async error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,40}$/.test(error.code)
    ? error.code : (error?.name === 'AssertionError' ? 'TARGET_GUARD_ASSERTION' : 'ERROR');
  process.stderr.write(`Lote 2 PostgreSQL interrompido antes da conclusão: ${code} at ${failureLocation(error)}\n`);
  if (typeof error?.message === 'string' && /^[a-zA-Z0-9 ._-]{1,120}$/.test(error.message)) process.stderr.write(`Diagnóstico sanitizado: ${error.message}\n`);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
