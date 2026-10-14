import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import "../styles/SolicitacoesAtendimento.css";

const PERFIS = { administrador: "Administrador", gerente: "Gerente", funcionario: "Funcionário" };

function dataHora(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function racaDesconhecida(raca) {
  return String(raca || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") === "nao sei informar";
}

function SolicitacoesAtendimento() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroData, setFiltroData] = useState("todas");
  const [selecionada, setSelecionada] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [motivo, setMotivo] = useState("");
  const [modalRecusa, setModalRecusa] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      const resposta = await api.get("/atendimentos/solicitacoes");
      setSolicitacoes(resposta.data.solicitacoes || []);
    } catch (error) {
      setErro(error.response?.data?.mensagem || "Não foi possível carregar as solicitações.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function abrirDetalhes(item) {
    setSelecionada(item);
    setAviso("");
    try {
      const resposta = await api.get(`/atendimentos/${item.id}/historico`);
      setEventos(resposta.data.eventos || []);
    } catch (error) {
      setEventos([]);
      setAviso(error.response?.data?.mensagem || "Não foi possível carregar o histórico.");
    }
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const agora = Date.now();
    const inicioHoje = new Date(new Date().toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo" })).getTime();
    return solicitacoes.filter((item) => {
      const texto = [item.pet_nome, item.tutor_nome, item.pet_raca, item.pet_especie,
        ...(Array.isArray(item.servicos) ? item.servicos.map((s) => s.nome) : [])]
        .join(" ").toLocaleLowerCase("pt-BR");
      if (termo && !texto.includes(termo)) return false;
      const data = new Date(item.agendado_para).getTime();
      if (filtroData === "hoje" && (data < inicioHoje || data >= inicioHoje + 86400000)) return false;
      if (filtroData === "futuras" && data >= 0 && data < agora) return false;
      if (filtroData === "passadas" && data >= agora) return false;
      return true;
    });
  }, [solicitacoes, busca, filtroData]);

  async function confirmar() {
    if (!selecionada) return;
    try {
      setProcessando(true);
      await api.patch(`/atendimentos/${selecionada.id}/confirmar`);
      await carregar();
      await abrirDetalhes({ ...selecionada, status: "AGENDADO" });
      setAviso("Solicitação confirmada. Cobrança pendente criada.");
    } catch (error) {
      setAviso(error.response?.data?.mensagem || "Não foi possível confirmar a solicitação.");
    } finally {
      setProcessando(false);
    }
  }

  async function recusar(event) {
    event.preventDefault();
    if (!selecionada || !motivo.trim()) return;
    try {
      setProcessando(true);
      const resposta = await api.patch(`/atendimentos/${selecionada.id}/recusar`, { motivo });
      setModalRecusa(false);
      setMotivo("");
      await carregar();
      await abrirDetalhes({ ...selecionada, status: "RECUSADO" });
      setAviso(resposta.data.aviso || "Solicitação recusada.");
    } catch (error) {
      setAviso(error.response?.data?.mensagem || "Não foi possível recusar a solicitação.");
    } finally {
      setProcessando(false);
    }
  }

  const temStatusPendente = selecionada?.status === "AGUARDANDO_CONFIRMACAO";
  const horarioPassado = selecionada && new Date(selecionada.agendado_para).getTime() <= Date.now();

  return (
    <div className="solicitacoes-page">
      <header className="solicitacoes-header">
        <div><span className="solicitacoes-eyebrow">ATENDIMENTOS</span><h1>Solicitações públicas</h1>
          <p>Revise os dados e confirme ou recuse cada pedido recebido.</p></div>
        <button type="button" className="solicitacoes-atualizar" onClick={carregar} disabled={carregando}>Atualizar</button>
      </header>

      <div className="solicitacoes-filtros">
        <label>Buscar<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pet, tutor ou serviço" /></label>
        <label>Data do horário<select value={filtroData} onChange={(e) => setFiltroData(e.target.value)}>
          <option value="todas">Todas</option><option value="hoje">Hoje</option><option value="futuras">Futuras</option><option value="passadas">Já passaram</option>
        </select></label>
        <strong>{filtradas.length} pendente{filtradas.length === 1 ? "" : "s"}</strong>
      </div>

      {erro && <div className="solicitacoes-mensagem erro">{erro}</div>}
      {carregando ? <div className="solicitacoes-mensagem">Carregando solicitações…</div> : filtradas.length === 0 ?
        <div className="solicitacoes-vazio"><h2>Nenhuma solicitação pendente</h2><p>Novos pedidos aparecerão nesta fila quando a página for atualizada.</p></div> :
        <div className="solicitacoes-lista">{filtradas.map((item) => <article className="solicitacao-card" key={item.id}>
          <div className="solicitacao-card-principal"><div><span className="solicitacao-data">Recebida em {dataHora(item.criado_em)}</span>
            <h2>{item.pet_nome}</h2><p>Tutor: {item.tutor_nome}</p></div><span className="solicitacao-status">Aguardando confirmação</span></div>
          <div className="solicitacao-card-dados">
            <div className="solicitacao-raca"><span>Raça</span><strong>{racaDesconhecida(item.pet_raca) ? `Raça não identificada — Porte: ${item.pet_porte || "não informado"}` : item.pet_raca || "Não cadastrada"}</strong>
              {racaDesconhecida(item.pet_raca) && <small>A equipe deverá conferir a raça.</small>}</div>
            <div><span>Espécie / porte</span><strong>{item.pet_especie || "—"} · {item.pet_porte || "não informado"}</strong></div>
            <div><span>Data e horário</span><strong>{dataHora(item.agendado_para)}</strong></div>
            <div><span>Serviços</span><strong>{(item.servicos || []).map((s) => s.nome).filter(Boolean).join(", ") || "—"}</strong></div>
          </div>
          <button type="button" className="solicitacao-detalhes-btn" onClick={() => abrirDetalhes(item)}>Abrir detalhes</button>
        </article>)}</div>}

      {selecionada && <div className="solicitacao-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelecionada(null); }}>
        <section className="solicitacao-modal" role="dialog" aria-modal="true" aria-labelledby="solicitacao-modal-titulo">
          <header><div><span className="solicitacoes-eyebrow">SOLICITAÇÃO #{selecionada.id}</span><h2 id="solicitacao-modal-titulo">{selecionada.pet_nome}</h2></div>
            <button type="button" aria-label="Fechar" onClick={() => setSelecionada(null)}>×</button></header>
          {aviso && <div className="solicitacoes-mensagem">{aviso}</div>}
          <div className="solicitacao-modal-dados">
            <div className="solicitacao-raca"><span>Raça do pet</span><strong>{racaDesconhecida(selecionada.pet_raca) ? `Raça não identificada — Porte: ${selecionada.pet_porte || "não informado"}` : selecionada.pet_raca || "Não cadastrada"}</strong>
              {racaDesconhecida(selecionada.pet_raca) && <small>Conferência da raça pendente pela equipe.</small>}</div>
            <p><b>Espécie:</b> {selecionada.pet_especie || "—"} <b>· Porte:</b> {selecionada.pet_porte || "—"} <b>· Sexo:</b> {selecionada.pet_sexo || "—"}</p>
            <p><b>Tutor:</b> {selecionada.tutor_nome}</p><p><b>Horário:</b> {dataHora(selecionada.agendado_para)}</p><p><b>Solicitada em:</b> {dataHora(selecionada.criado_em)}</p>
            <p><b>Serviços:</b> {(selecionada.servicos || []).map((s) => `${s.nome} (${Number(s.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`).join(", ") || "—"}</p>
            <p><b>Observações do pedido:</b> {selecionada.observacoes_agendamento || "Nenhuma"}</p>
            <p><b>Alergias:</b> {selecionada.pet_alergias || "Nenhuma informada"}</p><p><b>Necessidades especiais:</b> {selecionada.pet_necessidades_especiais || "Nenhuma informada"}</p>
            <p><b>Comportamento:</b> {selecionada.pet_comportamento || "Nenhuma observação"}</p><p><b>Observações do pet:</b> {selecionada.pet_observacoes || "Nenhuma"}</p>
          </div>
          <div className="solicitacao-eventos"><h3>Histórico operacional</h3>{eventos.length === 0 ? <p>Sem eventos disponíveis.</p> : eventos.map((evento) => <div key={evento.id || `${evento.evento}-${evento.criado_em}`}>
            <strong>{evento.evento === "SOLICITACAO_CRIADA" ? "Solicitação recebida" : evento.evento === "SOLICITACAO_CONFIRMADA" ? "Solicitação confirmada" : evento.evento === "SOLICITACAO_RECUSADA" ? "Solicitação recusada" : evento.evento}</strong>
            <span>{evento.tutor_nome || evento.usuario_nome || "Equipe"} · {dataHora(evento.criado_em)}{evento.usuario_perfil ? ` · ${PERFIS[evento.usuario_perfil] || evento.usuario_perfil}` : ""}</span>
            {evento.motivo && <p>Motivo: {evento.motivo}</p>}
          </div>)}</div>
          {temStatusPendente && <footer className="solicitacao-modal-acoes">
            <button type="button" onClick={() => setModalRecusa(true)} disabled={processando} className="solicitacao-recusar">Recusar</button>
            <button type="button" onClick={confirmar} disabled={processando || horarioPassado} className="solicitacao-confirmar" title={horarioPassado ? "Horário passado: solicite reagendamento ao tutor." : "Confirmar solicitação"}>{processando ? "Processando…" : "Confirmar solicitação"}</button>
          </footer>}
          {horarioPassado && temStatusPendente && <p className="solicitacao-aviso-passado">Este horário já passou. Solicite um novo horário ao tutor antes de confirmar.</p>}
        </section>
      </div>}

      {modalRecusa && <div className="solicitacao-modal-backdrop solicitacao-modal-secundario" role="presentation"><form className="solicitacao-modal solicitacao-modal-motivo" onSubmit={recusar}>
        <header><div><span className="solicitacoes-eyebrow">RECUSA</span><h2>Recusar solicitação</h2></div><button type="button" aria-label="Fechar" onClick={() => setModalRecusa(false)}>×</button></header>
        <label>Motivo da recusa<textarea required minLength={1} maxLength={2000} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
        <p>O motivo será preservado no histórico operacional.</p>
        <footer className="solicitacao-modal-acoes"><button type="button" onClick={() => setModalRecusa(false)}>Voltar</button><button type="submit" className="solicitacao-recusar" disabled={processando || !motivo.trim()}>{processando ? "Salvando…" : "Confirmar recusa"}</button></footer>
      </form></div>}
    </div>
  );
}

export default SolicitacoesAtendimento;
