const pool = require("../database/connection");

const DESCONHECIDA = "nao sei informar";
const PORTES = new Set(["pequeno", "medio", "grande", "gigante"]);

function converterId(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function racaDesconhecida(valor) {
  return String(valor || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") === DESCONHECIDA;
}

async function listarSolicitacoes(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT bt.id, bt.status, bt.agendado_para, bt.criado_em,
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
    `);
    return res.status(200).json({ solicitacoes: resultado.rows });
  } catch (erro) {
    console.error("Falha ao listar solicitações públicas pendentes.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar as solicitações." });
  }
}

async function buscarHorarioETravar(client, horarioId) {
  const dia = await client.query(`
    SELECT d.id, d.data, d.aberto, d.publicado
    FROM agenda_publica_dias d
    JOIN agenda_publica_horarios h ON h.agenda_dia_id = d.id
    WHERE h.id = $1
    FOR UPDATE OF d
  `, [horarioId]);
  if (!dia.rows.length) return null;

  const horario = await client.query(`
    SELECT h.id, h.horario, h.status, d.id AS agenda_dia_id,
      d.data, d.aberto, d.publicado
    FROM agenda_publica_horarios h
    JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
    WHERE h.id = $1
    FOR UPDATE OF h
  `, [horarioId]);
  return horario.rows[0] || null;
}

async function confirmarSolicitacao(req, res) {
  const id = converterId(req.params.id);
  const usuarioId = converterId(req.usuario?.id);
  if (!id) return res.status(400).json({ codigo: "ID_INVALIDO", mensagem: "Solicitação inválida." });
  if (!usuarioId) return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Faça login novamente." });

  const client = await pool.connect();
  let tx = false;
  try {
    await client.query("BEGIN"); tx = true;

    // A leitura inicial localiza o dia; os locks são adquiridos dia -> horário -> atendimento.
    const localizador = await client.query(
      "SELECT agenda_publica_horario_id FROM banho_tosa WHERE id = $1", [id]
    );
    if (!localizador.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(404).json({ codigo: "SOLICITACAO_NAO_ENCONTRADA", mensagem: "Solicitação não encontrada." });
    }
    const horarioId = converterId(localizador.rows[0].agenda_publica_horario_id);
    if (!horarioId) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "A solicitação não possui horário público válido." });
    }

    const horario = await buscarHorarioETravar(client, horarioId);
    if (!horario) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário não está mais disponível." });
    }

    const atendimentoResult = await client.query(
      "SELECT * FROM banho_tosa WHERE id = $1 FOR UPDATE", [id]
    );
    if (!atendimentoResult.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(404).json({ codigo: "SOLICITACAO_NAO_ENCONTRADA", mensagem: "Solicitação não encontrada." });
    }
    const atendimento = atendimentoResult.rows[0];
    if (atendimento.status !== "AGUARDANDO_CONFIRMACAO") {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "Somente solicitações pendentes podem ser confirmadas." });
    }
    if (Number(atendimento.agenda_publica_horario_id) !== horarioId || horario.status !== "RESERVADO" || !horario.aberto || !horario.publicado) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário não está mais reservado e publicado para esta solicitação." });
    }

    const futuro = await client.query(`
      SELECT (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo') > clock_timestamp() AS futuro
    `, [horario.data, horario.horario]);
    if (!futuro.rows[0]?.futuro) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_PASSADO", mensagem: "O horário já passou. Solicite ao tutor que escolha um novo horário." });
    }

    const petResult = await client.query(`
      SELECT p.id, p.ativo, p.raca, p.porte, t.ativo AS tutor_ativo
      FROM pets p
      JOIN historico_atendimentos criado
        ON criado.banho_tosa_id = $2 AND criado.evento = 'SOLICITACAO_CRIADA'
      JOIN pet_tutores pt ON pt.pet_id = p.id AND pt.tutor_id = criado.tutor_id
      JOIN tutores t ON t.id = pt.tutor_id
      WHERE p.id = $1
      FOR SHARE OF p, pt, t
    `, [atendimento.pet_id, id]);
    const pet = petResult.rows[0];
    if (!pet || !pet.ativo || !pet.tutor_ativo || !String(pet.raca || "").trim() ||
      (racaDesconhecida(pet.raca) && !PORTES.has(String(pet.porte || "")))) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "DADOS_PET_INVALIDOS", mensagem: "Os dados do pet precisam ser conferidos antes da confirmação." });
    }

    const servicosAtivos = await client.query(`
      SELECT s.id, s.ativo
      FROM banho_tosa_servicos bts
      JOIN servicos s ON s.id = bts.servico_id
      WHERE bts.banho_tosa_id = $1
      ORDER BY s.id
      FOR SHARE OF s
    `, [id]);
    if (!servicosAtivos.rows.length || servicosAtivos.rows.some((servico) => !servico.ativo)) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "SERVICO_INATIVO", mensagem: "Um serviço solicitado não está mais disponível." });
    }
    const servicos = await client.query(`
      SELECT COUNT(*)::int AS quantidade,
        COALESCE(SUM(valor_unitario), 0)::numeric AS valor_total
      FROM banho_tosa_servicos
      WHERE banho_tosa_id = $1
    `, [id]);
    const snapshot = servicos.rows[0];
    if (!snapshot || Number(snapshot.quantidade) < 1) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "SERVICO_INATIVO", mensagem: "Um serviço solicitado não está mais disponível." });
    }

    const pagamentoExistente = await client.query(
      "SELECT id FROM pagamentos_banho_tosa WHERE banho_tosa_id = $1 FOR UPDATE", [id]
    );
    if (pagamentoExistente.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "Já existe uma cobrança para esta solicitação." });
    }

    const atualizado = await client.query(`
      UPDATE banho_tosa
      SET status = 'AGENDADO', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'AGUARDANDO_CONFIRMACAO'
      RETURNING *
    `, [id]);
    if (!atualizado.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "A solicitação foi alterada por outro usuário." });
    }

    const horarioAtualizado = await client.query(`
      UPDATE agenda_publica_horarios
      SET status = 'OCUPADO', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'RESERVADO'
      RETURNING id
    `, [horarioId]);
    if (!horarioAtualizado.rows.length) throw Object.assign(new Error("HORARIO_INDISPONIVEL"), { code: "HORARIO_INDISPONIVEL" });

    const pagamento = await client.query(`
      INSERT INTO pagamentos_banho_tosa (banho_tosa_id, valor_total, status)
      VALUES ($1, $2, 'PENDENTE')
      RETURNING *
    `, [id, snapshot.valor_total]);

    await client.query(`
      INSERT INTO historico_atendimentos
        (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, tutor_id)
      VALUES ($1, 'SOLICITACAO_CONFIRMADA', 'AGUARDANDO_CONFIRMACAO', 'AGENDADO', $2, NULL)
    `, [id, usuarioId]);

    await client.query("COMMIT"); tx = false;
    return res.status(200).json({ atendimento: atualizado.rows[0], pagamento: pagamento.rows[0] });
  } catch (erro) {
    if (tx) await client.query("ROLLBACK").catch(() => {});
    if (erro.code === "23505") return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "A solicitação já possui uma cobrança." });
    if (erro.code === "HORARIO_INDISPONIVEL") return res.status(409).json({ codigo: erro.code, mensagem: "O horário foi alterado por outra operação." });
    console.error("Falha ao confirmar solicitação de atendimento.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível confirmar a solicitação." });
  } finally {
    client.release();
  }
}

async function recusarSolicitacao(req, res) {
  const id = converterId(req.params.id);
  const usuarioId = converterId(req.usuario?.id);
  const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
  if (!id) return res.status(400).json({ codigo: "ID_INVALIDO", mensagem: "Solicitação inválida." });
  if (!usuarioId) return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Faça login novamente." });
  if (!motivo || motivo.length > 2000) return res.status(400).json({ codigo: "MOTIVO_INVALIDO", mensagem: "Informe o motivo da recusa, com até 2000 caracteres." });

  const client = await pool.connect();
  let tx = false;
  try {
    await client.query("BEGIN"); tx = true;
    const localizador = await client.query("SELECT agenda_publica_horario_id FROM banho_tosa WHERE id = $1", [id]);
    if (!localizador.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(404).json({ codigo: "SOLICITACAO_NAO_ENCONTRADA", mensagem: "Solicitação não encontrada." });
    }
    const horarioId = converterId(localizador.rows[0].agenda_publica_horario_id);
    const horario = horarioId ? await buscarHorarioETravar(client, horarioId) : null;
    if (!horario) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário da solicitação não foi encontrado." });
    }
    const atual = await client.query("SELECT * FROM banho_tosa WHERE id = $1 FOR UPDATE", [id]);
    if (!atual.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(404).json({ codigo: "SOLICITACAO_NAO_ENCONTRADA", mensagem: "Solicitação não encontrada." });
    }
    const atendimento = atual.rows[0];
    if (atendimento.status !== "AGUARDANDO_CONFIRMACAO") {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "Somente solicitações pendentes podem ser recusadas." });
    }
    if (Number(atendimento.agenda_publica_horario_id) !== horarioId || horario.status !== "RESERVADO") {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário não está reservado por esta solicitação." });
    }
    const pagamentoExistente = await client.query(
      "SELECT id, status FROM pagamentos_banho_tosa WHERE banho_tosa_id = $1 FOR UPDATE",
      [id]
    );
    if (pagamentoExistente.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "A solicitação pendente possui cobrança vinculada e precisa de conferência financeira." });
    }
    const atualizado = await client.query(`
      UPDATE banho_tosa SET status = 'RECUSADO', atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'AGUARDANDO_CONFIRMACAO' RETURNING *
    `, [id]);
    if (!atualizado.rows.length) {
      await client.query("ROLLBACK"); tx = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "A solicitação foi alterada por outro usuário." });
    }

    const futuro = await client.query(`
      SELECT (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo') > clock_timestamp() AS futuro
    `, [horario.data, horario.horario]);
    const horarioLiberado = Boolean(horario.aberto && horario.publicado && futuro.rows[0]?.futuro);
    const slotAtualizado = await client.query(`
      UPDATE agenda_publica_horarios
      SET status = $1, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $2 AND status = 'RESERVADO'
      RETURNING id
    `, [horarioLiberado ? "DISPONIVEL" : "BLOQUEADO", horarioId]);
    if (!slotAtualizado.rows.length) throw Object.assign(new Error("HORARIO_INDISPONIVEL"), { code: "HORARIO_INDISPONIVEL" });
    await client.query(`
      INSERT INTO historico_atendimentos
        (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, tutor_id, motivo)
      VALUES ($1, 'SOLICITACAO_RECUSADA', 'AGUARDANDO_CONFIRMACAO', 'RECUSADO', $2, NULL, $3)
    `, [id, usuarioId, motivo]);

    await client.query("COMMIT"); tx = false;
    return res.status(200).json({
      atendimento: atualizado.rows[0],
      horario_liberado: horarioLiberado,
      aviso: horarioLiberado
        ? undefined
        : "A solicitação foi recusada e o horário permaneceu indisponível conforme a agenda.",
    });
  } catch (erro) {
    if (tx) await client.query("ROLLBACK").catch(() => {});
    console.error("Falha ao recusar solicitação de atendimento.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível recusar a solicitação." });
  } finally {
    client.release();
  }
}

async function listarHistoricoSolicitacao(req, res) {
  const id = converterId(req.params.id);
  if (!id) return res.status(400).json({ codigo: "ID_INVALIDO", mensagem: "Atendimento inválido." });
  try {
    const atendimento = await pool.query("SELECT id FROM banho_tosa WHERE id = $1", [id]);
    if (!atendimento.rows.length) return res.status(404).json({ codigo: "ATENDIMENTO_NAO_ENCONTRADO", mensagem: "Atendimento não encontrado." });
    const resultado = await pool.query(`
      SELECT h.id, h.evento, h.estado_anterior, h.estado_novo, h.motivo, h.criado_em,
        h.usuario_id, u.nome AS usuario_nome, u.perfil AS usuario_perfil,
        h.tutor_id, t.nome AS tutor_nome
      FROM historico_atendimentos h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      LEFT JOIN tutores t ON t.id = h.tutor_id
      WHERE h.banho_tosa_id = $1
      ORDER BY h.criado_em ASC, h.id ASC
    `, [id]);
    return res.status(200).json({ eventos: resultado.rows });
  } catch (erro) {
    console.error("Falha ao consultar histórico operacional do atendimento.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível carregar o histórico." });
  }
}

module.exports = { listarSolicitacoes, confirmarSolicitacao, recusarSolicitacao, listarHistoricoSolicitacao };
