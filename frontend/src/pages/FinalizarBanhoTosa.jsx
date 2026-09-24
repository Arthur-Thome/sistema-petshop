import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function FinalizarBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [atendimento, setAtendimento] =
    useState(null);

  const [
    observacoesAtendimento,
    setObservacoesAtendimento,
  ] = useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega os dados atuais do atendimento antes
   * de permitir sua finalização.
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

        setObservacoesAtendimento(
          dados.observacoes_atendimento ||
          ""
        );

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


  function formatarServicos(servicos) {
    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return "-";
    }

    return servicos
      .map((servico) => servico.nome)
      .join(" + ");
  }


  /*
   * A finalização registra a hora no backend e
   * preserva as observações feitas pelo funcionário.
   */
  async function finalizar(event) {
    event.preventDefault();

    try {
      setProcessando(true);
      setErro("");

      await api.patch(
        `/atendimentos/${id}/finalizar`,
        {
          observacoes_atendimento:
            observacoesAtendimento.trim() ||
            null,
        }
      );


      /*
       * Após finalizar, levamos o funcionário
       * diretamente ao comprovante para conferir
       * os dados do atendimento.
       */
      navigate(
        `/atendimentos/${id}/comprovante`
      );

    } catch (error) {
      console.error(
        "Erro ao finalizar atendimento:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível finalizar o atendimento."
      );

    } finally {
      setProcessando(false);
    }
  }


  if (carregando) {
    return (
      <div className="banho-tosa-page">

        <div className="banho-tosa-mensagem">
          Carregando...
        </div>

      </div>
    );
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>Finalizar Atendimento</h1>

          <p>
            Registre as informações finais
            do atendimento.
          </p>
        </div>


        <div className="banho-tosa-header-acoes">

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
        <div className="banho-tosa-erro">
          {erro}
        </div>
      )}


      {atendimento && (

        <div className="banho-tosa-form-card">

          <div className="banho-tosa-finalizacao-resumo">

            <div>
              <span>Pet</span>

              <strong>
                {atendimento.pet_nome}
              </strong>
            </div>


            <div>
              <span>Serviços</span>

              <strong>
                {formatarServicos(
                  atendimento.servicos
                )}
              </strong>
            </div>

          </div>


          {atendimento.status !==
            "EM_ATENDIMENTO" ? (

            <div className="banho-tosa-erro">
              Este atendimento não pode ser
              finalizado porque seu status é{" "}
              {atendimento.status}.
            </div>

          ) : (

            <form onSubmit={finalizar}>

              <div className="banho-tosa-form-campo">

                <label htmlFor="observacoes_atendimento">
                  Observações do atendimento
                </label>

                <textarea
                  id="observacoes_atendimento"
                  value={
                    observacoesAtendimento
                  }
                  onChange={(event) =>
                    setObservacoesAtendimento(
                      event.target.value
                    )
                  }
                  rows="6"
                  placeholder="Ex.: Atendimento realizado normalmente. Pet apresentou sensibilidade nas patas..."
                />

              </div>


              <div className="banho-tosa-form-acoes">

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
                  Cancelar
                </button>


                <button
                  type="submit"
                  className="primary-button"
                  disabled={processando}
                >
                  {processando
                    ? "Finalizando..."
                    : "Finalizar Atendimento"}
                </button>

              </div>

            </form>

          )}

        </div>

      )}

    </div>
  );
}


export default FinalizarBanhoTosa;