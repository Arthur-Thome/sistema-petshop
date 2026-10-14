import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../public-styles/GaleriaPublica.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const FORMATOS_GRID = ["galeria-item-grande", "", "galeria-item-alto", "", "galeria-item-largo", ""];

function GaleriaPublica() {
  const [imagens, setImagens] = useState([]);
  const [categoria, setCategoria] = useState("Todas");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`${API_URL}/site-conteudo/publico`)
      .then((resposta) => { if (!resposta.ok) throw new Error(); return resposta.json(); })
      .then((data) => { if (ativo) setImagens(Array.isArray(data.galeria) ? data.galeria : []); })
      .catch(() => { if (ativo) setErro("Não foi possível carregar as fotos agora."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const categorias = useMemo(() => ["Todas", ...new Set(imagens.map((item) => item.categoria).filter(Boolean))], [imagens]);
  const filtradas = useMemo(() => categoria === "Todas" ? imagens : imagens.filter((item) => item.categoria === categoria), [imagens, categoria]);

  return (
    <div className="galeria-publica">
      <header className="galeria-header">
        <Link to="/" className="galeria-marca">
          <img src="/images/logo-amores-pet.png" alt="Amores Pet" />
          <div><strong>Amores Pet</strong><span>Banho, Tosa e Hospedagem</span></div>
        </Link>
        <nav className="galeria-navegacao"><Link to="/">Início</Link><Link to="/agendar" className="galeria-agendar">Agendar</Link></nav>
      </header>

      <main>
        <section className="galeria-hero">
          <div className="galeria-hero-texto">
            <span>Galeria Amores Pet</span>
            <h1>Momentos que merecem ser lembrados.</h1>
            <p>Um espaço para compartilhar momentos especiais vividos pelos pets que fazem parte da nossa história.</p>
          </div>
          <div className="galeria-hero-destaque"><span>Amores Pet</span><strong>Carinho também vira memória.</strong></div>
        </section>

        <section className="galeria-conteudo">
          <div className="galeria-topo">
            <div><span>Nossos momentos</span><h2>Conheça um pouco da nossa rotina</h2></div>
            {categorias.length > 1 && <div className="galeria-filtros" aria-label="Filtrar por categoria">
              {categorias.map((item) => <button key={item} type="button" className={categoria === item ? "ativo" : ""} aria-pressed={categoria === item} onClick={() => setCategoria(item)}>{item}</button>)}
            </div>}
          </div>

          {carregando && <p className="galeria-estado">Carregando fotos…</p>}
          {!carregando && erro && <p className="galeria-estado" role="status">{erro}</p>}
          {!carregando && !erro && filtradas.length === 0 && <p className="galeria-estado">Ainda não há fotos publicadas nesta galeria.</p>}
          {!carregando && !erro && filtradas.length > 0 && <div className="galeria-grid">
            {filtradas.map((item, index) => <article key={item.id} className={`galeria-item ${FORMATOS_GRID[index % FORMATOS_GRID.length]}`}>
              <figure className="galeria-foto">
                <img src={`${API_URL}${item.imagem_url}`} alt={item.texto_alternativo} loading="lazy" />
                {(item.titulo || item.legenda || item.categoria) && <figcaption>
                  {item.categoria && <span>{item.categoria}</span>}
                  {item.titulo && <strong>{item.titulo}</strong>}
                  {item.legenda && <small>{item.legenda}</small>}
                </figcaption>}
              </figure>
            </article>)}
          </div>}
        </section>

        <section className="galeria-cta">
          <div><span>Seu pet também pode fazer parte desses momentos</span><h2>Agende uma visita à Amores Pet.</h2></div>
          <Link to="/agendar">Agendar agora</Link>
        </section>
      </main>

      <footer className="galeria-footer">
        <div className="galeria-footer-marca"><img src="/images/logo-amores-pet.png" alt="" /><div><strong>Amores Pet</strong><span>Banho, Tosa e Hospedagem</span></div></div>
        <div className="galeria-footer-links"><Link to="/">Página inicial</Link><Link to="/agendar">Agendar</Link></div>
      </footer>
    </div>
  );
}

export default GaleriaPublica;
