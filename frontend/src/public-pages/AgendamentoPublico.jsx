import { Link } from "react-router-dom";

import "../public-styles/AgendamentoPublico.css";


function AgendamentoPublico() {
  return (
    <div className="agendamento-publico">

      <header className="agendamento-header">

        <Link
          to="/"
          className="agendamento-marca"
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


        <Link
          to="/"
          className="agendamento-voltar"
        >
          ← Voltar ao site
        </Link>

      </header>


      <main className="agendamento-conteudo">

        <section className="agendamento-introducao">

          <span className="agendamento-etiqueta">
            Agendamento online
          </span>

          <h1>
            Vamos cuidar do seu pet?
          </h1>

          <p>
            Faça seu agendamento online de forma
            rápida. Você poderá escolher seu pet,
            o serviço desejado e um dos dias e
            horários disponibilizados pela Amores Pet.
          </p>


          <div className="agendamento-passos">

            <div>
              <span>01</span>

              <strong>
                Seus dados
              </strong>
            </div>

            <div>
              <span>02</span>

              <strong>
                Seu Pet
              </strong>
            </div>

            <div>
              <span>03</span>

              <strong>
                Serviço
              </strong>
            </div>

            <div>
              <span>04</span>

              <strong>
                Data e horário
              </strong>
            </div>

            <div>
              <span>05</span>

              <strong>
                Confirmar
              </strong>
            </div>

          </div>

        </section>


        <section className="agendamento-inicio">

          <div className="agendamento-inicio-cabecalho">

            <span>
              Começar
            </span>

            <h2>
              Como deseja continuar?
            </h2>

            <p>
              Você não precisa possuir uma conta
              para realizar um agendamento.
            </p>

          </div>


          <div className="agendamento-opcoes">

            {/*
             * Esses botões ainda não executam o fluxo.
             * Eles serão conectados quando implementarmos
             * identificação, Tutor e Pet.
             */}
            <button
              type="button"
              className="agendamento-opcao-principal"
            >
              <span>
                Já sou cliente
              </span>

              <strong>
                Identificar meu cadastro
              </strong>

              <small>
                Localize seus dados e os Pets
                vinculados ao seu cadastro.
              </small>
            </button>


            <button
              type="button"
              className="agendamento-opcao"
            >
              <span>
                Primeira vez
              </span>

              <strong>
                Fazer meu cadastro
              </strong>

              <small>
                Cadastre seus dados e seu Pet
                para continuar o agendamento.
              </small>
            </button>

          </div>


          <div className="agendamento-login">

            <p>
              Já possui uma conta no portal?
            </p>

            <button
              type="button"
              disabled
            >
              Entrar no portal
              <small>
                Disponível em breve
              </small>
            </button>

          </div>

        </section>

      </main>


      <footer className="agendamento-footer">

        <div>
          <strong>
            Amores Pet
          </strong>

          <span>
            Agendamento online
          </span>
        </div>


        <Link to="/">
          Voltar para a página inicial
        </Link>

      </footer>

    </div>
  );
}


export default AgendamentoPublico;