import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "../styles/Dashboard.css";


function Dashboard() {

  const navigate =
    useNavigate();


  const usuario =
    JSON.parse(
      localStorage.getItem(
        "usuario"
      ) || "{}"
    );


  const perfil =
    usuario.perfil;


  const [resumo, setResumo] =
    useState({
      pets_cadastrados: 0,
      tutores_cadastrados: 0,
      na_creche: 0,
      no_hotel: 0,
      atendimentos_hoje: 0,
      proximos_atendimentos: [],

      estoque_baixo: 0,
      pagamentos_pendentes: 0,
      valor_pagamentos_pendentes: 0,
      reservas_hotel: 0,

      usuarios_ativos: 0,

      usuarios_por_perfil: {
        administradores: 0,
        gerentes: 0,
        funcionarios: 0,
      },
    });


  const [carregando, setCarregando] =
    useState(true);


  const [
    erroDashboard,
    setErroDashboard,
  ] = useState(false);


  /*
   * O Dashboard utiliza um único endpoint de resumo.
   *
   * O próprio backend decide quais indicadores cada
   * perfil pode receber.
   */
  useEffect(() => {

    async function carregarDashboard() {

      try {

        setErroDashboard(false);
        setCarregando(true);


        const resposta =
          await api.get(
            "/dashboard/resumo"
          );


        setResumo((anterior) => ({
          ...anterior,
          ...resposta.data,

          usuarios_por_perfil: {
            ...anterior
              .usuarios_por_perfil,

            ...(
              resposta.data
                .usuarios_por_perfil ||
              {}
            ),
          },
        }));

      } catch (error) {

        setErroDashboard(true);

        console.error(
          "Erro ao carregar Dashboard:",
          error
        );

      } finally {

        setCarregando(false);

      }
    }


    carregarDashboard();

  }, []);


  /*
   * Somente gerente e administrador recebem
   * indicadores de gestão.
   */
  const podeVerGestao =
    perfil === "gerente" ||
    perfil === "administrador";


  /*
   * Indicadores administrativos são exclusivos
   * do administrador.
   */
  const ehAdministrador =
    perfil === "administrador";


  function formatarValor(valor) {

    return Number(
      valor || 0
    ).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    );

  }


  function formatarDataHora(data) {

    if (!data) {
      return "-";
    }


    return new Date(
      data
    ).toLocaleString(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    );

  }


  function formatarServicos(
    servicos
  ) {

    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return "Serviço não informado";
    }


    return servicos
      .map(
        (servico) =>
          servico.nome
      )
      .join(", ");

  }


  return (

    <div className="dashboard-page">

      <div className="dashboard-header">

        <div>

          <h1>
            Dashboard
          </h1>


          <p>
            Bem-vindo,{" "}
            <strong>
              {usuario.nome}
            </strong>
            .
          </p>

        </div>


        <div className="dashboard-perfil">

          {perfil === "administrador" &&
            "Administrador"}

          {perfil === "gerente" &&
            "Gerente"}

          {perfil === "funcionario" &&
            "Funcionário"}

        </div>

      </div>


      {erroDashboard && (

        <div className="dashboard-erro">

          Não foi possível atualizar
          os dados do Dashboard.

        </div>

      )}


      {/* =========================================
          OPERAÇÃO DO DIA
          ========================================= */}

      <section className="dashboard-section">

        <div className="dashboard-section-header">

          <div>

            <h2>
              Visão geral
            </h2>

            <p>
              Informações principais da
              operação.
            </p>

          </div>

        </div>


        <div className="dashboard-cards">

          <Card
            titulo="Pets ativos"
            valor={
              carregando
                ? "..."
                : resumo
                    .pets_cadastrados
            }
            icone="🐾"
            textoLink="Ver pets →"
            onClick={() =>
              navigate("/pets")
            }
          />


          <Card
            titulo="Tutores ativos"
            valor={
              carregando
                ? "..."
                : resumo
                    .tutores_cadastrados
            }
            icone="👤"
            textoLink="Ver tutores →"
            onClick={() =>
              navigate("/tutores")
            }
          />


          <Card
            titulo="Na creche"
            valor={
              carregando
                ? "..."
                : resumo.na_creche
            }
            icone="🏠"
            textoLink="Ver creche →"
            onClick={() =>
              navigate("/creche")
            }
          />


          <Card
            titulo="Hospedados"
            valor={
              carregando
                ? "..."
                : resumo.no_hotel
            }
            icone="🏨"
            textoLink="Ver hotel →"
            onClick={() =>
              navigate("/hotel?secao=hospedados")
            }
          />


          <Card
            titulo="Banho e Tosa hoje"
            valor={
              carregando
                ? "..."
                : resumo
                    .atendimentos_hoje
            }
            icone="✂️"
            textoLink="Ver atendimentos →"
            onClick={() =>
              navigate("/banho-tosa?filtro=hoje")
            }
          />

        </div>

      </section>


      {/* =========================================
          PRÓXIMOS ATENDIMENTOS
          ========================================= */}

      <section className="dashboard-section">

        <div className="dashboard-section-header">

          <div>

            <h2>
              Próximos atendimentos
            </h2>

            <p>
              Próximos agendamentos de
              Banho e Tosa.
            </p>

          </div>


          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                "/banho-tosa/novo"
              )
            }
          >
            Novo Agendamento
          </button>

        </div>


        <div className="dashboard-proximos">

          {carregando ? (

            <div className="dashboard-vazio">
              Carregando atendimentos...
            </div>

          ) : resumo
              .proximos_atendimentos
              .length === 0 ? (

            <div className="dashboard-vazio">

              Nenhum atendimento
              futuro agendado.

            </div>

          ) : (

            resumo
              .proximos_atendimentos
              .map(
                (atendimento) => (

                <div
                  key={
                    atendimento.id
                  }
                  className="dashboard-atendimento"
                  onClick={() =>
                    navigate(
                      `/banho-tosa/${atendimento.id}`
                    )
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {

                    if (
                      event.key ===
                        "Enter" ||
                      event.key === " "
                    ) {

                      event
                        .preventDefault();

                      navigate(
                        `/banho-tosa/${atendimento.id}`
                      );

                    }

                  }}
                >

                  <div className="dashboard-atendimento-data">

                    <span>
                      Agendamento
                    </span>

                    <strong>
                      {formatarDataHora(
                        atendimento
                          .agendado_para
                      )}
                    </strong>

                  </div>


                  <div className="dashboard-atendimento-pet">

                    <strong>
                      {
                        atendimento
                          .pet_nome
                      }
                    </strong>

                    <span>
                      Tutor:{" "}
                      {
                        atendimento
                          .tutor_nome
                      }
                    </span>

                  </div>


                  <div className="dashboard-atendimento-servicos">

                    {formatarServicos(
                      atendimento
                        .servicos
                    )}

                  </div>


                  <div className="dashboard-atendimento-acao">
                    Ver →
                  </div>

                </div>

              ))
          )}

        </div>

      </section>


      {/* =========================================
          INDICADORES DE GESTÃO
          GERENTE + ADMINISTRADOR
          ========================================= */}

      {podeVerGestao && (

        <section className="dashboard-section">

          <div className="dashboard-section-header">

            <div>

              <h2>
                Gestão
              </h2>

              <p>
                Indicadores para acompanhamento
                da operação.
              </p>

            </div>

          </div>


          <div className="dashboard-cards">

            <Card
              titulo="Produtos para repor"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .estoque_baixo
              }
              icone="📦"
              textoLink="Ver produtos →"
              onClick={() =>
                navigate(
                  "/produtos?estoque=baixo"
                )
              }
            />


            <Card
              titulo="Pagamentos pendentes"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .pagamentos_pendentes
              }
              icone="💳"
              textoLink="Ver pagamentos →"
              onClick={() =>
                navigate(
                  "/administrativo/pagamentos-pendentes"
                )
              }
            />


            <Card
              titulo="Valor pendente"
              valor={
                carregando
                  ? "..."
                  : formatarValor(
                      resumo
                        .valor_pagamentos_pendentes
                    )
              }
              icone="💰"
            />


            <Card
              titulo="Reservas futuras"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .reservas_hotel
              }
              icone="📅"
              textoLink="Ver hotel →"
              onClick={() =>
                navigate("/hotel?secao=reservas")
              }
            />

          </div>

        </section>

      )}


      {/* =========================================
          ADMINISTRAÇÃO
          SOMENTE ADMINISTRADOR
          ========================================= */}

      {ehAdministrador && (

        <section className="dashboard-section">

          <div className="dashboard-section-header">

            <div>

              <h2>
                Administração
              </h2>

              <p>
                Informações administrativas
                do sistema.
              </p>

            </div>

          </div>


          <div className="dashboard-cards">

            <Card
              titulo="Usuários ativos"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .usuarios_ativos
              }
              icone="👥"
            />


            <Card
              titulo="Administradores"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .usuarios_por_perfil
                      .administradores
              }
              icone="🛡️"
            />


            <Card
              titulo="Gerentes"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .usuarios_por_perfil
                      .gerentes
              }
              icone="📋"
            />


            <Card
              titulo="Funcionários"
              valor={
                carregando
                  ? "..."
                  : resumo
                      .usuarios_por_perfil
                      .funcionarios
              }
              icone="👤"
            />

          </div>

        </section>

      )}

    </div>
  );
}



