import { useState } from "react";
import api from "../services/api";

const ENTIDADES = [
  ["tutores", "Tutor inativo"], ["pets", "Pet inativo"],
  ["produtos", "Produto inativo e sem saldo"], ["servicos", "Serviço inativo"],
  ["usuarios", "Usuário desativado"], ["site_galeria", "Imagem removida da Galeria"],
  ["site_premiacoes", "Conteúdo do site removido"], ["agenda_publica_horarios", "Horário sem reservas"],
];

function ExclusoesDefinitivas() {
  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "{}"); } catch { return {}; }
  })();
  const [entidade, setEntidade] = useState("tutores");
  const [id, setId] = useState("");
  const [preview, setPreview] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [irreversivel, setIrreversivel] = useState(false);
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");

  async function verificar(evento) {
    evento.preventDefault();
    setCarregando(true); setErro(""); setResultado(""); setPreview(null);
    try {
      const { data } = await api.get(`/exclusoes-definitivas/${entidade}/${id}`);
      setPreview(data);
    } catch (error) {
      setErro(error.response?.data?.mensagem || "Não foi possível consultar o registro.");
    } finally { setCarregando(false); }
  }

  async function excluir(evento) {
    evento.preventDefault();
    if (!preview?.elegivel) return;
    setCarregando(true); setErro(""); setResultado("");
    const contexto = { motivo: motivo.trim(), confirmacao, confirmacao_irreversivel: irreversivel };
    try {
      const autorizacao = await api.post("/operacoes/autorizacoes", {
        operacao: "PERMANENT_DELETE", entidade, registro_id: Number(id), contexto,
        autorizador_id: Number(usuario.id), senha,
      });
      const resposta = await api.delete(`/exclusoes-definitivas/${entidade}/${id}`, {
        data: contexto,
        headers: { "X-Operation-Authorization": autorizacao.data.autorizacao },
      });
      setResultado(resposta.data.mensagem);
      setPreview(null); setMotivo(""); setConfirmacao(""); setIrreversivel(false); setSenha("");
    } catch (error) {
      setErro(error.response?.data?.mensagem || "A exclusão não foi concluída.");
      setSenha("");
    } finally { setCarregando(false); }
  }

  function cancelarExclusao() {
    setPreview(null);
    setMotivo("");
    setConfirmacao("");
    setIrreversivel(false);
    setSenha("");
    setErro("");
    setResultado("");
  }

  return <main className="conteudo-site">
    <header className="conteudo-site-cabecalho"><div><span>Segurança · Super Administrador</span><h1>Exclusões definitivas</h1><p>Operações individuais, com verificação de dependências, senha confirmada e auditoria. Não há exclusão em massa.</p></div></header>
    <section className="conteudo-card">
      <h2>Consultar elegibilidade</h2>
      <p>Pagamentos, estornos, movimentações, auditoria, atendimentos realizados e solicitações com histórico não podem ser excluídos.</p>
      <form className="conteudo-editor" onSubmit={verificar}>
        <label className="conteudo-campo"><span>Entidade</span><select value={entidade} onChange={e => { setEntidade(e.target.value); setPreview(null); }}>
          {ENTIDADES.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
        </select></label>
        <label className="conteudo-campo"><span>Identificador do registro</span><input type="number" min="1" required value={id} onChange={e => { setId(e.target.value); setPreview(null); }} /></label>
        <button className="secondary-button" disabled={carregando || !id}>Verificar dependências</button>
      </form>
      {erro && <p className="conteudo-alerta erro" role="alert">{erro}</p>}
      {resultado && <p className="conteudo-alerta sucesso" role="status">{resultado}</p>}
      {preview && <div className="conteudo-editor" aria-live="polite">
        <h3>{preview.entidade} · ID {id}</h3>
        <pre>{JSON.stringify(preview.registro, null, 2)}</pre>
        {preview.elegivel ? <>
          <p>Não foram encontradas dependências. Confirme o motivo e os dados acima antes de prosseguir.</p>
          <form onSubmit={excluir}>
            <label className="conteudo-campo"><span>Motivo obrigatório (10–500 caracteres)</span><textarea required minLength={10} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
            <label className="conteudo-campo"><span>Digite EXCLUIR {id}</span><input required value={confirmacao} onChange={e => setConfirmacao(e.target.value)} /></label>
            <label className="conteudo-check"><input type="checkbox" checked={irreversivel} onChange={e => setIrreversivel(e.target.checked)} /> Confirmo que a operação é irreversível</label>
            <label className="conteudo-campo"><span>Senha do Super Administrador</span><input type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} /></label>
            <div className="conteudo-acoes">
              <button type="button" className="secondary-button" disabled={carregando} onClick={cancelarExclusao}>Cancelar</button>
              <button className="primary-button perigo" disabled={carregando || confirmacao !== `EXCLUIR ${id}` || !irreversivel || motivo.trim().length < 10}>Excluir definitivamente</button>
            </div>
          </form>
        </> : <>
          <p role="status">{preview.motivo_bloqueio}</p>
          <button type="button" className="secondary-button" onClick={cancelarExclusao}>Cancelar</button>
        </>}
      </div>}
    </section>
  </main>;
}

export default ExclusoesDefinitivas;
