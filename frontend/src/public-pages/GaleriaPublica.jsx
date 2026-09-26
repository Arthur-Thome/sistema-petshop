import { Link } from "react-router-dom";

import "../public-styles/GaleriaPublica.css";


/*
 * As imagens ainda são provisórias.
 *
 * No bloco de administração do site, esta página deixará
 * de possuir conteúdo fixo e passará a buscar as fotos
 * cadastradas pelo administrativo no backend.
 */
const categorias = [
  "Todos",
  "Banho e Tosa",
  "Creche",
  "Hotel",
  "Eventos",
];


function GaleriaPublica() {
  return (
    <div className="galeria-publica">

      {/*
       * ======================================================
       * CABEÇALHO
       * ======================================================
       */}
      <header className="galeria-header">

        <Link
          to="/"
          className="galeria-marca"
        >
          <img
            src="/images/logo-amores-pet.png"
            alt="Amores Pet"
          />

          <div>
            <strong>
              Amores Pet
            </strong>

            <span>
              Banho, Tosa e Hospedagem
            </span>
          </div>
        </Link>


        <nav className="galeria-navegacao">

          <Link to="/">
            Início
          </Link>

          <Link
            to="/agendar"
            className="galeria-agendar"
          >
            Agendar
          </Link>

        </nav>

      </header>


      <main>

        {/*
         * ======================================================
         * APRESENTAÇÃO
         * ======================================================
         */}
        <section className="galeria-hero">

          <div className="galeria-hero-texto">

            <span>
              Galeria Amores Pet
            </span>

            <h1>
              Momentos que merecem
              ser lembrados.
            </h1>

            <p>
              Um espaço para compartilhar alguns
              dos momentos especiais vividos pelos
              Pets que fazem parte da nossa história.
            </p>

          </div>


          <div className="galeria-hero-destaque">

            <span>
              Amores Pet
            </span>

            <strong>
              Carinho também
              vira memória.
            </strong>

          </div>

        </section>


        {/*
         * ======================================================
         * FILTROS
         * ======================================================
         *
         * Os botões ainda são apenas visuais.
         * Quando a galeria estiver conectada ao backend,
         * eles filtrarão as fotos por categoria.
         */}
        <section className="galeria-conteudo">

          <div className="galeria-topo">

            <div>
              <span>
                Nossos momentos
              </span>

              <h2>
                Conheça um pouco
                da nossa rotina
              </h2>
            </div>


            <div className="galeria-filtros">

              {categorias.map(
                (categoria, indice) => (
                  <button
                    key={categoria}
                    type="button"
                    className={
                      indice === 0
                        ? "ativo"
                        : ""
                    }
                  >
                    {categoria}
                  </button>
                )
              )}

            </div>

          </div>


          {/*
           * ====================================================
           * GRID PROVISÓRIO
           * ====================================================
           *
           * Os blocos possuem tamanhos diferentes de propósito.
           * Quando receberem fotografias, teremos uma galeria
           * mais dinâmica em vez de uma grade de quadrados iguais.
           */}
          <div className="galeria-grid">

            <article className="galeria-item galeria-item-grande">

              <div className="galeria-placeholder">
                <span>
                  Banho e Tosa
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>


            <article className="galeria-item">

              <div className="galeria-placeholder">
                <span>
                  Creche
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>


            <article className="galeria-item galeria-item-alto">

              <div className="galeria-placeholder">
                <span>
                  Hotel
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>


            <article className="galeria-item">

              <div className="galeria-placeholder">
                <span>
                  Eventos
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>


            <article className="galeria-item galeria-item-largo">

              <div className="galeria-placeholder">
                <span>
                  Amores Pet
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>


            <article className="galeria-item">

              <div className="galeria-placeholder">
                <span>
                  Nossa rotina
                </span>

                <small>
                  Foto cadastrada pelo administrativo
                </small>
              </div>

            </article>

          </div>

        </section>


        {/*
         * ======================================================
         * CHAMADA PARA AGENDAMENTO
         * ======================================================
         */}
        <section className="galeria-cta">

          <div>

            <span>
              Seu Pet também pode fazer
              parte desses momentos
            </span>

            <h2>
              Agende uma visita
              à Amores Pet.
            </h2>

          </div>


          <Link to="/agendar">
            Agendar agora
          </Link>

        </section>

      </main>


      <footer className="galeria-footer">

        <div className="galeria-footer-marca">

          <img
            src="/images/logo-amores-pet.png"
            alt=""
          />

          <div>
            <strong>
              Amores Pet
            </strong>

            <span>
              Banho, Tosa e Hospedagem
            </span>
          </div>

        </div>


        <div className="galeria-footer-links">

          <Link to="/">
            Página inicial
          </Link>

          <Link to="/agendar">
            Agendar
          </Link>

        </div>

      </footer>

    </div>
  );
}


export default GaleriaPublica;