const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Pool } = require("pg");
const { SQL_LISTAR_SOLICITACOES } = require("../src/controllers/solicitacaoAtendimentoController");

const SQL_LISTAR_SOLICITACOES_ANTIGA = `
  SELECT bt.id, bt.status,
    (bt.agendado_para AT TIME ZONE 'America/Sao_Paulo') AS agendado_para,
    bt.criado_em,
    bt.observacoes_agendamento,
    p.nome AS pet_nome, p.especie AS pet_especie, p.raca AS pet_raca,
    p.porte AS pet_porte, p.sexo AS pet_sexo, p.alergias AS pet_alergias,
    p.necessidades_especiais AS pet_necessidades_especiais,
    p.comportamento AS pet_comportamento, p.observacoes AS pet_observacoes,
    t.nome AS tutor_nome,
    COALESCE(json_agg(json_build_object(
      'id', s.id, 'nome', s.nome, 'valor', bts.valor_unitario,
      'duracao_minutos', bts.duracao_minutos
    ) ORDER BY s.nome) FILTER (WHERE bts.id IS NOT NULL), '[]'::json) AS servicos
  FROM banho_tosa bt
  JOIN pets p ON p.id = bt.pet_id
  JOIN historico_atendimentos criado
    ON criado.banho_tosa_id = bt.id AND criado.evento = 'SOLICITACAO_CRIADA'
  JOIN pet_tutores pt ON pt.pet_id = p.id AND pt.tutor_id = criado.tutor_id
  JOIN tutores t ON t.id = criado.tutor_id
  LEFT JOIN banho_tosa_servicos bts ON bts.banho_tosa_id = bt.id
  LEFT JOIN servicos s ON s.id = bts.servico_id
  WHERE bt.status = 'AGUARDANDO_CONFIRMACAO'
  GROUP BY bt.id, p.id, t.id
  ORDER BY bt.criado_em ASC, bt.id ASC
`;

const integrarPostgresIsolado = process.env.AMORES_PG_SOLICITACOES_TEST === "1";
const testePostgresIsolado = integrarPostgresIsolado ? test : test.skip;

function obterClusterIsolado() {
  const host = process.env.AMORES_PG_HOST;
  const port = Number(process.env.AMORES_PG_PORT);
  const user = process.env.AMORES_PG_USER;
  const database = process.env.AMORES_PG_DATABASE;
  const dataDirectory = path.resolve(process.env.AMORES_PG_DATA_DIRECTORY || ".");
  const pgCtl = path.resolve(process.env.AMORES_PG_CTL || ".");

  assert.equal(host, "127.0.0.1", "O teste aceita somente o cluster temporario de loopback.");
  assert.ok(Number.isInteger(port) && port > 1024 && port !== 3001 && port !== 5432);
  assert.ok(user);
  assert.match(database, /^sistema_petshop_teste_[a-z0-9_]+$/);
  assert.ok(path.isAbsolute(dataDirectory));
  assert.ok(path.isAbsolute(pgCtl));

  const relativo = path.relative(os.tmpdir(), dataDirectory);
  assert.ok(!relativo.startsWith("..") && !path.isAbsolute(relativo), "O cluster precisa ficar no TEMP.");
  assert.equal(fs.existsSync(pgCtl), true, "pg_ctl precisa ser o executavel do cluster isolado.");

  const status = spawnSync(pgCtl, ["-D", dataDirectory, "status"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  });
  assert.equal(status.status, 0, "pg_ctl nao confirmou o cluster temporario informado.");

  const pidInfo = fs.readFileSync(path.join(dataDirectory, "postmaster.pid"), "utf8").split(/\r?\n/);
  assert.ok(Number(pidInfo[0]) > 0);
  assert.equal(path.resolve(pidInfo[1]), dataDirectory);
  assert.equal(Number(pidInfo[3]), port);
  assert.ok(pidInfo[5].split(",").map((item) => item.trim()).includes(host));

  return { host, port, user, database, dataDirectory };
}

