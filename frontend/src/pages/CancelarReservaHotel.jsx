import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";
import "../styles/OperacaoHotel.css";

function CancelarReservaHotel() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reserva, setReserva] =
    useState(null);

  const [motivo, setMotivo] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  /*
   * O cancelamento somente pode ser iniciado para uma
   * reserva que ainda esteja com status AGENDADO.
   *
   * O backend verifica novamente essa condição antes
   * de efetivar qualquer alteração.
   */
  useEffect(() => {
    async function carregarReserva() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get("/hotel/ativos");

        const reservas =
          resposta.data.reservas || [];

        const encontrada =
          reservas.find(
            (item) =>
              Number(item.id) ===
              Number(id)
          );

        if (!encontrada) {
          setErro(
            "Reserva do Hotel não encontrada."
          );
          return;
        }

        if (
          encontrada.status !==
          "AGENDADO"
        ) {
          setErro(
            "Esta reserva não está disponível para cancelamento."
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

  async function confirmarCancelamento(
    event
  ) {
    event.preventDefault();

    setErro("");

    if (!motivo.trim()) {
      setErro(
        "Informe o motivo do cancelamento."
      );
      return;
    }

    if (!reserva) {
      return;
    }

    try {
      setProcessando(true);

      await api.patch(
        `/hotel/${reserva.id}/cancelar`,
        {
          motivo: motivo.trim(),
        }
      );

      navigate("/hotel");
    } catch (error) {
      console.error(
        "Erro ao cancelar reserva:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível cancelar a reserva."
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
          <h1>Cancelar Reserva</h1>

          <p>
            Confirme os dados antes de
            cancelar a hospedagem.
          </p>
        </div>

        <button
          type="button"
          className="botao-secundario"
          onClick={() =>
            navigate("/hotel")
          }
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
        <form
          onSubmit={
            confirmarCancelamento
          }
        >
          <section className="operacao-hotel-card">
            <div className="operacao-hotel-status">
              AGENDADO
            </div>

            <h2>
              {reserva.pet_nome}
            </h2>

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
                  {reserva.tutor_telefone ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>
                  Entrada prevista
                </span>

                <strong>
                  {formatarData(
                    reserva.entrada_prevista
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Saída prevista
                </span>

                <strong>
                  {formatarData(
                    reserva.saida_prevista
                  )}
                </strong>
              </div>
            </div>
          </section>

          <section className="operacao-hotel-card">
            <h2>
              Motivo do cancelamento
            </h2>

            <textarea
              rows="5"
              placeholder="Informe por que a reserva está sendo cancelada..."
              value={motivo}
              onChange={(event) =>
                setMotivo(
                  event.target.value
                )
              }
              required
            />
          </section>

          <div className="operacao-hotel-aviso">
            A reserva não será excluída.
            Ela permanecerá armazenada no
            histórico com o status{" "}
            <strong>CANCELADO</strong>.
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
              Voltar
            </button>

            <button
              type="submit"
              className="botao-principal"
              disabled={processando}
            >
              {processando
                ? "Cancelando..."
                : "Confirmar Cancelamento"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CancelarReservaHotel;