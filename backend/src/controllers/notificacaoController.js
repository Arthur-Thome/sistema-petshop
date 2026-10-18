const pool = require("../database/connection");

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 100;
const PERFIS_OPERACIONAIS = new Set(["funcionario", "gerente", "administrador", "super_administrador"]);

function converterId(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parametroPaginacao(valor, padrao, maximo = Number.MAX_SAFE_INTEGER) {
  if (valor === undefined) return padrao;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero > 0 && numero <= maximo
    ? numero
    : null;
}

function filtroNaoLidas(valor) {
  if (valor === undefined || valor === "false" || valor === "0") return false;
  if (valor === "true" || valor === "1") return true;
  return null;
}

function obterUsuarioOperacional(req, res) {
  const usuarioId = converterId(req.usuario?.id);
  if (!usuarioId) {
    res.status(401).json({ mensagem: "Sessão inválida. Faça login novamente." });
    return null;
  }
  if (!PERFIS_OPERACIONAIS.has(req.usuario?.perfil)) {
    res.status(403).json({ mensagem: "Perfil sem permissão para acessar notificações." });
    return null;
  }
  return usuarioId;
}

async function materializarAtendimentosProximos(usuarioId) {
  // Janela de 24h no fuso operacional; chave por atendimento evita duplicatas em cada polling.
  await pool.query(`
    INSERT INTO notificacoes_internas (
      usuario_id, evento, chave_dedupe, titulo, mensagem, destino
    )
    SELECT u.id, 'ATENDIMENTO_PROXIMO',
      'atendimento:proximo:' || bt.id || ':' || to_char(bt.agendado_para, 'YYYYMMDDHH24MISS'),
      'Atendimento próximo',
      'Há um atendimento previsto nas próximas 24 horas.',
      '/atendimentos/' || bt.id
    FROM usuarios u
    CROSS JOIN banho_tosa bt
    WHERE u.id = $1
      AND u.ativo = TRUE
      AND u.perfil IN ('funcionario', 'gerente', 'administrador', 'super_administrador')
      AND bt.status = 'AGENDADO'
      AND bt.agendado_para > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
      AND bt.agendado_para <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '24 hours'
    -- A data/hora integra a chave para que um reagendamento gere novo lembrete.
    -- A chave permanece estavel em consultas repetidas para o mesmo horario.
    ON CONFLICT (usuario_id, chave_dedupe) DO NOTHING
  `, [usuarioId]);
}

async function listarNotificacoes(req, res) {
  const usuarioId = obterUsuarioOperacional(req, res);
  if (!usuarioId) return res;

  const pagina = parametroPaginacao(req.query.pagina, 1);
  const limite = parametroPaginacao(req.query.limite, LIMITE_PADRAO, LIMITE_MAXIMO);
  const apenasNaoLidas = filtroNaoLidas(req.query.apenas_nao_lidas);
  if (!pagina || !limite || apenasNaoLidas === null) {
    return res.status(400).json({ mensagem: "Os filtros de notificações são inválidos." });
  }

  const offset = (pagina - 1) * limite;
  if (!Number.isSafeInteger(offset)) {
    return res.status(400).json({ mensagem: "A página informada é inválida." });
  }

  try {
    await materializarAtendimentosProximos(usuarioId);
    const [lista, contagem, preferencia] = await Promise.all([
      pool.query(`
        SELECT id, evento, titulo, mensagem, destino, criado_em, lida_em
        FROM notificacoes_internas
        WHERE usuario_id = $1
          AND ($2::boolean = FALSE OR lida_em IS NULL)
        ORDER BY criado_em DESC, id DESC
        LIMIT $3 OFFSET $4
      `, [usuarioId, apenasNaoLidas, limite, offset]),
      pool.query(`
        SELECT COUNT(*)::INTEGER AS nao_lidas
        FROM notificacoes_internas
        WHERE usuario_id = $1 AND lida_em IS NULL
      `, [usuarioId]),
      pool.query(`
        SELECT modo
        FROM preferencias_notificacao
        WHERE usuario_id = $1
      `, [usuarioId]),
    ]);

    return res.status(200).json({
      notificacoes: lista.rows,
      nao_lidas: contagem.rows[0]?.nao_lidas || 0,
      preferencia: preferencia.rows[0]?.modo || "VISUAL",
      pagina,
      limite,
    });
  } catch (erro) {
    console.error("Falha ao listar notificações internas.");
    return res.status(500).json({ mensagem: "Não foi possível carregar as notificações." });
  }
}

async function marcarNotificacaoLida(req, res) {
  const usuarioId = obterUsuarioOperacional(req, res);
  const notificacaoId = converterId(req.params.id);
  if (!usuarioId) return res;
  if (!notificacaoId) return res.status(400).json({ mensagem: "Notificação inválida." });

  try {
    const resultado = await pool.query(`
      UPDATE notificacoes_internas
      SET lida_em = COALESCE(lida_em, CURRENT_TIMESTAMP)
      WHERE id = $1 AND usuario_id = $2
      RETURNING id, lida_em
    `, [notificacaoId, usuarioId]);
    if (!resultado.rows.length) {
      return res.status(404).json({ mensagem: "Notificação não encontrada." });
    }
    return res.status(200).json({ notificacao: resultado.rows[0] });
  } catch (erro) {
    console.error("Falha ao marcar notificação como lida.");
    return res.status(500).json({ mensagem: "Não foi possível atualizar a notificação." });
  }
}

async function marcarTodasLidas(req, res) {
  const usuarioId = obterUsuarioOperacional(req, res);
  if (!usuarioId) return res;

  try {
    const resultado = await pool.query(`
      UPDATE notificacoes_internas
      SET lida_em = COALESCE(lida_em, CURRENT_TIMESTAMP)
      WHERE usuario_id = $1 AND lida_em IS NULL
    `, [usuarioId]);
    return res.status(200).json({ atualizadas: resultado.rowCount || 0 });
  } catch (erro) {
    console.error("Falha ao marcar notificações como lidas.");
    return res.status(500).json({ mensagem: "Não foi possível atualizar as notificações." });
  }
}

async function atualizarPreferencia(req, res) {
  const usuarioId = obterUsuarioOperacional(req, res);
  const modo = typeof req.body?.modo === "string" ? req.body.modo.trim().toUpperCase() : "";
  if (!usuarioId) return res;
  if (!['VISUAL', 'SONORO'].includes(modo)) {
    return res.status(400).json({ mensagem: "Escolha aviso visual ou sonoro." });
  }

  try {
    const resultado = await pool.query(`
      INSERT INTO preferencias_notificacao (usuario_id, modo, atualizado_em)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id) DO UPDATE
        SET modo = EXCLUDED.modo, atualizado_em = CURRENT_TIMESTAMP
      RETURNING modo, atualizado_em
    `, [usuarioId, modo]);
    return res.status(200).json({ preferencia: resultado.rows[0] });
  } catch (erro) {
    console.error("Falha ao atualizar preferência de notificação.");
    return res.status(500).json({ mensagem: "Não foi possível salvar a preferência." });
  }
}

module.exports = {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasLidas,
  atualizarPreferencia,
};