/*
 * Card reutilizável do Dashboard.
 *
 * Quando onClick é informado, o componente também
 * funciona como atalho para a respectiva área.
 */
function Card({
  titulo,
  valor,
  icone,
  textoLink,
  onClick,
}) {

  const clicavel =
    typeof onClick === "function";


  function tratarTeclado(event) {

    if (!clicavel) {
      return;
    }


    if (
      event.key === "Enter" ||
      event.key === " "
    ) {

      event.preventDefault();

      onClick();

    }
  }


  return (

    <div
      className={
        clicavel
          ? "dashboard-card dashboard-card-clicavel"
          : "dashboard-card"
      }

      onClick={
        clicavel
          ? onClick
          : undefined
      }

      onKeyDown={
        tratarTeclado
      }

      role={
        clicavel
          ? "button"
          : undefined
      }

      tabIndex={
        clicavel
          ? 0
          : undefined
      }
    >

      <div className="dashboard-card-icon">
        {icone}
      </div>


      <div className="dashboard-card-value">
        {valor}
      </div>


      <div className="dashboard-card-title">
        {titulo}
      </div>


      {clicavel &&
        textoLink && (

        <div className="dashboard-card-link">
          {textoLink}
        </div>

      )}

    </div>
  );
}


export default Dashboard;