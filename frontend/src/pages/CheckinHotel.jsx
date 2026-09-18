import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import "../styles/OperacaoHotel.css";

function CheckinHotel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reserva, setReserva] = useState(null);
  const [observacoes, setObservacoes] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  /*
   * Buscamos os registros ativos e localizamos a reserva
   * pelo ID da URL. O backend continuará validando o
   * status novamente no momento do check-in.
   */
  useEffect(() => {
    async function carregarReserva() {
      try {
        setCarregando(true);
        setErro("");

        const resposta = await api.get(
          "/hotel/ativos"
        );

        const reservas =
          resposta.data.reservas || [];

        const encontrada = reservas.find(
          (item) =>
            Number(item.id) === Number(id)
        );

        if (!encontrada) {
          setErro(
            "Reserva do Hotel não encontrada."
          );
          return;
        }

        if (encontrada.status !== "AGENDADO") {
          setErro(
            "Esta reserva não está disponível para check-in."
          );
          return;
        }

        setReserva(encontrada);
      } catch (error) {
        console.error(
          "Erro ao carregar reserva:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar a reserva."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarReserva();
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

  async function confirmarCheckin(event) {
    event.preventDefault();

    if (!reserva) {
      return;
    }

    try {
      setProcessando(true);
      setErro("");

      await api.patch(
        `/hotel/${reserva.id}/checkin`,
        {
          observacoes:
            observacoes.trim() || null,
        }
      );

      navigate("/hotel");
    } catch (error) {
      console.error(
        "Erro ao realizar check-in:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível realizar o check-in."
      );
    } finally {
      setProcessando(false);
    }
  }

  if (carregando) {
    return (
      <div className="operacao-hotel">
        <p>Carregando reserva...</p>
      </div>
    );
  }

  return (
    <div className="operacao-hotel">
      <div className="operacao-hotel-cabecalho">
        <div>
          <h1>Check-in do Hotel</h1>

          <p>
            Confirme os dados antes de registrar
            a entrada do pet.
          </p>
        </div>

        <button
          type="button"
          className="botao-secundario"
          onClick={() => navigate("/hotel")}
        >
          Voltar
        </button>
      </div>

      {erro && (
        <div className="operacao-hotel-erro">
          {erro}
        </div>
      )}

      {reserva && (
        <form onSubmit={confirmarCheckin}>
          <section className="operacao-hotel-card">
            <div className="operacao-hotel-status">
              AGENDADO
            </div>

            <h2>{reserva.pet_nome}</h2>

            <div className="operacao-hotel-dados">
              <div>
                <span>Tutor</span>
                <strong>
                  {reserva.tutor_nome}
                </strong>
              </div>

              <div>
                <span>Telefone</span>
                <strong>
                  {reserva.tutor_telefone || "-"}
                </strong>
              </div>

              <div>
                <span>Entrada prevista</span>
                <strong>
                  {formatarData(
                    reserva.entrada_prevista
                  )}
                </strong>
              </div>

              <div>
                <span>Saída prevista</span>
                <strong>
                  {formatarData(
                    reserva.saida_prevista
                  )}
                </strong>
              </div>
            </div>

            {reserva.observacoes_reserva && (
              <div className="operacao-hotel-observacao">
                <strong>
                  Observações da reserva
                </strong>

                <p>
                  {reserva.observacoes_reserva}
                </p>
              </div>
            )}
          </section>

          <section className="operacao-hotel-card">
            <h2>Observações do check-in</h2>

            <textarea
              rows="5"
              placeholder="Condições do pet, pertences entregues, alimentação ou outras informações..."
              value={observacoes}
              onChange={(event) =>
                setObservacoes(
                  event.target.value
                )
              }
            />
          </section>

          <div className="operacao-hotel-aviso">
            Ao confirmar, esta reserva passará de{" "}
            <strong>AGENDADO</strong> para{" "}
            <strong>HOSPEDADO</strong> e o horário
            real do check-in será registrado.
          </div>

          <div className="operacao-hotel-acoes">
            <button
              type="button"
              className="botao-secundario"
              disabled={processando}
              onClick={() =>
                navigate("/hotel")
              }
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="botao-principal"
              disabled={processando}
            >
              {processando
                ? "Registrando..."
                : "Confirmar Check-in"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CheckinHotel;