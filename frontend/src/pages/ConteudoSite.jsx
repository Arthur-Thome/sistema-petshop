import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import "../styles/ConteudoSite.css";
import "../styles/ModalConfirmacaoSenha.css";

const ABAS = [
  ["inicio", "Página inicial"],
  ["institucional", "História e informações"],
  ["contato", "Endereço e contatos"],
  ["premios", "Prêmios e conquistas"],
  ["galeria", "Galeria de fotos"],
];

const CONFIG_VAZIA = {
  titulo_principal: "", subtitulo_principal: "", apresentacao: "",
  historia_titulo: "", historia: "", missao: "", diferenciais: "",
  destaque_institucional: "", servicos_titulo: "", servicos_texto: "",
  galeria_titulo: "", texto_rodape: "", horario_funcionamento: "",
  nome_comercial: "", telefone: "", whatsapp: "", email: "", cep: "",
  logradouro: "", numero: "", complemento: "", bairro: "", cidade: "",
  uf: "", google_maps_url: "", imagem_principal_id: "", imagem_historia_id: "",
};

const PREMIO_VAZIO = { titulo: "", descricao: "", instituicao: "", ano: "", imagem_galeria_id: "", ordem: 0, publicado: false };
const FOTO_VAZIA = { titulo: "", legenda: "", texto_alternativo: "", categoria: "", ordem: 0, publicado: false };

async function hashArquivo(arquivo) {
  const digest = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return [...new Uint8Array(digest)].map(valor => valor.toString(16).padStart(2, "0")).join("");
}

