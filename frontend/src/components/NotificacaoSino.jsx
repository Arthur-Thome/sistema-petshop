import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "../styles/NotificacaoSino.css";

function tocarAviso() {
  try {
    const AudioContextAtual = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextAtual) return;
    const contexto = new AudioContextAtual();
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    oscilador.frequency.value = 880;
    ganho.gain.setValueAtTime(0.12, contexto.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.18);
    oscilador.connect(ganho);
    ganho.connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.18);
    oscilador.onended = () => contexto.close();
  } catch {
    // O navegador pode bloquear áudio sem gesto do usuário.
  }
}

function NotificacaoSino() {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [preferencia, setPreferencia] = useState("VISUAL");
  const [erro, setErro] = useState("");
  const idsAnteriores = useRef(null);

  const carregar = useCallback(async function carregarNotificacoes() {
    try {
      const resposta = await api.get("/notificacoes", { params: { limite: 20 } });
      const itens = resposta.data.notificacoes || [];
      const idsAtuais = itens.filter((item) => !item.lida_em).map((item) => item.id);
      if (idsAnteriores.current && resposta.data.preferencia === "SONORO"
        && idsAtuais.some((id) => !idsAnteriores.current.has(id))) tocarAviso();
      idsAnteriores.current = new Set(idsAtuais);
      setLista(itens);
      setNaoLidas(Number(resposta.data.nao_lidas) || 0);
      setPreferencia(resposta.data.preferencia === "SONORO" ? "SONORO" : "VISUAL");
      setErro("");
    } catch (falha) {
      if (falha.response?.status === 401) return;
      setErro("Não foi possível atualizar as notificações.");
    }
  }, []);

  useEffect(() => {
    const inicio = window.setTimeout(carregar, 0);
    const timer = window.setInterval(carregar, 30000);
    const aoRetomar = () => { if (document.visibilityState === "visible") carregar(); };
    window.addEventListener("focus", aoRetomar);
    return () => {
      window.clearTimeout(inicio);
      window.clearInterval(timer);
      window.removeEventListener("focus", aoRetomar);
    };
  }, [carregar]);

  async function marcarLida(item) {
    if (!item.lida_em) {
      await api.patch("/notificacoes/" + item.id + "/lida").catch(() => {});
    }
    const destino = typeof item.destino === "string" && /^\/(?!\/)/.test(item.destino) ? item.destino : "/dashboard";
    setAberto(false);
    navegar(destino);
    carregar();
  }

  async function marcarTodas() {
    await api.patch("/notificacoes/lidas");
    await carregar();
  }

  async function alterarPreferencia(evento) {
    const modo = evento.target.value;
    try {
      await api.put("/notificacoes/preferencia", { modo });
      setPreferencia(modo);
    } catch {
      setErro("Não foi possível salvar a preferência de aviso.");
    }
  }

  return <div className="notificacao-sino">
    <button type="button" className="notificacao-botao" aria-label={"Notificações não lidas: " + naoLidas} aria-expanded={aberto} onClick={() => { setAberto((valor) => !valor); carregar(); }}>
      <span aria-hidden="true">♢</span>
      {naoLidas > 0 && <b>{naoLidas > 99 ? "99+" : naoLidas}</b>}
    </button>
    {aberto && <section className="notificacao-painel" aria-label="Central de notificações">
      <header><strong>Notificações</strong><button type="button" onClick={marcarTodas} disabled={!naoLidas}>Marcar todas como lidas</button></header>
      <label className="notificacao-preferencia">Aviso
        <select value={preferencia} onChange={alterarPreferencia}>
          <option value="VISUAL">Visual</option><option value="SONORO">Sonoro</option>
        </select>
      </label>
      {erro && <p role="alert">{erro}</p>}
      {lista.length ? <ul>{lista.map((item) => <li key={item.id} className={item.lida_em ? "" : "nao-lida"}>
        <button type="button" onClick={() => marcarLida(item)}><strong>{item.titulo}</strong><span>{item.mensagem}</span><time>{new Date(item.criado_em).toLocaleString("pt-BR")}</time></button>
      </li>)}</ul> : <p className="notificacao-vazia">Nenhuma notificação recente.</p>}
    </section>}
  </div>;
}

export default NotificacaoSino;
