import {
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import "../public-styles/HomePublica.css";


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
        atual === slides.length - 1
          ? 0
          : atual + 1
      );
    }, 6500);

    return () => {
      clearInterval(intervalo);
    };
  }, [
    slideAtual,
    carrosselPausado,
  ]);


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
        ? slides.length - 1
        : atual - 1
    );
  }


  function proximoSlide() {
    setSlideAtual((atual) =>
      atual === slides.length - 1
        ? 0
        : atual + 1
    );
  }


  const slide = slides[slideAtual];


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

            <a href="#historia">
              Nossa História
            </a>

            <a href="#premios">
              Prêmios
            </a>

            <Link to="/galeria">
              Galeria
            </Link>

            <a href="#localizacao">
              Localização
            </a>
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

            <a
              href="#historia"
              onClick={fecharMenu}
            >
              Nossa História
            </a>

            <a
              href="#premios"
              onClick={fecharMenu}
            >
              Prêmios
            </a>

            <Link
              to="/galeria"
              onClick={fecharMenu}
            >
              Galeria
            </Link>

            <a
              href="#localizacao"
              onClick={fecharMenu}
            >
              Localização
            </a>


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
                {slides.map(
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
        <section
          className="site-historia"
          id="historia"
        >

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
        <section
          className="site-secao site-premios"
          id="premios"
        >

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
              Momentos que fazem parte
              da nossa história
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
        <section
          className="site-localizacao"
          id="localizacao"
        >

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