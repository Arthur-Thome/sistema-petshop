import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";
import "../styles/DetalhesHotel.css";

function DetalhesHotel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [hospedagem, setHospedagem] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        setErro("");

        const resposta = await api.get(
          `/hotel/${id}`
        );

        setHospedagem(
          resposta.data.hospedagem
        );
      } catch (error) {
        console.error(
          "Erro ao carregar detalhes:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar os detalhes."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [id]);

  function formatarData(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    );
  }

  function nomeStatus(status) {
    const nomes = {
      AGENDADO: "Agendado",
      HOSPEDADO: "Hospedado",
      FINALIZADO: "Finalizado",
      CANCELADO: "Cancelado",
    };

    return nomes[status] || status;
  }

  if (carregando) {
    return (
      <div className="detalhes-hotel">
        Carregando detalhes...
      </div>
    );
  }

  return (
    <div className="detalhes-hotel">
      <div className="detalhes-hotel-cabecalho">
        <div>
          <h1>
            Detalhes da Hospedagem
          </h1>

          <p>
            Informações completas da reserva
            e das operações realizadas.
          </p>
        </div>

        <button
          type="button"
          className="botao-secundario"
          onClick={() =>
            navigate("/hotel/historico")
          }
        >
          Voltar
        </button>
      </div>

      {erro && (
        <div className="detalhes-hotel-erro">
          {erro}
        </div>
      )}

      {hospedagem && (
        <>
          <section className="detalhes-hotel-card">
            <div className="detalhes-hotel-topo">
              <div>
                <span
                  className={`historico-status ${hospedagem.status.toLowerCase()}`}
                >
                  {nomeStatus(
                    hospedagem.status
                  )}
                </span>

                <h2>
                  {hospedagem.pet_nome}
                </h2>
              </div>

              <button
                type="button"
                className="botao-secundario"
                onClick={() =>
                  navigate(
                    `/pets/${hospedagem.pet_id}`
                  )
                }
              >
                Ver cadastro do Pet
              </button>
            </div>

            <div className="detalhes-hotel-grid">
              <div>
                <span>Tutor</span>
                <strong>
                  {hospedagem.tutor_nome}
                </strong>
              </div>

              <div>
                <span>Telefone</span>
                <strong>
                  {hospedagem.tutor_telefone ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>Espécie</span>
                <strong>
                  {hospedagem.especie ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>Raça</span>
                <strong>
                  {hospedagem.raca ||
                    "-"}
                </strong>
              </div>
            </div>
          </section>

          <section className="detalhes-hotel-card">
            <h2>Período</h2>

            <div className="detalhes-hotel-grid">
              <div>
                <span>
                  Entrada prevista
                </span>
                <strong>
                  {formatarData(
                    hospedagem.entrada_prevista
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Saída prevista
                </span>
                <strong>
                  {formatarData(
                    hospedagem.saida_prevista
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Check-in realizado
                </span>
                <strong>
                  {formatarData(
                    hospedagem.checkin_em
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Check-out realizado
                </span>
                <strong>
                  {formatarData(
                    hospedagem.checkout_em
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="detalhes-hotel-card">
            <h2>Responsáveis</h2>

            <div className="detalhes-hotel-grid">
              <div>
                <span>
                  Reserva criada por
                </span>
                <strong>
                  {hospedagem.usuario_criacao_nome ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>
                  Check-in realizado por
                </span>
                <strong>
                  {hospedagem.usuario_checkin_nome ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>
                  Check-out realizado por
                </span>
                <strong>
                  {hospedagem.usuario_checkout_nome ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>
                  Cancelamento realizado por
                </span>
                <strong>
                  {hospedagem.usuario_cancelamento_nome ||
                    "-"}
                </strong>
              </div>
            </div>
          </section>

          <section className="detalhes-hotel-card">
            <h2>
              Observações e registros
            </h2>

            <div className="detalhes-hotel-observacoes">
              <div>
                <strong>
                  Reserva
                </strong>

                <p>
                  {hospedagem.observacoes_reserva ||
                    "Nenhuma observação registrada."}
                </p>
              </div>

              <div>
                <strong>
                  Check-in
                </strong>

                <p>
                  {hospedagem.observacoes_checkin ||
                    "Nenhuma observação registrada."}
                </p>
              </div>

              <div>
                <strong>
                  Check-out
                </strong>

                <p>
                  {hospedagem.observacoes_checkout ||
                    "Nenhuma observação registrada."}
                </p>
              </div>

              {hospedagem.status ===
                "CANCELADO" && (
                <div>
                  <strong>
                    Motivo do cancelamento
                  </strong>

                  <p>
                    {hospedagem.motivo_cancelamento ||
                      "-"}
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default DetalhesHotel;