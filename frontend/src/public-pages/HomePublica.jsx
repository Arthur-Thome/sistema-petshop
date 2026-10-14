import {
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";
import axios from "axios";

import "../public-styles/HomePublica.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function linkWhatsapp(numero) {
  const digitos = String(numero || "").replace(/\D/g, "");
  const internacional = digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
    ? digitos
    : `55${digitos}`;
  return `https://wa.me/${internacional}`;
}

function ocultarImagemIndisponivel(evento) {
  evento.currentTarget.hidden = true;
}


/*
 * Slides provisórios da página inicial.
 *
 * Nesta primeira versão os dados permanecem no frontend.
 * Mais adiante, o painel administrativo poderá controlar
 * imagens, títulos, textos, ordem e visibilidade dos slides.
 */
const slides = [
  {
    id: 1,
    etiqueta: "Bem-vindo",
    titulo:
      "Cuidado, carinho e atenção para quem faz parte da família.",
    descricao:
      "Um espaço pensado para oferecer conforto, segurança e momentos especiais para o seu pet.",
    destaque: "Cuidado que aproxima.",
    classe: "institucional",
  },

  {
    id: 2,
    etiqueta: "Atendimentos",
    titulo:
      "Cuidados pensados para cada pet.",
    descricao:
      "Serviços personalizados realizados com atenção às características e necessidades de cada animal.",
    destaque: "Bem-estar em cada detalhe.",
    classe: "atendimentos",
  },

  {
    id: 3,
    etiqueta: "Creche",
    titulo:
      "Um dia inteiro de diversão, companhia e cuidado.",
    descricao:
      "Um ambiente preparado para seu pet brincar, socializar e aproveitar o dia com segurança.",
    destaque: "Diversão também é cuidado.",
    classe: "creche",
  },

  {
    id: 4,
    etiqueta: "Hotel",
    titulo:
      "Conforto e segurança mesmo quando você estiver longe.",
    descricao:
      "Hospedagem preparada para que seu pet seja acompanhado e cuidado durante toda a estadia.",
    destaque: "Uma segunda casa para o seu pet.",
    classe: "hotel",
  },
];