testePostgresIsolado("PostgreSQL isolado reproduz falha do GROUP BY na view 035 e executa a consulta corrigida", async () => {
  const cluster = obterClusterIsolado();
  const pool = new Pool({
    host: cluster.host,
    port: cluster.port,
    user: cluster.user,
    database: cluster.database,
    password: "somente-teste-isolado",
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const identidade = await pool.query(`
      SELECT current_database() AS database,
        current_user AS username,
        replace(current_setting('data_directory'), chr(92), '/') AS data_directory,
        host(inet_server_addr()) AS host,
        inet_server_port() AS port,
        EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sistema_petshop') AS tem_banco_real
    `);
    expect(identidade.rows[0]).toMatchObject({
      database: cluster.database,
      username: cluster.user,
      host: cluster.host,
      tem_banco_real: false,
    });
    expect(Number(identidade.rows[0].port)).toBe(cluster.port);
    expect(identidade.rows[0].data_directory.replaceAll("/", path.sep).toLowerCase())
      .toBe(cluster.dataDirectory.toLowerCase());

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE atendimentos (
          id integer PRIMARY KEY,
          pet_id integer NOT NULL,
          status varchar(30) NOT NULL,
          agendado_para timestamp without time zone NOT NULL,
          criado_em timestamp without time zone NOT NULL,
          observacoes_agendamento text
        );
        CREATE TEMP VIEW banho_tosa AS SELECT * FROM atendimentos;
        CREATE TEMP TABLE atendimento_servicos (
          id integer PRIMARY KEY,
          banho_tosa_id integer NOT NULL,
          servico_id integer NOT NULL,
          valor_unitario numeric(10,2) NOT NULL,
          duracao_minutos integer NOT NULL
        );
        CREATE TEMP VIEW banho_tosa_servicos AS SELECT * FROM atendimento_servicos;
        CREATE TEMP TABLE pets (
          id integer PRIMARY KEY,
          nome text NOT NULL,
          especie text NOT NULL,
          raca text,
          porte text,
          sexo text,
          alergias text,
          necessidades_especiais text,
          comportamento text,
          observacoes text,
          foto text
        );
        CREATE TEMP TABLE tutores (id integer PRIMARY KEY, nome text NOT NULL);
        CREATE TEMP TABLE pet_tutores (pet_id integer NOT NULL, tutor_id integer NOT NULL);
        CREATE TEMP TABLE historico_atendimentos (
          id integer PRIMARY KEY,
          banho_tosa_id integer NOT NULL,
          evento text NOT NULL,
          tutor_id integer NOT NULL,
          criado_em timestamp without time zone NOT NULL
        );
        CREATE TEMP TABLE servicos (id integer PRIMARY KEY, nome text NOT NULL);
      `);

      await client.query(`
        INSERT INTO atendimentos VALUES
          (81, 501, 'AGUARDANDO_CONFIRMACAO', '2026-10-20 10:00', '2026-10-15 09:00', 'Observacao sintetica'),
          (82, 502, 'AGUARDANDO_CONFIRMACAO', '2026-10-20 11:00', '2026-10-15 10:00', NULL);
        INSERT INTO pets VALUES
          (501, 'Pet sintetico 1', 'Cachorro', 'SRD', 'medio', 'F', NULL, NULL, NULL, NULL, '/uploads/pets/foto-sintetica-hml.png'),
          (502, 'Pet sintetico 2', 'Gato', NULL, 'pequeno', 'M', NULL, NULL, NULL, NULL, NULL);
        INSERT INTO tutores VALUES (601, 'Tutor sintetico 1'), (602, 'Tutor sintetico 2');
        INSERT INTO pet_tutores VALUES (501, 601), (502, 602);
        INSERT INTO historico_atendimentos VALUES
          (701, 81, 'SOLICITACAO_CRIADA', 601, '2026-10-15 09:00'),
          (702, 82, 'SOLICITACAO_CRIADA', 602, '2026-10-15 10:00');
        INSERT INTO servicos VALUES (901, 'Banho'), (902, 'Tosa');
        INSERT INTO atendimento_servicos VALUES
          (1001, 81, 901, 75.00, 30),
          (1002, 81, 902, 45.00, 20);
      `);

      await client.query("SAVEPOINT consulta_legada");
      let falhaConsultaAntiga;
      try {
        await client.query(SQL_LISTAR_SOLICITACOES_ANTIGA);
      } catch (erro) {
        falhaConsultaAntiga = erro;
      }
      await client.query("ROLLBACK TO SAVEPOINT consulta_legada");
      await client.query("RELEASE SAVEPOINT consulta_legada");
      expect(falhaConsultaAntiga?.code).toBe("42803");

      const resultado = await client.query(SQL_LISTAR_SOLICITACOES);
      expect(resultado.rows).toHaveLength(2);
      expect(resultado.rows[0]).toMatchObject({
        id: 81,
        pet_nome: "Pet sintetico 1",
        pet_foto: "/uploads/pets/foto-sintetica-hml.png",
        tutor_nome: "Tutor sintetico 1",
        servicos: [
          { id: 901, nome: "Banho", valor: 75, duracao_minutos: 30 },
          { id: 902, nome: "Tosa", valor: 45, duracao_minutos: 20 },
        ],
      });
      expect(resultado.rows[1]).toMatchObject({ id: 82, servicos: [] });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } finally {
    await pool.end();
  }
}, 30000);
