#!/usr/bin/env node
const path = require("node:path");
const os = require("node:os");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { DESTINO_HOMOLOGACAO, validarConfiguracaoDestino, validarIdentidadeBanco } = require("./provisionarSuperAdministradorDestino.cjs");

function argumento(nome) {
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? process.argv[indice + 1] : null;
}

async function executar() {
  const email = argumento("--email")?.trim().toLowerCase();
  const nomeBancoEsperado = argumento("--database");
  const aplicar = process.argv.includes("--apply");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !aplicar) {
    throw new Error("Uso: node src/database/provisionarSuperAdministrador.cjs --email conta@dominio --database amores_pet_homologacao --apply");
  }
  const destino = validarConfiguracaoDestino(process.env);
  if (nomeBancoEsperado !== DESTINO_HOMOLOGACAO.database) throw new Error("Banco recusado; confirme exatamente amores_pet_homologacao.");

  const pool = require("./connection");
  const client = await pool.connect();
  const readlineInterface = readline.createInterface({ input: stdin, output: stdout });
  try {
    const target = await client.query("SELECT current_database() AS database, current_user AS role, inet_server_addr()::text AS host, inet_server_port() AS port");
    validarIdentidadeBanco(target.rows[0], destino);
    stdout.write(`Destino validado: ${target.rows[0].database}, ${target.rows[0].host}:${target.rows[0].port}; role: ${target.rows[0].role}.\nConta indicada: ${email}\n`);
    const operador = (await readlineInterface.question("Nome do responsável pela execução: ")).trim();
    if (!operador || operador.length > 150) throw new Error("Informe o responsável local pela execução.");
    const confirmacao = await readlineInterface.question(`Para promover esta conta existente, digite PROMOVER ${email}: `);
    if (confirmacao !== `PROMOVER ${email}`) throw new Error("Confirmação não corresponde; nenhuma alteração foi feita.");

    await client.query("BEGIN");
    const conta = await client.query(`SELECT id, perfil, ativo FROM usuarios
      WHERE lower(email)=lower($1) FOR UPDATE`, [email]);
    if (conta.rowCount !== 1) throw new Error("A conta indicada não existe de forma única.");
    if (conta.rows[0].perfil !== "administrador" || conta.rows[0].ativo !== true) {
      throw new Error("Somente uma conta Administrador existente e ativa pode ser promovida por este script.");
    }
    const resultado = await client.query(`UPDATE usuarios
      SET perfil='super_administrador', versao_sessao=versao_sessao+1, atualizado_em=CURRENT_TIMESTAMP
      WHERE id=$1 RETURNING id`, [conta.rows[0].id]);
    const { registrarLogObrigatorio } = require("../../src/services/logService");
    await registrarLogObrigatorio({
      usuarioId: null,
      acao: "PROVISIONAR_SUPER_ADMINISTRADOR",
      entidade: "usuarios",
      registroId: resultado.rows[0].id,
      valorAnterior: { perfil: "administrador" },
      valorNovo: {
        perfil: "super_administrador",
        provisionamento_operacional: true,
        conta_promovida_id: resultado.rows[0].id,
        operador_responsavel: operador,
        conta_windows: os.userInfo().username,
      },
    }, client);
    await client.query("COMMIT");
    stdout.write("Conta promovida e registrada na auditoria. A sessão anterior da conta foi invalidada.\n");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    readlineInterface.close();
    client.release();
    await pool.end();
  }
}

executar().catch(erro => {
  console.error(`Provisionamento cancelado: ${erro.message}`);
  process.exitCode = 1;
});
