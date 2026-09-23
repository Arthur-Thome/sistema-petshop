import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";
import "../styles/Hotel.css";


function Hotel() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();

  const [reservas, setReservas] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * As referências permitem que atalhos externos, como
   * os cards do Dashboard, levem diretamente à parte
   * correspondente da página sem criar telas duplicadas.
   */
  const hospedadosRef =
    useRef(null);

  const reservasRef =
    useRef(null);


  /*
   * Carrega somente os registros ainda ativos no Hotel:
   * AGENDADO ou HOSPEDADO.
   *
   * Registros FINALIZADO e CANCELADO ficam disponíveis
   * na tela de histórico.
   */
  async function carregarReservas() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          "/hotel/ativos"
        );

      setReservas(
        resposta.data.reservas || []
      );

    } catch (error) {
      console.error(
        "Erro ao carregar Hotel:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar os dados do Hotel."
      );

    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarReservas();
  }, []);


  /*
   * Quando a página é aberta por um atalho do Dashboard,
   * a query string informa qual seção deve receber foco.
   *
   * A rolagem acontece somente depois que os dados do
   * Hotel terminam de carregar, evitando tentar localizar
   * uma seção antes da renderização estar concluída.
   */
  useEffect(() => {
    if (carregando) {
      return;
    }

    const secao =
      searchParams.get("secao");

    let destino = null;

    if (secao === "hospedados") {
      destino =
        hospedadosRef.current;
    }

    if (secao === "reservas") {
      destino =
        reservasRef.current;
    }

    if (destino) {
      /*
       * Um pequeno atraso permite que o navegador finalize
       * a atualização visual antes da rolagem.
       */
      const timer =
        window.setTimeout(() => {
          destino.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);

      return () =>
        window.clearTimeout(timer);
    }
  }, [
    carregando,
    searchParams,
  ]);


  /*
   * A pesquisa é local porque a quantidade de registros
   * ativos tende a ser pequena. O histórico utiliza
   * pesquisa no backend.
   */
  const reservasFiltradas =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      if (!termo) {
        return reservas;
      }

      return reservas.filter(
        (reserva) => {
          const pet =
            reserva.pet_nome
              ?.toLowerCase() || "";

          const tutor =
            reserva.tutor_nome
              ?.toLowerCase() || "";

          return (
            pet.includes(termo) ||
            tutor.includes(termo)
          );
        }
      );
    }, [
      reservas,
      busca,
    ]);


  /*
   * Mantemos visualmente separados os animais que
   * estão fisicamente hospedados das reservas futuras.
   */
  const hospedados =
    reservasFiltradas.filter(
      (reserva) =>
        reserva.status ===
        "HOSPEDADO"
    );

  const agendados =
    reservasFiltradas.filter(
      (reserva) =>
        reserva.status ===
        "AGENDADO"
    );


  function formatarData(data) {
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


  return (
    <div className="hotel-page">

      <div className="hotel-cabecalho">

        <div>
          <h1>
            Hotel
          </h1>

          <p>
            Gerencie reservas, check-ins e
            hospedagens dos pets.
          </p>
        </div>


        <div className="hotel-acoes-cabecalho">

          <button
            type="button"
            className="botao-secundario"
            onClick={() =>
              navigate(
                "/hotel/historico"
              )
            }
          >
            Histórico
          </button>


          <button
            type="button"
            className="botao-principal"
            onClick={() =>
              navigate(
                "/hotel/nova-reserva"
              )
            }
          >
            Nova Reserva
          </button>

        </div>

      </div>


      <div className="hotel-pesquisa">

        <input
          type="text"
          placeholder="Buscar por pet ou tutor..."
          value={busca}
          onChange={(event) =>
            setBusca(
              event.target.value
            )
          }
        />

      </div>


      {erro && (
        <div className="hotel-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="hotel-mensagem">
          Carregando Hotel...
        </div>

      ) : (

        <>

          {/*
           * Esta referência é utilizada pelo atalho
           * "Hospedados" do Dashboard.
           */}
          <section
            className="hotel-secao"
            ref={hospedadosRef}
          >

            <div className="hotel-secao-titulo">

              <div>
                <h2>
                  Hospedados agora
                </h2>

                <p>
                  Pets que já realizaram
                  check-in.
                </p>
              </div>


              <span className="hotel-contador">
                {hospedados.length}
              </span>

            </div>


            {hospedados.length === 0 ? (

              <div className="hotel-vazio">
                Nenhum pet está hospedado
                no momento.
              </div>

            ) : (

              <div className="hotel-grid">

                {hospedados.map(
                  (reserva) => (

                    <div
                      className="hotel-card"
                      key={reserva.id}
                    >

                      <div className="hotel-card-topo">

                        <div>
                          <h3>
                            {reserva.pet_nome}
                          </h3>

                          <span className="hotel-status hospedado">
                            Hospedado
                          </span>
                        </div>

                      </div>


                      <div className="hotel-card-dados">

                        <p>
                          <strong>
                            Tutor:
                          </strong>{" "}
                          {reserva.tutor_nome}
                        </p>

                        <p>
                          <strong>
                            Check-in:
                          </strong>{" "}
                          {formatarData(
                            reserva.checkin_em
                          )}
                        </p>

                        <p>
                          <strong>
                            Saída prevista:
                          </strong>{" "}
                          {formatarData(
                            reserva.saida_prevista
                          )}
                        </p>

                      </div>


                      <div className="hotel-card-acoes">

                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            navigate(
                              `/pets/${reserva.pet_id}`
                            )
                          }
                        >
                          Ver Pet
                        </button>


                        <button
                          type="button"
                          className="botao-principal"
                          onClick={() =>
                            navigate(
                              `/hotel/${reserva.id}/checkout`
                            )
                          }
                        >
                          Check-out
                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </section>


          {/*
           * Esta referência é utilizada pelo atalho
           * "Reservas futuras" do Dashboard.
           */}
          <section
            className="hotel-secao"
            ref={reservasRef}
          >

            <div className="hotel-secao-titulo">

              <div>
                <h2>
                  Próximas reservas
                </h2>

                <p>
                  Reservas aguardando
                  check-in.
                </p>
              </div>


              <span className="hotel-contador">
                {agendados.length}
              </span>

            </div>


            {agendados.length === 0 ? (

              <div className="hotel-vazio">
                Nenhuma reserva agendada.
              </div>

            ) : (

              <div className="hotel-grid">

                {agendados.map(
                  (reserva) => (

                    <div
                      className="hotel-card"
                      key={reserva.id}
                    >

                      <div className="hotel-card-topo">

                        <div>
                          <h3>
                            {reserva.pet_nome}
                          </h3>

                          <span className="hotel-status agendado">
                            Agendado
                          </span>
                        </div>

                      </div>


                      <div className="hotel-card-dados">

                        <p>
                          <strong>
                            Tutor:
                          </strong>{" "}
                          {reserva.tutor_nome}
                        </p>

                        <p>
                          <strong>
                            Entrada prevista:
                          </strong>{" "}
                          {formatarData(
                            reserva.entrada_prevista
                          )}
                        </p>

                        <p>
                          <strong>
                            Saída prevista:
                          </strong>{" "}
                          {formatarData(
                            reserva.saida_prevista
                          )}
                        </p>

                      </div>


                      <div className="hotel-card-acoes">

                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            navigate(
                              `/pets/${reserva.pet_id}`
                            )
                          }
                        >
                          Ver Pet
                        </button>


                        <button
                          type="button"
                          className="botao-secundario"
                          onClick={() =>
                            navigate(
                              `/hotel/${reserva.id}/cancelar`
                            )
                          }
                        >
                          Cancelar Reserva
                        </button>


                        <button
                          type="button"
                          className="botao-principal"
                          onClick={() =>
                            navigate(
                              `/hotel/${reserva.id}/checkin`
                            )
                          }
                        >
                          Check-in
                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </section>

        </>

      )}

    </div>
  );
}


export default Hotel;