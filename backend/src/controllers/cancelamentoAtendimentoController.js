const pool = require("../database/connection");
const { registrarLog } = require("../services/logService");

function converterId(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function registrarLogSeguro(dados) {
  try {
    await registrarLog(dados);
  } catch {
    console.error("Cancelamento concluído, mas a auditoria auxiliar falhou.");
  }
}

async function cancelarAgendamento(req, res) {
  const atendimentoId = converterId(req.params.id);
  const usuarioId = converterId(req.usuario?.id);
  const motivo = typeof req.body?.motivo_cancelamento === "string"
    ? req.body.motivo_cancelamento.trim()
    : "";

  if (!atendimentoId) {
    return res.status(400).json({ codigo: "ID_INVALIDO", mensagem: "Informe um atendimento válido." });
  }
  if (!usuarioId) {
    return res.status(401).json({ codigo: "SESSAO_INVALIDA", mensagem: "Faça login novamente." });
  }
  if (!motivo || motivo.length > 2000) {
    return res.status(400).json({ codigo: "MOTIVO_INVALIDO", mensagem: "Informe o motivo do cancelamento, com até 2000 caracteres." });
  }

  const client = await pool.connect();
  let transacao = false;
  try {
    await client.query("BEGIN");
    transacao = true;

    // Leitura inicial sem lock somente localiza o slot. Locks definitivos seguem dia -> slot -> atendimento -> pagamento.
    const localizador = await client.query(
      "SELECT agenda_publica_horario_id FROM banho_tosa WHERE id = $1",
      [atendimentoId]
    );
    if (!localizador.rows.length) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(404).json({ codigo: "ATENDIMENTO_NAO_ENCONTRADO", mensagem: "Atendimento não encontrado." });
    }

    const horarioId = converterId(localizador.rows[0].agenda_publica_horario_id);
    let horario = null;
    if (horarioId) {
      const dia = await client.query(`
        SELECT d.id
        FROM agenda_publica_dias d
        JOIN agenda_publica_horarios h ON h.agenda_dia_id = d.id
        WHERE h.id = $1
        FOR UPDATE OF d
      `, [horarioId]);
      if (!dia.rows.length) {
        await client.query("ROLLBACK"); transacao = false;
        return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O dia do horário não existe mais." });
      }
      const slot = await client.query(`
        SELECT h.id, h.status, h.horario, d.data, d.aberto, d.publicado
        FROM agenda_publica_horarios h
        JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
        WHERE h.id = $1
        FOR UPDATE OF h
      `, [horarioId]);
      horario = slot.rows[0] || null;
      if (!horario) {
        await client.query("ROLLBACK"); transacao = false;
        return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário não existe mais." });
      }
    }

    const resultadoAtendimento = await client.query(
      "SELECT * FROM banho_tosa WHERE id = $1 FOR UPDATE",
      [atendimentoId]
    );
    if (!resultadoAtendimento.rows.length) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(404).json({ codigo: "ATENDIMENTO_NAO_ENCONTRADO", mensagem: "Atendimento não encontrado." });
    }
    const anterior = resultadoAtendimento.rows[0];
    if (!["AGUARDANDO_CONFIRMACAO", "AGENDADO"].includes(anterior.status)) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "Somente solicitações pendentes ou atendimentos agendados podem ser cancelados." });
    }
    if (anterior.status === "AGUARDANDO_CONFIRMACAO" && !horarioId) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "A solicitação pendente não possui horário vinculado." });
    }
    if (converterId(anterior.agenda_publica_horario_id) !== horarioId) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O vínculo do horário foi alterado durante o cancelamento." });
    }
    if (horario) {
      const esperado = anterior.status === "AGUARDANDO_CONFIRMACAO" ? "RESERVADO" : "OCUPADO";
      if (horario.status !== esperado) {
        await client.query("ROLLBACK"); transacao = false;
        return res.status(409).json({ codigo: "HORARIO_INDISPONIVEL", mensagem: "O horário não está reservado por este atendimento." });
      }
    }

    const pagamentos = await client.query(
      "SELECT * FROM pagamentos_banho_tosa WHERE banho_tosa_id = $1 FOR UPDATE",
      [atendimentoId]
    );
    if (pagamentos.rows.length > 1) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "Há cobranças duplicadas; o cancelamento não foi realizado." });
    }
    const pagamentoAnterior = pagamentos.rows[0] || null;
    if (pagamentoAnterior?.status === "PAGO") {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "PAGAMENTO_EXIGE_ESTORNO", mensagem: "Faça o estorno autorizado antes de cancelar o atendimento." });
    }
    if (pagamentoAnterior && !["PENDENTE", "ESTORNADO"].includes(pagamentoAnterior.status)) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "O estado da cobrança não permite cancelar com segurança." });
    }

    const resultado = await client.query(`
      UPDATE banho_tosa
      SET status = 'CANCELADO', motivo_cancelamento = $1,
          usuario_cancelamento_id = $2,
          cancelado_em = clock_timestamp() AT TIME ZONE 'America/Sao_Paulo',
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $3 AND status IN ('AGUARDANDO_CONFIRMACAO', 'AGENDADO')
      RETURNING *
    `, [motivo, usuarioId, atendimentoId]);
    if (!resultado.rows.length) {
      await client.query("ROLLBACK"); transacao = false;
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "O atendimento foi alterado por outra operação." });
    }
    const atendimento = resultado.rows[0];

    let pagamentoCancelado = null;
    if (pagamentoAnterior?.status === "PENDENTE") {
      const pagamentoAtualizado = await client.query(`
        UPDATE pagamentos_banho_tosa
        SET status = 'CANCELADO', atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'PENDENTE'
        RETURNING *
      `, [pagamentoAnterior.id]);
      if (!pagamentoAtualizado.rows.length) {
        await client.query("ROLLBACK"); transacao = false;
        return res.status(409).json({ codigo: "FINANCEIRO_INCONSISTENTE", mensagem: "A cobrança mudou durante o cancelamento." });
      }
      pagamentoCancelado = pagamentoAtualizado.rows[0];
    }

    let horarioLiberado = false;
    if (horario) {
      const futuro = await client.query(`
        SELECT (($1::date + $2::time) AT TIME ZONE 'America/Sao_Paulo') > clock_timestamp() AS futuro
      `, [horario.data, horario.horario]);
      horarioLiberado = Boolean(horario.aberto && horario.publicado && futuro.rows[0]?.futuro);
      const slotAtualizado = await client.query(`
        UPDATE agenda_publica_horarios
        SET status = $1, atualizado_por = $2, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $3 AND status = $4
        RETURNING id
      `, [horarioLiberado ? "DISPONIVEL" : "BLOQUEADO", usuarioId, horarioId,
        anterior.status === "AGUARDANDO_CONFIRMACAO" ? "RESERVADO" : "OCUPADO"]);
      if (!slotAtualizado.rows.length) throw Object.assign(new Error("HORARIO_INDISPONIVEL"), { code: "HORARIO_INDISPONIVEL" });
    }

    await client.query(`
      INSERT INTO historico_atendimentos
        (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, tutor_id, motivo, criado_em)
      VALUES ($1, 'ATENDIMENTO_CANCELADO', $2, 'CANCELADO', $3, NULL, $4, clock_timestamp())
    `, [atendimentoId, anterior.status, usuarioId, motivo]);

    await client.query("COMMIT");
    transacao = false;

    await registrarLogSeguro({
      usuarioId, acao: "CANCELAR_BANHO_TOSA", entidade: "banho_tosa",
      registroId: atendimento.id, valorAnterior: anterior, valorNovo: atendimento, ip: req.ip,
    });
    if (pagamentoCancelado) {
      await registrarLogSeguro({
        usuarioId, acao: "CANCELAR_PAGAMENTO_BANHO_TOSA", entidade: "pagamentos_banho_tosa",
        registroId: pagamentoCancelado.id, valorAnterior: pagamentoAnterior, valorNovo: pagamentoCancelado, ip: req.ip,
      });
    }

    return res.status(200).json({
      mensagem: "Agendamento cancelado com sucesso.",
      atendimento,
      pagamento: pagamentoCancelado || pagamentoAnterior,
      horario_liberado: horarioLiberado,
      aviso: horario && !horarioLiberado ? "O atendimento foi cancelado e o horário permaneceu indisponível conforme a agenda." : undefined,
    });
  } catch (erro) {
    if (transacao) await client.query("ROLLBACK").catch(() => {});
    if (erro.code === "HORARIO_INDISPONIVEL") {
      return res.status(409).json({ codigo: erro.code, mensagem: "O horário foi alterado durante o cancelamento." });
    }
    if (erro.code === "23505") {
      return res.status(409).json({ codigo: "ESTADO_INCOMPATIVEL", mensagem: "Outra operação já alterou o atendimento." });
    }
    console.error("Falha ao cancelar atendimento.");
    return res.status(500).json({ codigo: "ERRO_INTERNO", mensagem: "Não foi possível cancelar o atendimento." });
  } finally {
    client.release();
  }
}

module.exports = cancelarAgendamento;
