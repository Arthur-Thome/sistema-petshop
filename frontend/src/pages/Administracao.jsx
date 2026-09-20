import {
  useNavigate,
} from "react-router-dom";

import "../styles/Administracao.css";


function Administracao() {

  const navigate =
    useNavigate();


  return (

    <div className="administracao-page">

      <div className="administracao-header">

        <h1>
          Administração
        </h1>

        <p>
          Gerencie recursos administrativos,
          segurança e informações do sistema.
        </p>

      </div>


      <div className="administracao-grid">

        {/*
         * A gestão completa de usuários será ampliada
         * nas próximas etapas.
         */}
        <div
          className="administracao-card administracao-card-desabilitado"
        >

          <div className="administracao-card-icone">
            👥
          </div>


          <div className="administracao-card-conteudo">

            <h2>
              Usuários
            </h2>

            <p>
              Gerenciamento de usuários,
              perfis e acessos ao sistema.
            </p>


            <span className="administracao-em-breve">
              Em breve
            </span>

          </div>

        </div>


        <div
          className="administracao-card administracao-card-clicavel"
          onClick={() =>
            navigate(
              "/administracao/auditoria"
            )
          }
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {

            if (
              event.key === "Enter" ||
              event.key === " "
            ) {

              event.preventDefault();

              navigate(
                "/administracao/auditoria"
              );

            }

          }}
        >

          <div className="administracao-card-icone">
            📋
          </div>


          <div className="administracao-card-conteudo">

            <h2>
              Logs e Auditoria
            </h2>

            <p>
              Consulte o histórico das
              operações realizadas no sistema.
            </p>


            <span className="administracao-card-link">
              Ver auditoria →
            </span>

          </div>

        </div>


        {/*
         * Estas áreas já ficam previstas na estrutura,
         * mas serão implementadas nas etapas específicas.
         */}
        <div
          className="administracao-card administracao-card-desabilitado"
        >

          <div className="administracao-card-icone">
            🔐
          </div>


          <div className="administracao-card-conteudo">

            <h2>
              Segurança
            </h2>

            <p>
              Configurações relacionadas à
              segurança e autenticação.
            </p>


            <span className="administracao-em-breve">
              Em breve
            </span>

          </div>

        </div>


        <div
          className="administracao-card administracao-card-desabilitado"
        >

          <div className="administracao-card-icone">
            ⚙️
          </div>


          <div className="administracao-card-conteudo">

            <h2>
              Configurações
            </h2>

            <p>
              Configurações gerais de
              funcionamento do sistema.
            </p>


            <span className="administracao-em-breve">
              Em breve
            </span>

          </div>

        </div>

      </div>

    </div>

  );
}


export default Administracao;
