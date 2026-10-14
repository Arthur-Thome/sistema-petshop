import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/Atendimentos.css";


function CancelarAtendimento() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [atendimento, setAtendimento] =
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
   * Carregamos o atendimento antes do cancelamento
   * para mostrar ao funcionário exatamente qual
   * agendamento está sendo alterado.
   */
  useEffect(() => {
    async function carregarAtendimento() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get(
            `/atendimentos/${id}`
          );

        const dados =
          resposta.data.atendimento ||
          resposta.data;

        setAtendimento(dados);

      } catch (error) {
        console.error(
          "Erro ao carregar atendimento:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar o atendimento."
        );

      } finally {
        setCarregando(false);
      }
    }


    carregarAtendimento();
  }, [id]);


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }


  /*
   * O motivo é obrigatório para mantermos um
   * histórico claro de por que o agendamento
   * deixou de ser realizado.
   */
  async function cancelar(event) {
    event.preventDefault();

    if (!motivo.trim()) {
      setErro(
        "Informe o motivo do cancelamento."
      );

      return;
    }


    try {
      setProcessando(true);
      setErro("");

      /*
       * O frontend utiliza a nova rota oficial
       * de Atendimentos para efetuar o cancelamento.
       */
      await api.patch(
        `/atendimentos/${id}/cancelar`,
        {
          motivo_cancelamento:
            motivo.trim(),
        }
      );

      /*
       * Após o cancelamento, o registro deixa
       * a lista de ativos e passa ao histórico.
       */
      navigate(
        "/atendimentos/historico"
      );

    } catch (error) {
      console.error(
        "Erro ao cancelar agendamento:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível cancelar o agendamento."
      );

    } finally {
      setProcessando(false);
    }
  }


  if (carregando) {
    return (
      <div className="atendimento-page">
        <div className="atendimento-mensagem">
          Carregando...
        </div>
      </div>
    );
  }


  return (
    <div className="atendimento-page">

      <div className="atendimento-header">

        <div>
          <h1>Cancelar Agendamento</h1>

          <p>
            Registre o motivo do cancelamento.
          </p>
        </div>


        <div className="atendimento-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/atendimentos/${id}`
              )
            }
            disabled={processando}
          >
            Voltar
          </button>

        </div>

      </div>


      {erro && (
        <div className="atendimento-erro">
          {erro}
        </div>
      )}


      {atendimento && (

        <>
          <div className="atendimento-form-card">

            <div className="atendimento-cancelamento-resumo">

              <div>
                <span>Pet</span>

                <strong>
                  {atendimento.pet_nome}
                </strong>
              </div>


              <div>
                <span>Tutor</span>

                <strong>
                  {atendimento.tutor_nome}
                </strong>
              </div>


              <div>
                <span>Agendado para</span>

                <strong>
                  {formatarDataHora(
                    atendimento.agendado_para
                  )}
                </strong>
              </div>

            </div>


            {atendimento.status !== "AGENDADO" ? (

              <div className="atendimento-erro">
                Este atendimento não pode mais ser
                cancelado porque seu status é{" "}
                {atendimento.status}.
              </div>

            ) : (

              <form onSubmit={cancelar}>

                <div className="atendimento-form-campo">

                  <label htmlFor="motivo">
                    Motivo do cancelamento *
                  </label>

                  <textarea
                    id="motivo"
                    value={motivo}
                    onChange={(event) =>
                      setMotivo(
                        event.target.value
                      )
                    }
                    rows="5"
                    placeholder="Ex.: Tutor solicitou o cancelamento..."
                    required
                  />

                </div>


                <div className="atendimento-form-acoes">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      navigate(
                        `/atendimentos/${id}`
                      )
                    }
                    disabled={processando}
                  >
                    Voltar
                  </button>


                  <button
                    type="submit"
                    className="primary-button"
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
        </>

      )}

    </div>
  );
}


export default CancelarAtendimento;