function ConteudoSite() {
  const usuarioAtual = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "{}"); } catch { return {}; }
  })();
  const somenteGaleria = ["gerente", "funcionario"].includes(usuarioAtual.perfil);
  const abasDisponiveis = somenteGaleria ? ABAS.filter(([id]) => id === "galeria") : ABAS;
  const [aba, setAba] = useState(somenteGaleria ? "galeria" : "inicio");
  const [config, setConfig] = useState(CONFIG_VAZIA);
  const [premios, setPremios] = useState([]);
  const [galeria, setGaleria] = useState([]);
  const [previews, setPreviews] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [premio, setPremio] = useState(PREMIO_VAZIO);
  const [premioId, setPremioId] = useState(null);
  const [foto, setFoto] = useState(FOTO_VAZIA);
  const [fotoId, setFotoId] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [previewLocal, setPreviewLocal] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [dialogAutorizacao, setDialogAutorizacao] = useState(null);
  const [erroAutorizacao, setErroAutorizacao] = useState("");
  const resolucaoAutorizacao = useRef(null);

  function solicitarAutorizacao(operacao, registroId, contexto = null) {
    if (!somenteGaleria) return Promise.resolve({ headers: {} });
    return api.get("/operacoes/autorizacoes/autorizadores").then(({ data }) => new Promise((resolve) => {
      resolucaoAutorizacao.current = resolve;
      setErroAutorizacao("");
      setDialogAutorizacao({ operacao, registroId, contexto, autorizadores: data });
    }));
  }

  async function confirmarAutorizacao(evento) {
    evento.preventDefault();
    if (!dialogAutorizacao) return;
    const elementoFormulario = evento.currentTarget;
    const form = new FormData(elementoFormulario);
    try {
      const { data } = await api.post("/operacoes/autorizacoes", {
        operacao: dialogAutorizacao.operacao,
        entidade: "site_galeria",
        registro_id: dialogAutorizacao.registroId,
        contexto: dialogAutorizacao.contexto,
        autorizador_id: Number(form.get("autorizador_id")),
        senha: form.get("senha"),
      });
      const resolver = resolucaoAutorizacao.current;
      resolucaoAutorizacao.current = null;
      setDialogAutorizacao(null);
      setErroAutorizacao("");
      resolver?.({ headers: { "X-Operation-Authorization": data.autorizacao } });
    } catch (error) {
      setErroAutorizacao(error.response?.data?.mensagem || "Não foi possível autorizar esta alteração.");
    } finally {
      elementoFormulario.reset();
    }
  }

  function cancelarAutorizacao() {
    const resolver = resolucaoAutorizacao.current;
    resolucaoAutorizacao.current = null;
    setDialogAutorizacao(null);
    resolver?.(null);
  }

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      const { data } = await api.get(somenteGaleria ? "/site-conteudo/admin/galeria" : "/site-conteudo/admin");
      setConfig({ ...CONFIG_VAZIA, ...(data.configuracoes || {}) });
      setPremios(data.premios || []);
      setGaleria(data.galeria || []);
    } catch (error) {
      setErro(error.response?.data?.mensagem || "Não foi possível carregar o conteúdo do site.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    async function carregarInicial() {
      try {
        const { data } = await api.get(somenteGaleria ? "/site-conteudo/admin/galeria" : "/site-conteudo/admin");
        if (!ativo) return;
        setConfig({ ...CONFIG_VAZIA, ...(data.configuracoes || {}) });
        setPremios(data.premios || []);
        setGaleria(data.galeria || []);
      } catch (error) {
        if (ativo) setErro(error.response?.data?.mensagem || "Não foi possível carregar o conteúdo do site.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    carregarInicial();
    return () => { ativo = false; };
  }, [somenteGaleria]);

  useEffect(() => {
    if (!arquivo) return undefined;
    let ativo = true;
    const leitor = new FileReader();
    leitor.onload = () => { if (ativo && typeof leitor.result === "string") setPreviewLocal(leitor.result); };
    leitor.readAsDataURL(arquivo);
    return () => { ativo = false; };
  }, [arquivo]);

  useEffect(() => {
    let ativo = true;
    const urls = [];
    async function carregarPreviews() {
      const resultado = {};
      await Promise.all(galeria.map(async (item) => {
        try {
          const resposta = await api.get(`/site-conteudo/admin/galeria/${item.id}/imagem`, { responseType: "blob" });
          const url = URL.createObjectURL(resposta.data);
          urls.push(url);
          resultado[item.id] = url;
        } catch { /* A miniatura indisponível não bloqueia o painel. */ }
      }));
      if (ativo) setPreviews(resultado);
      else urls.forEach(URL.revokeObjectURL);
    }
    carregarPreviews();
    return () => {
      ativo = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [galeria]);

  const galeriaOrdenada = useMemo(() => [...galeria].sort((a, b) => a.ordem - b.ordem || a.id - b.id), [galeria]);

  function atualizarConfig(campo, valor) {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
    setSucesso("");
  }

  async function salvarConfig(evento) {
    evento.preventDefault();
    try {
      setSalvando(true); setErro(""); setSucesso("");
      const { data } = await api.put("/site-conteudo/admin/configuracoes", config);
      setConfig({ ...CONFIG_VAZIA, ...data.configuracoes });
      setSucesso(data.mensagem || "Alterações salvas.");
    } catch (error) {
      setErro(error.response?.data?.mensagem || "Não foi possível salvar. Revise os campos e tente novamente.");
    } finally { setSalvando(false); }
  }

  async function buscarCep() {
    const cep = String(config.cep || "").replace(/\D/g, "");
    if (cep.length !== 8) { setErro("Informe um CEP com oito dígitos."); return; }
    try {
      setBuscandoCep(true); setErro("");
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!resposta.ok) throw new Error("Consulta de CEP indisponível.");
      const dados = await resposta.json();
      if (dados.erro) throw new Error("CEP não encontrado.");
      setConfig((atual) => ({ ...atual, cep, logradouro: dados.logradouro || atual.logradouro,
        bairro: dados.bairro || atual.bairro, cidade: dados.localidade || atual.cidade,
        uf: dados.uf || atual.uf }));
    } catch (error) { setErro(error.message || "Não foi possível consultar o CEP."); }
    finally { setBuscandoCep(false); }
  }

  function editarPremio(item) {
    setPremioId(item.id);
    setPremio({ titulo: item.titulo || "", descricao: item.descricao || "", instituicao: item.instituicao || "",
      ano: item.ano || "", imagem_galeria_id: item.imagem_galeria_id || "", ordem: item.ordem ?? 0, publicado: Boolean(item.publicado) });
    setErro(""); setSucesso("");
  }

  async function salvarPremio(evento) {
    evento.preventDefault();
    try {
      setSalvando(true); setErro(""); setSucesso("");
      if (premioId) await api.put(`/site-conteudo/admin/premiacoes/${premioId}`, premio);
      else await api.post("/site-conteudo/admin/premiacoes", premio);
      setPremio(PREMIO_VAZIO); setPremioId(null);
      await carregar(); setSucesso("Premiação salva.");
    } catch (error) { setErro(error.response?.data?.mensagem || "Não foi possível salvar a premiação."); }
    finally { setSalvando(false); }
  }

  async function removerPremio(id) {
    if (!window.confirm("Remover esta premiação do site? Ela deixará de ser exibida e o histórico será preservado.")) return;
    try { await api.delete(`/site-conteudo/admin/premiacoes/${id}`); await carregar(); setSucesso("Premiação removida."); }
    catch (error) { setErro(error.response?.data?.mensagem || "Não foi possível remover a premiação."); }
  }

  function editarFoto(item) {
    setFotoId(item.id);
    setFoto({ titulo: item.titulo || "", legenda: item.legenda || "", texto_alternativo: item.texto_alternativo || "",
      categoria: item.categoria || "", ordem: item.ordem ?? 0, publicado: Boolean(item.publicado) });
    setArquivo(null); setErro(""); setSucesso("");
  }

  async function enviarFoto(evento) {
    evento.preventDefault();
    if (!arquivo) { setErro("Escolha uma imagem JPEG, PNG ou WebP."); return; }
    try {
      setSalvando(true); setErro(""); setSucesso("");
      const normalizarTexto = valor => String(valor || "").trim() || null;
      const contentSha256 = await hashArquivo(arquivo);
      const intencao = await api.post("/site-conteudo/admin/galeria/upload-direto", {
        mime_type: arquivo.type,
        tamanho_bytes: arquivo.size,
      });
      if (intencao.data.modo === "s3") {
        const envio = await fetch(intencao.data.url, {
          method: "PUT",
          headers: intencao.data.headers,
          body: arquivo,
        });
        if (!envio.ok) throw new Error("O armazenamento recusou o arquivo. Verifique a conexao e tente novamente.");
        const contexto = {
          titulo: normalizarTexto(foto.titulo), legenda: normalizarTexto(foto.legenda),
          texto_alternativo: normalizarTexto(foto.texto_alternativo), categoria: normalizarTexto(foto.categoria),
          ordem: Number(foto.ordem || 0), publicado: Boolean(foto.publicado), content_sha256: contentSha256,
        };
        const autorizacao = await solicitarAutorizacao("GALERIA_CRIAR", null, contexto);
        if (!autorizacao) return;
        await api.post("/site-conteudo/admin/galeria/finalizar-upload-direto", {
          uploadToken: intencao.data.uploadToken,
          ...foto,
          ordem: Number(foto.ordem || 0),
          publicado: Boolean(foto.publicado),
        }, autorizacao);
      } else {
        const dados = new FormData();
        dados.append("imagem", arquivo);
        Object.entries(foto).forEach(([chave, valor]) => dados.append(chave, String(valor)));
        const contexto = Object.fromEntries([...dados.entries()].filter(([chave]) => chave !== "imagem"));
        contexto.content_sha256 = contentSha256;
        const autorizacao = await solicitarAutorizacao("GALERIA_CRIAR", null, contexto);
        if (!autorizacao) return;
        await api.post("/site-conteudo/admin/galeria", dados, autorizacao);
      }
      setFoto(FOTO_VAZIA); setArquivo(null); evento.currentTarget.reset();
      await carregar(); setSucesso("Imagem enviada. Edite a ordem ou publicação quando desejar.");
    } catch (error) { setErro(error.response?.data?.mensagem || "Não foi possível enviar a imagem."); }
    finally { setSalvando(false); }
  }

  async function salvarFoto(evento) {
    evento.preventDefault();
    if (!fotoId) return;
    try {
      setSalvando(true); setErro(""); setSucesso("");
      const autorizacao = await solicitarAutorizacao("GALERIA_ATUALIZAR", fotoId, foto);
      if (!autorizacao) return;
      await api.put(`/site-conteudo/admin/galeria/${fotoId}`, foto, autorizacao);
      setFoto(FOTO_VAZIA); setFotoId(null); await carregar(); setSucesso("Imagem atualizada.");
    } catch (error) { setErro(error.response?.data?.mensagem || "Não foi possível atualizar a imagem."); }
    finally { setSalvando(false); }
  }

  async function removerFoto(id) {
    if (!window.confirm("Remover esta imagem da galeria pública? O arquivo ficará retido para preservar o histórico.")) return;
    try {
      const autorizacao = await solicitarAutorizacao("GALERIA_REMOVER", id, null);
      if (!autorizacao) return;
      await api.delete(`/site-conteudo/admin/galeria/${id}`, autorizacao);
      await carregar(); setSucesso("Imagem removida da galeria.");
    }
    catch (error) { setErro(error.response?.data?.mensagem || "Não foi possível remover a imagem."); }
  }

  const campo = (label, nome, max, tipo = "text") => (
    <label className="conteudo-campo" key={nome}>
      <span>{label}</span>
      {max > 500 ? <textarea maxLength={max} value={config[nome] || ""} onChange={(e) => atualizarConfig(nome, e.target.value)} />
        : <input type={tipo} maxLength={max} value={config[nome] || ""} onChange={(e) => atualizarConfig(nome, e.target.value)} />}
      {max > 500 && <small>{(config[nome] || "").length}/{max}</small>}
    </label>
  );

  if (carregando) return <main className="conteudo-site"><p>Carregando conteúdo…</p></main>;

  return (
    <main className="conteudo-site">
      <header className="conteudo-site-cabecalho">
        <div><span>Sistema · Site público</span><h1>{somenteGaleria ? "Galeria de Fotos" : "Conteúdo do Site"}</h1><p>{somenteGaleria ? "Gerencie as imagens da Galeria mediante autorização de um Administrador ou Super Administrador." : "Edite as informações públicas e confira a publicação sem alterar serviços, preços ou agenda."}</p></div>
        <a className="secondary-button" href="/" target="_blank" rel="noreferrer">Abrir site</a>
      </header>

      <nav className="conteudo-site-abas" aria-label="Seções do conteúdo">
        {abasDisponiveis.map(([id, label]) => <button type="button" key={id} className={aba === id ? "ativa" : ""} onClick={() => setAba(id)}>{label}</button>)}
      </nav>

      {erro && <p className="conteudo-alerta erro" role="alert">{erro}</p>}
      {sucesso && <p className="conteudo-alerta sucesso" role="status">{sucesso}</p>}

      {dialogAutorizacao && <div className="modal-overlay" role="presentation"><section className="confirmation-modal conteudo-autorizacao-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-autorizacao-galeria">
        <h2 id="titulo-autorizacao-galeria">Autorizar alteração da Galeria</h2>
        <p>Um Administrador ou Super Administrador ativo precisa autorizar esta operação específica. A senha não será armazenada.</p>
        <form onSubmit={confirmarAutorizacao}>
          <label>Autorizador<select name="autorizador_id" required defaultValue=""><option value="" disabled>Selecione uma pessoa</option>{dialogAutorizacao.autorizadores.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.perfil === "super_administrador" ? "Super Administrador" : "Administrador"} ({item.email})</option>)}</select></label>
          <label>Senha do autorizador<input name="senha" type="password" autoComplete="current-password" required /></label>
          {erroAutorizacao && <p role="alert" className="conteudo-alerta erro">{erroAutorizacao}</p>}
          <div className="conteudo-acoes"><button className="primary-button" type="submit">Autorizar operação</button><button className="secondary-button" type="button" onClick={cancelarAutorizacao}>Cancelar</button></div>
        </form>
      </section></div>}

      {aba === "inicio" && <form className="conteudo-card" onSubmit={salvarConfig}>
        <h2>Página inicial</h2><p>Deixe em branco para manter o texto neutro atual. Nenhuma informação institucional será presumida.</p>
        <div className="conteudo-grid">
          {campo("Título principal", "titulo_principal", 180)}{campo("Subtítulo", "subtitulo_principal", 500)}
          {campo("Apresentação", "apresentacao", 5000)}{campo("Destaque institucional", "destaque_institucional", 300)}
          {campo("Título da seção de serviços", "servicos_titulo", 180)}{campo("Texto da seção de serviços", "servicos_texto", 1000)}
          {campo("Título da chamada da galeria", "galeria_titulo", 180)}{campo("Texto do rodapé", "texto_rodape", 1000)}
          <label className="conteudo-campo"><span>Imagem do destaque</span><select value={config.imagem_principal_id || ""} onChange={(e) => atualizarConfig("imagem_principal_id", e.target.value)}><option value="">Manter arte visual atual</option>{galeriaOrdenada.map((item) => <option key={item.id} value={item.id}>{item.titulo || item.texto_alternativo} · {item.publicado ? "publicada" : "oculta"}</option>)}</select></label>
        </div>
        <button className="primary-button" disabled={salvando}>{salvando ? "Salvando…" : "Salvar página inicial"}</button>
      </form>}

      {aba === "institucional" && <form className="conteudo-card" onSubmit={salvarConfig}>
        <h2>História e informações institucionais</h2><p>Use somente informações confirmadas pela empresa. Se os campos opcionais ficarem vazios, as seções não serão exibidas.</p>
        <div className="conteudo-grid">
          {campo("Título da história", "historia_titulo", 180)}{campo("Nossa história", "historia", 12000)}
          {campo("Missão ou propósito", "missao", 3000)}{campo("Diferenciais", "diferenciais", 5000)}
          <label className="conteudo-campo"><span>Imagem da história</span><select value={config.imagem_historia_id || ""} onChange={(e) => atualizarConfig("imagem_historia_id", e.target.value)}><option value="">Sem imagem institucional</option>{galeriaOrdenada.map((item) => <option key={item.id} value={item.id}>{item.titulo || item.texto_alternativo} · {item.publicado ? "publicada" : "oculta"}</option>)}</select></label>
        </div>
        <button className="primary-button" disabled={salvando}>{salvando ? "Salvando…" : "Salvar informações"}</button>
      </form>}

      {aba === "contato" && <form className="conteudo-card" onSubmit={salvarConfig}>
        <h2>Endereço, contatos e localização</h2><p>Os horários informativos desta página não alteram a disponibilidade da agenda.</p>
        <div className="conteudo-grid">
          {campo("Nome comercial", "nome_comercial", 150)}{campo("E-mail de atendimento", "email", 255, "email")}
          {campo("Telefone", "telefone", 30, "tel")}{campo("WhatsApp comercial", "whatsapp", 30, "tel")}
          <label className="conteudo-campo"><span>CEP</span><div className="conteudo-cep"><input maxLength={9} value={config.cep || ""} onChange={(e) => atualizarConfig("cep", e.target.value)} /><button className="secondary-button" type="button" onClick={buscarCep} disabled={buscandoCep}>{buscandoCep ? "Consultando…" : "Buscar CEP"}</button></div></label>
          {campo("Logradouro", "logradouro", 180)}{campo("Número", "numero", 30)}{campo("Complemento", "complemento", 120)}
          {campo("Bairro", "bairro", 120)}{campo("Cidade", "cidade", 120)}{campo("UF", "uf", 2)}
          {campo("Horários de funcionamento informativos", "horario_funcionamento", 1000)}
          <label className="conteudo-campo"><span>Link Google Maps (opcional)</span><input type="url" maxLength={2048} value={config.google_maps_url || ""} onChange={(e) => atualizarConfig("google_maps_url", e.target.value)} placeholder="https://www.google.com/maps/..." /></label>
        </div>
        <button className="primary-button" disabled={salvando}>{salvando ? "Salvando…" : "Salvar contatos e endereço"}</button>
      </form>}

      {aba === "premios" && <section className="conteudo-card">
        <h2>Prêmios e conquistas</h2><p>Somente itens marcados como publicados aparecem no site. A seção pública desaparece se não houver itens publicados.</p>
        <form className="conteudo-editor" onSubmit={salvarPremio}>
          <h3>{premioId ? "Editar premiação" : "Adicionar premiação"}</h3>
          <div className="conteudo-grid">
            <label className="conteudo-campo"><span>Título *</span><input required maxLength={150} value={premio.titulo} onChange={(e) => setPremio({ ...premio, titulo: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Instituição ou evento</span><input maxLength={180} value={premio.instituicao} onChange={(e) => setPremio({ ...premio, instituicao: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Ano</span><input type="number" min="1900" max="2200" value={premio.ano} onChange={(e) => setPremio({ ...premio, ano: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Ordem</span><input type="number" value={premio.ordem} onChange={(e) => setPremio({ ...premio, ordem: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Imagem opcional</span><select value={premio.imagem_galeria_id || ""} onChange={(e) => setPremio({ ...premio, imagem_galeria_id: e.target.value })}><option value="">Sem imagem</option>{galeriaOrdenada.map((item) => <option key={item.id} value={item.id}>{item.titulo || item.texto_alternativo}</option>)}</select></label>
            <label className="conteudo-campo"><span>Descrição</span><textarea maxLength={3000} value={premio.descricao} onChange={(e) => setPremio({ ...premio, descricao: e.target.value })} /></label>
            <label className="conteudo-check"><input type="checkbox" checked={premio.publicado} onChange={(e) => setPremio({ ...premio, publicado: e.target.checked })} /> Publicar no site</label>
          </div>
          <div className="conteudo-acoes"><button className="primary-button" disabled={salvando}>{salvando ? "Salvando…" : premioId ? "Salvar edição" : "Adicionar premiação"}</button>{premioId && <button type="button" className="secondary-button" onClick={() => { setPremio(PREMIO_VAZIO); setPremioId(null); }}>Cancelar edição</button>}</div>
        </form>
        <div className="conteudo-lista">
          {premios.length === 0 ? <p>Nenhuma premiação cadastrada.</p> : premios.map((item) => <article key={item.id} className="conteudo-linha"><div><strong>{item.titulo}</strong><span>{item.ano || "Ano não informado"} · {item.publicado ? "Publicado" : "Oculto"}</span></div><div className="conteudo-acoes"><button className="secondary-button" onClick={() => editarPremio(item)}>Editar</button><button className="secondary-button perigo" onClick={() => removerPremio(item.id)}>Remover</button></div></article>)}
        </div>
      </section>}

      {aba === "galeria" && <section className="conteudo-card">
        <h2>Galeria de fotos</h2><p>JPEG, PNG e WebP até 8 MB. O arquivo original fica em armazenamento persistente separado das fotos privadas de pets.</p>
        {!fotoId && <form className="conteudo-editor" onSubmit={enviarFoto}>
          <h3>Enviar fotografia</h3>
          <div className="conteudo-grid">
            <label className="conteudo-campo"><span>Arquivo *</span><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></label>
            {previewLocal && <img className="conteudo-upload-preview" src={previewLocal} alt="Prévia local da imagem escolhida" />}
            <label className="conteudo-campo"><span>Título</span><input maxLength={150} value={foto.titulo} onChange={(e) => setFoto({ ...foto, titulo: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Categoria</span><input maxLength={60} placeholder="Ex.: Creche, Eventos" value={foto.categoria} onChange={(e) => setFoto({ ...foto, categoria: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Texto alternativo *</span><input required maxLength={255} value={foto.texto_alternativo} onChange={(e) => setFoto({ ...foto, texto_alternativo: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Legenda</span><textarea maxLength={2000} value={foto.legenda} onChange={(e) => setFoto({ ...foto, legenda: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Ordem</span><input type="number" value={foto.ordem} onChange={(e) => setFoto({ ...foto, ordem: e.target.value })} /></label>
            <label className="conteudo-check"><input type="checkbox" checked={foto.publicado} onChange={(e) => setFoto({ ...foto, publicado: e.target.checked })} /> Publicar no site</label>
          </div>
          <button className="primary-button" disabled={salvando}>{salvando ? "Enviando…" : "Enviar fotografia"}</button>
        </form>}
        {fotoId && <form className="conteudo-editor" onSubmit={salvarFoto}>
          <h3>Editar fotografia</h3><div className="conteudo-grid">
            <label className="conteudo-campo"><span>Título</span><input maxLength={150} value={foto.titulo} onChange={(e) => setFoto({ ...foto, titulo: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Categoria</span><input maxLength={60} value={foto.categoria} onChange={(e) => setFoto({ ...foto, categoria: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Texto alternativo *</span><input required maxLength={255} value={foto.texto_alternativo} onChange={(e) => setFoto({ ...foto, texto_alternativo: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Legenda</span><textarea maxLength={2000} value={foto.legenda} onChange={(e) => setFoto({ ...foto, legenda: e.target.value })} /></label>
            <label className="conteudo-campo"><span>Ordem</span><input type="number" value={foto.ordem} onChange={(e) => setFoto({ ...foto, ordem: e.target.value })} /></label>
            <label className="conteudo-check"><input type="checkbox" checked={foto.publicado} onChange={(e) => setFoto({ ...foto, publicado: e.target.checked })} /> Publicar no site</label>
          </div><div className="conteudo-acoes"><button className="primary-button" disabled={salvando}>Salvar imagem</button><button type="button" className="secondary-button" onClick={() => { setFotoId(null); setFoto(FOTO_VAZIA); }}>Cancelar edição</button></div>
        </form>}
        <div className="conteudo-galeria-admin">
          {galeriaOrdenada.length === 0 ? <p>Nenhuma imagem cadastrada.</p> : galeriaOrdenada.map((item) => <article key={item.id}>
            {previews[item.id] ? <img src={previews[item.id]} alt={item.texto_alternativo} /> : <div className="conteudo-miniatura-vazia">Prévia indisponível</div>}
            <div><strong>{item.titulo || item.texto_alternativo}</strong><span>Ordem {item.ordem} · {item.publicado ? "Publicada" : "Oculta"}</span>{item.legenda && <p>{item.legenda}</p>}</div>
            <div className="conteudo-acoes"><button className="secondary-button" onClick={() => editarFoto(item)}>Editar / ordenar</button><button className="secondary-button perigo" onClick={() => removerFoto(item.id)}>Remover</button></div>
          </article>)}
        </div>
      </section>}
    </main>
  );
}

export default ConteudoSite;
