import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import "../styles/OperacaoHotel.css";

function CheckoutHotel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reserva, setReserva] = useState(null);
  const [observacoes, setObservacoes] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  /*
   * Para o check-out precisamos encontrar uma hospedagem
   * que ainda esteja ativa e possua status HOSPEDADO.
   */
  useEffect(() => {
    async function carregarHospedagem() {
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
            "Hospedagem do Hotel não encontrada."
          );
          return;
        }

        if (
          encontrada.status !== "HOSPEDADO"
        ) {
          setErro(
            "Esta hospedagem não está disponível para check-out."
          );
          return;
        }

        setReserva(encontrada);
      } catch (error) {
        console.error(
          "Erro ao carregar hospedagem:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar a hospedagem."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarHospedagem();
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

  async function confirmarCheckout(event) {
    event.preventDefault();

    if (!reserva) {
      return;
    }

    try {
      setProcessando(true);
      setErro("");

      await api.patch(
        `/hotel/${reserva.id}/checkout`,
        {
          observacoes:
            observacoes.trim() || null,
        }
      );

      navigate("/hotel");
    } catch (error) {
      console.error(
        "Erro ao realizar check-out:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível realizar o check-out."
      );
    } finally {
      setProcessando(false);
    }
  }

  if (carregando) {
    return (
      <div className="operacao-hotel">
        <p>Carregando hospedagem...</p>
      </div>
    );
  }

  return (
    <div className="operacao-hotel">
      <div className="operacao-hotel-cabecalho">
        <div>
          <h1>Check-out do Hotel</h1>

          <p>
            Confirme os dados antes de registrar
            a saída do pet.
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
        <form onSubmit={confirmarCheckout}>
          <section className="operacao-hotel-card">
            <div className="operacao-hotel-status hospedado">
              HOSPEDADO
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
                <span>Check-in realizado</span>
                <strong>
                  {formatarData(
                    reserva.checkin_em
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

            {reserva.observacoes_checkin && (
              <div className="operacao-hotel-observacao">
                <strong>
                  Observações do check-in
                </strong>

                <p>
                  {reserva.observacoes_checkin}
                </p>
              </div>
            )}
          </section>

          <section className="operacao-hotel-card">
            <h2>Observações do check-out</h2>

            <textarea
              rows="5"
              placeholder="Informações sobre a saída, entrega ao tutor ou outras observações..."
              value={observacoes}
              onChange={(event) =>
                setObservacoes(
                  event.target.value
                )
              }
            />
          </section>

          <div className="operacao-hotel-aviso">
            Ao confirmar, esta hospedagem passará de{" "}
            <strong>HOSPEDADO</strong> para{" "}
            <strong>FINALIZADO</strong> e o horário
            real da saída será registrado.
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
                : "Confirmar Check-out"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CheckoutHotel;