function HomePublica() {
  const [menuAberto, setMenuAberto] =
    useState(false);

  const [slideAtual, setSlideAtual] =
    useState(0);

  const [carrosselPausado, setCarrosselPausado] =
    useState(false);
  const [conteudoPublico, setConteudoPublico] = useState({ configuracoes: {}, premios: [], galeria: [] });

  useEffect(() => {
    let ativo = true;
    axios.get(`${API_URL}/site-conteudo/publico`)
      .then(({ data }) => { if (ativo) setConteudoPublico({ configuracoes: data.configuracoes || {}, premios: data.premios || [], galeria: data.galeria || [] }); })
      .catch(() => { if (ativo) setConteudoPublico({ configuracoes: {}, premios: [], galeria: [] }); });
    return () => { ativo = false; };
  }, []);

  const configuracoes = conteudoPublico.configuracoes;
  const slidesVisiveis = slides.map((item, index) => index === 0 ? {
    ...item,
    titulo: configuracoes.titulo_principal || item.titulo,
    descricao: configuracoes.subtitulo_principal || item.descricao,
    destaque: configuracoes.destaque_institucional || item.destaque,
  } : item);


  /*
   * Troca automática do carrossel.
   *
   * O intervalo é reiniciado sempre que o usuário
   * troca manualmente de slide. Isso evita que um
   * novo slide apareça imediatamente após um clique.
   */
  useEffect(() => {
    if (carrosselPausado) {
      return undefined;
    }

    const intervalo = setInterval(() => {
      setSlideAtual((atual) =>
        atual === slidesVisiveis.length - 1
          ? 0
          : atual + 1
      );
    }, 6500);

    return () => {
      clearInterval(intervalo);
    };
  }, [slideAtual, carrosselPausado, slidesVisiveis.length]);


  /*
   * Fecha o menu mobile após selecionar
   * uma opção de navegação.
   */
  function fecharMenu() {
    setMenuAberto(false);
  }


  function slideAnterior() {
    setSlideAtual((atual) =>
      atual === 0
      ? slidesVisiveis.length - 1
        : atual - 1
    );
  }


  function proximoSlide() {
    setSlideAtual((atual) =>
      atual === slidesVisiveis.length - 1
        ? 0
        : atual + 1
    );
  }


  const slide = slidesVisiveis[slideAtual] || slidesVisiveis[0];
  const enderecoCompleto = [configuracoes.logradouro, configuracoes.numero, configuracoes.complemento,
    configuracoes.bairro, configuracoes.cidade, configuracoes.uf, configuracoes.cep]
    .filter(Boolean).join(", ");
  const enderecoSuficiente = Boolean(configuracoes.logradouro && configuracoes.cidade && configuracoes.uf);
  const linkMaps = configuracoes.google_maps_url || (enderecoSuficiente
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}` : "");
  const temLocalizacao = Boolean(enderecoCompleto || configuracoes.telefone || configuracoes.whatsapp || configuracoes.email || configuracoes.horario_funcionamento);


  return (
    <div className="site-publico">

      {/*
       * ======================================================
       * CABEÇALHO
       * ======================================================
       */}
      <header className="site-header">

        <div className="site-header-container">

            <Link
            to="/"
            className="site-marca"
            onClick={fecharMenu}
            >
            <div className="site-logo">
                <img
                src="/images/logo-amores-pet.png"
                alt="Amores Pet"
                />
            </div>

            <div className="site-marca-texto">
                <strong>
                Amores Pet
                </strong>

                <span>
                Banho, Tosa e Hospedagem
                </span>
            </div>
            </Link>


            <nav
            className="site-menu"
            aria-label="Navegação principal"
            >
            <a href="#inicio">
              Início
            </a>

            <a href="#servicos">
              Serviços
            </a>

            {(configuracoes.historia || configuracoes.missao || configuracoes.diferenciais) && <a href="#historia">
              Nossa História
            </a>}

            {conteudoPublico.premios.length > 0 && <a href="#premios">
              Prêmios
            </a>}

            <Link to="/galeria">
              Galeria
            </Link>

            {temLocalizacao && <a href="#localizacao">
              Localização
            </a>}
          </nav>


          <div className="site-header-acoes">

            <Link
              to="/login"
              className="site-entrar"
            >
              Entrar
            </Link>

            <Link
              to="/agendar"
              className="site-agendar"
            >
              Agendar
            </Link>

          </div>


          {/*
           * O botão é exibido apenas em telas menores.
           * aria-expanded informa aos leitores de tela
           * se o menu está aberto ou fechado.
           */}
          <button
            type="button"
            className={
              `site-menu-mobile-botao ${
                menuAberto
                  ? "aberto"
                  : ""
              }`
            }
            aria-label={
              menuAberto
                ? "Fechar menu"
                : "Abrir menu"
            }
            aria-expanded={menuAberto}
            onClick={() =>
              setMenuAberto(
                (aberto) => !aberto
              )
            }
          >
            <span />
            <span />
            <span />
          </button>

        </div>


        {/*
         * Menu separado para celulares e tablets.
         *
         * Ele não reutiliza o menu desktop porque
         * precisamos de comportamento e disposição
         * próprios para telas pequenas.
         */}
        <div
          className={
            `site-menu-mobile ${
              menuAberto
                ? "aberto"
                : ""
            }`
          }
        >
          <nav aria-label="Navegação mobile">

            <a
              href="#inicio"
              onClick={fecharMenu}
            >
              Início
            </a>

            <a
              href="#servicos"
              onClick={fecharMenu}
            >
              Serviços
            </a>

            {(configuracoes.historia || configuracoes.missao || configuracoes.diferenciais) && <a
              href="#historia"
              onClick={fecharMenu}
            >
              Nossa História
            </a>}

            {conteudoPublico.premios.length > 0 && <a
              href="#premios"
              onClick={fecharMenu}
            >
              Prêmios
            </a>}

            <Link
              to="/galeria"
              onClick={fecharMenu}
            >
              Galeria
            </Link>

            {temLocalizacao && <a
              href="#localizacao"
              onClick={fecharMenu}
            >
              Localização
            </a>}


            <div className="site-menu-mobile-acoes">

              <Link
                to="/login"
                className="site-menu-mobile-entrar"
                onClick={fecharMenu}
              >
                Entrar
              </Link>

              <Link
                to="/agendar"
                className="site-menu-mobile-agendar"
                onClick={fecharMenu}
              >
                Agendar
              </Link>

            </div>

          </nav>
        </div>

      </header>


      <main>

        {/*
         * ======================================================
         * CARROSSEL PRINCIPAL
         * ======================================================
         */}
        <section
          className={
            `site-hero site-hero-${slide.classe}`
          }
          id="inicio"
          onMouseEnter={() =>
            setCarrosselPausado(true)
          }
          onMouseLeave={() =>
            setCarrosselPausado(false)
          }
        >

          <div className="site-hero-conteudo">

            <span className="site-hero-etiqueta">
              {slide.etiqueta}
            </span>

            <h1>
              {slide.titulo}
            </h1>

            <p>
              {slide.descricao}
            </p>


            <div className="site-hero-acoes">

              <Link
                to="/agendar"
                className="site-hero-principal"
              >
                Agendar agora
              </Link>

              <a
                href="#servicos"
                className="site-hero-secundario"
              >
                Conhecer serviços
              </a>

            </div>


            <div className="site-carrossel-controles">

              <button
                type="button"
                className="site-carrossel-seta"
                aria-label="Slide anterior"
                onClick={slideAnterior}
              >
                ←
              </button>


              <div
                className="site-carrossel-indicadores"
                aria-label="Selecionar slide"
              >
                {slidesVisiveis.map(
                  (item, indice) => (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        indice === slideAtual
                          ? "ativo"
                          : ""
                      }
                      aria-label={
                        `Ir para slide ${
                          indice + 1
                        }`
                      }
                      aria-current={
                        indice === slideAtual
                          ? "true"
                          : undefined
                      }
                      onClick={() =>
                        setSlideAtual(indice)
                      }
                    />
                  )
                )}
              </div>


              <button
                type="button"
                className="site-carrossel-seta"
                aria-label="Próximo slide"
                onClick={proximoSlide}
              >
                →
              </button>

            </div>

          </div>


          <div className="site-hero-visual">

            {/*
             * A imagem real será cadastrável futuramente.
             * Por enquanto mantemos um visual provisório
             * que muda de acordo com o slide.
             */}
            <div
              className={
                `site-hero-imagem-placeholder ${
                  slide.classe
                }`
              }
            >

              {slideAtual === 0 && configuracoes.imagem_principal_url && (
                <img className="site-hero-imagem-real" src={`${API_URL}${configuracoes.imagem_principal_url}`} alt="" onError={ocultarImagemIndisponivel} />
              )}

              <div className="site-hero-imagem-conteudo">

                <span className="site-hero-slide-numero">
                  {String(
                    slideAtual + 1
                  ).padStart(2, "0")}
                </span>

                <strong>
                  {slide.destaque}
                </strong>

                <small>
                  Espaço para imagem
                  do carrossel
                </small>

              </div>

            </div>

          </div>

        </section>


        {/*
         * ======================================================
         * SERVIÇOS
         * ======================================================
         */}
        <section
          className="site-secao site-servicos"
          id="servicos"
        >

            <div className="site-secao-cabecalho">
              <span>Nossos serviços</span>
              <h2>{configuracoes.servicos_titulo || "Tudo que seu pet precisa em um só lugar"}</h2>
              <p>{configuracoes.servicos_texto || configuracoes.apresentacao || "Conheça alguns dos cuidados e experiências oferecidos pela nossa equipe."}</p>
            </div>

            <div className="site-secao-cabecalho" style={{ display: "none" }}>

            <span>
              Nossos serviços
            </span>

            <h2>
              Tudo que seu pet precisa
              em um só lugar
            </h2>

            <p>
              Conheça alguns dos cuidados e
              experiências oferecidos pela
              nossa equipe.
            </p>

          </div>


          <div className="site-servicos-grid">

            <article className="site-servico-card">

              <div className="site-servico-numero">
                01
              </div>

              <h3>
                Atendimentos
              </h3>

              <p>
                Serviços e cuidados personalizados
                para as necessidades do seu pet.
              </p>

              <Link to="/agendar">
                Agendar atendimento
              </Link>

            </article>


            <article className="site-servico-card">

              <div className="site-servico-numero">
                02
              </div>

              <h3>
                Creche
              </h3>

              <p>
                Um ambiente preparado para diversão,
                convivência e cuidado durante o dia.
              </p>

              <Link to="/agendar">
                Conhecer a creche
              </Link>

            </article>


            <article className="site-servico-card">

              <div className="site-servico-numero">
                03
              </div>

              <h3>
                Hotel
              </h3>

              <p>
                Segurança e conforto para o seu pet
                enquanto você estiver longe.
              </p>

              <Link to="/agendar">
                Conhecer o hotel
              </Link>

            </article>

          </div>

        </section>


        {/*
         * ======================================================
         * NOSSA HISTÓRIA
         * ======================================================
         */}
        {(configuracoes.historia || configuracoes.missao || configuracoes.diferenciais) && (
          <section className="site-historia" id="historia">
            <div className="site-historia-imagem">
              {configuracoes.imagem_historia_url
                ? <img className="site-historia-imagem-real" src={API_URL + configuracoes.imagem_historia_url} alt="" onError={ocultarImagemIndisponivel} />
                : <span>Amores Pet</span>}
            </div>
            <div className="site-historia-conteudo">
              <span className="site-secao-etiqueta">Nossa história</span>
              {configuracoes.historia_titulo && <h2>{configuracoes.historia_titulo}</h2>}
              {configuracoes.historia && <p>{configuracoes.historia}</p>}
              {configuracoes.missao && <p><strong>Propósito</strong><br />{configuracoes.missao}</p>}
              {configuracoes.diferenciais && <p className="site-institucional-texto">{configuracoes.diferenciais}</p>}
            </div>
          </section>
        )}

        <section className="site-historia" id="historia-antiga" style={{ display: "none" }}>

          <div className="site-historia-imagem">
            <span>
              Imagem da história da pet shop
            </span>
          </div>


          <div className="site-historia-conteudo">

            <span className="site-secao-etiqueta">
              Nossa história
            </span>

            <h2>
              Uma história construída
              com amor pelos animais
            </h2>

            <p>
              Este espaço receberá a história real
              da pet shop, desde o início de sua
              trajetória até os dias atuais.
            </p>

            <p>
              Posteriormente esse conteúdo poderá
              ser administrado pelo próprio sistema,
              sem necessidade de alterar o código.
            </p>

          </div>

        </section>


        {/*
         * ======================================================
         * PRÊMIOS
         * ======================================================
         */}
        {conteudoPublico.premios.length > 0 && (
          <section className="site-secao site-premios" id="premios">
            <div className="site-secao-cabecalho">
              <span>Reconhecimentos</span>
              <h2>Prêmios e conquistas</h2>
            </div>
            <div className="site-premios-grid">
              {conteudoPublico.premios.map((item, index) => (
                <article key={item.id}>
                  {item.imagem_url && <img className="site-premio-imagem" src={API_URL + item.imagem_url} alt={item.imagem_alt || ""} onError={ocultarImagemIndisponivel} />}
                  <span>{String(index + 1).padStart(2, "0")}{item.ano ? ` · ${item.ano}` : ""}</span>
                  <h3>{item.titulo}</h3>
                  {item.instituicao && <small>{item.instituicao}</small>}
                  {item.descricao && <p>{item.descricao}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="site-secao site-premios" id="premios-antigos" style={{ display: "none" }}>

          <div className="site-secao-cabecalho">

            <span>
              Reconhecimento
            </span>

            <h2>
              Prêmios e conquistas
            </h2>

            <p>
              Um espaço dedicado aos reconhecimentos
              conquistados ao longo da nossa história.
            </p>

          </div>


          <div className="site-premios-grid">

            <article>

              <span>
                01
              </span>

              <h3>
                Prêmio ou reconhecimento
              </h3>

              <p>
                Ano e descrição serão adicionados
                posteriormente.
              </p>

            </article>


            <article>

              <span>
                02
              </span>

              <h3>
                Prêmio ou reconhecimento
              </h3>

              <p>
                O conteúdo será administrável
                futuramente.
              </p>

            </article>


            <article>

              <span>
                03
              </span>

              <h3>
                Prêmio ou reconhecimento
              </h3>

              <p>
                Podemos incluir quantos
                reconhecimentos forem necessários.
              </p>

            </article>

          </div>

        </section>


        {/*
         * ======================================================
         * GALERIA
         * ======================================================
         */}
        <section className="site-galeria-chamada">

          <div>

            <span>
              Nossa galeria
            </span>

            <h2>
              {configuracoes.galeria_titulo || "Momentos que fazem parte da nossa história"}
            </h2>

          </div>


          <Link to="/galeria">
            Conhecer a galeria
          </Link>

        </section>


        {/*
         * ======================================================
         * LOCALIZAÇÃO
         * ======================================================
         */}
        {temLocalizacao && (
          <section className="site-localizacao site-localizacao-sem-mapa" id="localizacao">
            <div className="site-localizacao-conteudo">
              <span className="site-secao-etiqueta">Onde estamos</span>
              {configuracoes.nome_comercial && <h2>{configuracoes.nome_comercial}</h2>}
              {enderecoCompleto && <div className="site-localizacao-dados"><div><span>Endereço</span><strong>{enderecoCompleto}</strong></div></div>}
              {configuracoes.horario_funcionamento && <div className="site-localizacao-dados"><div><span>Horários informativos</span><strong>{configuracoes.horario_funcionamento}</strong></div></div>}
              <div className="site-localizacao-contatos">
                {configuracoes.telefone && <a href={`tel:${configuracoes.telefone.replace(/\D/g, "")}`}>Telefone: {configuracoes.telefone}</a>}
                {configuracoes.whatsapp && <a href={linkWhatsapp(configuracoes.whatsapp)} target="_blank" rel="noreferrer">WhatsApp comercial</a>}
                {configuracoes.email && <a href={`mailto:${configuracoes.email}`}>{configuracoes.email}</a>}
              </div>
              {linkMaps && <a className="site-mapa-link" href={linkMaps} target="_blank" rel="noopener noreferrer">Abrir localização no Google Maps</a>}
            </div>
          </section>
        )}

        <section className="site-localizacao" id="localizacao-antiga" style={{ display: "none" }}>

          <div className="site-localizacao-conteudo">

            <span className="site-secao-etiqueta">
              Onde estamos
            </span>

            <h2>
              Venha nos visitar
            </h2>

            <p>
              O endereço, horário de funcionamento,
              telefone e demais informações serão
              configurados posteriormente.
            </p>


            <div className="site-localizacao-dados">

              <div>

                <span>
                  Endereço
                </span>

                <strong>
                  Endereço da pet shop
                </strong>

              </div>


              <div>

                <span>
                  Atendimento
                </span>

                <strong>
                  Horários da pet shop
                </strong>

              </div>

            </div>

          </div>


          <div className="site-mapa-placeholder">

            <span>
              Google Maps
            </span>

            <small>
              Integração será adicionada
              posteriormente
            </small>

          </div>

        </section>

      </main>


      {/*
       * ======================================================
       * RODAPÉ
       * ======================================================
       */}
      <footer className="site-footer">
        <div>
          <strong>{configuracoes.nome_comercial || "Amores Pet"}</strong>
          <p>{configuracoes.texto_rodape || configuracoes.apresentacao || "Cuidado, carinho e atenção em cada detalhe."}</p>
        </div>
        <div><span>Navegação</span><a href="#servicos">Serviços</a>{(configuracoes.historia || configuracoes.missao || configuracoes.diferenciais) && <a href="#historia">Nossa História</a>}<Link to="/galeria">Galeria</Link></div>
        <div><span>Atendimento</span>{configuracoes.telefone && <a href={`tel:${configuracoes.telefone.replace(/\D/g, "")}`}>{configuracoes.telefone}</a>}{configuracoes.email && <a href={`mailto:${configuracoes.email}`}>{configuracoes.email}</a>}<Link to="/agendar">Agendar</Link></div>
      </footer>

      <footer className="site-footer" style={{ display: "none" }}>

        <div>

          <strong>
            Sistema Pet Shop
          </strong>

          <p>
            Espaço reservado para informações
            institucionais da pet shop.
          </p>

        </div>


        <div>

          <span>
            Navegação
          </span>

          <a href="#servicos">
            Serviços
          </a>

          <a href="#historia">
            Nossa História
          </a>

          <Link to="/galeria">
            Galeria
          </Link>

        </div>


        <div>

          <span>
            Atendimento
          </span>

          <Link to="/agendar">
            Agendar
          </Link>

          <Link to="/login">
            Entrar
          </Link>

        </div>

      </footer>

    </div>
  );
}


export default HomePublica;
