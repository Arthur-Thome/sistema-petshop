const pool = require("../database/connection");
const { registrarLogObrigatorio } = require("./logService");
const { consumirAutorizacao } = require("./operationAuthorizationService");
const { processarArquivoExcluido } = require("./permanentFileDeletionService");

const ENTIDADES = Object.freeze({
  tutores: {
    table: "tutores", label: "Tutor", active: "ativo = FALSE",
    preview: "SELECT id, nome, email, ativo FROM public.tutores WHERE id = $1",
  },
  pets: {
    table: "pets", label: "Pet", active: "ativo = FALSE",
    preview: "SELECT id, nome, especie, raca, ativo FROM public.pets WHERE id = $1",
  },
  produtos: {
    table: "produtos", label: "Produto", active: "ativo = FALSE AND quantidade_atual = 0",
    preview: "SELECT id, nome, quantidade_atual, quantidade_minima, ativo FROM public.produtos WHERE id = $1",
  },
  servicos: {
    table: "servicos", label: "Serviço", active: "ativo = FALSE",
    preview: "SELECT id, nome, valor, duracao_minutos, ativo FROM public.servicos WHERE id = $1",
  },
  usuarios: {
    table: "usuarios", label: "Usuário", active: "ativo = FALSE",
    preview: "SELECT id, nome, email, perfil, ativo FROM public.usuarios WHERE id = $1",
  },
  site_galeria: {
    table: "site_galeria", label: "Imagem da Galeria", active: "removido_em IS NOT NULL AND publicado = FALSE",
    preview: "SELECT id, titulo, categoria, removido_em, publicado, arquivo_nome FROM public.site_galeria WHERE id = $1",
  },
  site_premiacoes: {
    table: "site_premiacoes", label: "Conteúdo do site", active: "removido_em IS NOT NULL AND publicado = FALSE",
    preview: "SELECT id, titulo, instituicao, ano, removido_em, publicado FROM public.site_premiacoes WHERE id = $1",
  },
  agenda_publica_horarios: {
    table: "agenda_publica_horarios", label: "Horário da Agenda Pública", active: "status <> 'OCUPADO'",
    preview: `SELECT h.id, d.data, h.horario, h.status
        FROM public.agenda_publica_horarios h
        JOIN public.agenda_publica_dias d ON d.id = h.agenda_dia_id
       WHERE h.id = $1`,
  },
});

function obterEntidade(nome) {
  const entidade = ENTIDADES[nome];
  if (!entidade) throw Object.assign(new Error("Esta entidade não pode ser excluída definitivamente."), { status: 400 });
  return entidade;
}

async function obterDependencias(executor, tabela, id) {
  const referencias = await executor.query(`
    SELECT ns.nspname AS schema_name, rel.relname AS table_name, att.attname AS column_name
      FROM pg_constraint fk
      JOIN pg_class rel ON rel.oid = fk.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN unnest(fk.conkey) WITH ORDINALITY local_key(attnum, ord) ON TRUE
      JOIN unnest(fk.confkey) WITH ORDINALITY remote_key(attnum, ord) USING (ord)
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = local_key.attnum
      JOIN pg_attribute remote_att ON remote_att.attrelid = fk.confrelid AND remote_att.attnum = remote_key.attnum
     WHERE fk.contype = 'f' AND fk.confrelid = to_regclass($1)
       AND ns.nspname = 'public' AND remote_att.attname = 'id'
  `, [`public.${tabela}`]);
  const encontrados = [];
  for (const ref of referencias.rows) {
    const schema = `"${String(ref.schema_name).replaceAll('"', '""')}"`;
    const rel = `"${String(ref.table_name).replaceAll('"', '""')}"`;
    const coluna = `"${String(ref.column_name).replaceAll('"', '""')}"`;
    const existe = await executor.query(`SELECT EXISTS (SELECT 1 FROM ${schema}.${rel} WHERE ${coluna} = $1) AS existe`, [id]);
    if (existe.rows[0]?.existe) encontrados.push({ tabela: ref.table_name });
  }
  return encontrados;
}

async function avaliar(executor, entityName, id, { lock = false } = {}) {
  const entity = obterEntidade(entityName);
  const idNumber = Number(id);
  if (!Number.isSafeInteger(idNumber) || idNumber < 1) throw Object.assign(new Error("Identificador inválido."), { status: 400 });
  const rowResult = await executor.query(`${entity.preview}${lock ? " FOR UPDATE" : ""}`, [idNumber]);
  const row = rowResult.rows[0];
  if (!row) throw Object.assign(new Error("Registro não encontrado."), { status: 404 });
  const eligibility = await executor.query(`SELECT (${entity.active}) AS elegivel FROM public.${entity.table} WHERE id=$1`, [idNumber]);
  const dependencias = await obterDependencias(executor, entity.table, idNumber);
  const elegivel = eligibility.rows[0]?.elegivel === true && dependencias.length === 0;
  return { entity, row, dependencias, elegivel };
}

async function consultar(entityName, id) {
  const result = await avaliar(pool, entityName, id);
  const { arquivo_nome: _arquivoNome, ...registro } = result.row;
  return {
    entidade: result.entity.label,
    registro,
    elegivel: result.elegivel,
    dependencias: result.dependencias.map(item => item.tabela),
    motivo_bloqueio: !result.elegivel
      ? result.dependencias.length ? "Existem registros dependentes que precisam ser preservados." : "O registro não atende aos critérios de inativação e saldo definidos."
      : null,
  };
}

async function excluir({ entityName, id, reason, phrase, confirmed, token, requesterId, ip }) {
  const entity = obterEntidade(entityName);
  const idNumber = Number(id);
  const context = { motivo: reason, confirmacao: phrase, confirmacao_irreversivel: confirmed };
  // Consome a autorização única antes de revalidar e bloquear o registro.
  // Se uma dependência surgir entre a prévia e a exclusão, o token é consumido
  // e a operação falha fechada; o usuário precisa revisar e autorizar de novo.
  const auth = await consumirAutorizacao({ token, requesterId, operation: "PERMANENT_DELETE", entity: entityName, resourceId: idNumber, context, ip });
  const client = await pool.connect();
  let filaArquivoId = null;
  try {
    await client.query("BEGIN");
    const result = await avaliar(client, entityName, idNumber, { lock: true });
    if (!result.elegivel) throw Object.assign(new Error("O registro possui dependências ou não atende aos critérios de exclusão."), { status: 409 });
    if (entityName === "site_galeria") {
      const fila = await client.query(`INSERT INTO permanent_file_deletion_queue (resource_kind, object_key)
        VALUES ('SITE_GALLERY', $1) RETURNING id`, [result.row.arquivo_nome]);
      filaArquivoId = fila.rows[0].id;
    }
    const deleted = await client.query(`DELETE FROM public.${entity.table} WHERE id=$1 RETURNING id`, [idNumber]);
    if (deleted.rowCount !== 1) throw Object.assign(new Error("O registro foi alterado por outra operação."), { status: 409 });
    await registrarLogObrigatorio({
      usuarioId: requesterId,
      acao: "EXCLUSAO_DEFINITIVA",
      entidade: entityName,
      registroId: idNumber,
      valorNovo: { entidade: entity.label, registro_id: idNumber, motivo: String(reason).trim(), solicitante_id: auth.requesterId, autorizador_id: auth.authorizerId },
      ip,
    }, client);
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    client.release();
  }
  const arquivoPendente = filaArquivoId ? !(await processarArquivoExcluido(filaArquivoId)) : false;
  return { arquivoPendente };
}

module.exports = { ENTIDADES, consultar, excluir, avaliar };
