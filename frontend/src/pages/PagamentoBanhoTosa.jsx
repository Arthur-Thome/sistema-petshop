import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function PagamentoBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [atendimento, setAtendimento] =
    useState(null);

  const [metodo, setMetodo] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega os dados do atendimento antes de
   * permitir o registro do pagamento.
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

        setAtendimento(
          resposta.data.atendimento ||
          resposta.data
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


  function formatarServicos(servicos) {
    if (!Array.isArray(servicos)) {
      return "-";
    }

    return servicos
      .map((servico) => servico.nome)
      .join(" + ");
  }


  /*
   * O pagamento é registrado no backend.
   *
   * O valor não é enviado pelo frontend porque
   * o valor oficial do atendimento já está salvo
   * e controlado pelo backend.
   */
  async function confirmar(event) {
    event.preventDefault();

    if (!metodo) {
      setErro(
        "Selecione a forma de pagamento."
      );

      return;
    }

    try {
      setProcessando(true);
      setErro("");

      await api.patch(
        `/atendimentos/${id}/pagamento`,
        {
          metodo,
        }
      );

      navigate(
        `/atendimentos/${id}`
      );

    } catch (error) {
      console.error(
        "Erro ao confirmar pagamento:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível confirmar o pagamento."
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
          <h1>Confirmar Pagamento</h1>

          <p>
            Registre o recebimento do atendimento.
          </p>
        </div>


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


      {erro && (
        <div className="banho-tosa-erro">
          {erro}
        </div>
      )}


      {atendimento && (

        <div className="banho-tosa-form-card">

          <div className="banho-tosa-pagamento-resumo">

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


            <div>
              <span>Valor</span>

              <strong className="banho-tosa-pagamento-valor">
                {formatarValor(
                  atendimento.valor_total
                )}
              </strong>
            </div>

          </div>


          {atendimento.pagamento_status ===
            "PAGO" ? (

            <div className="banho-tosa-mensagem">
              Este atendimento já está pago.
            </div>

          ) : (

            <form onSubmit={confirmar}>

              <div className="banho-tosa-form-campo">

                <label htmlFor="metodo">
                  Forma de pagamento *
                </label>

                <select
                  id="metodo"
                  value={metodo}
                  onChange={(event) =>
                    setMetodo(
                      event.target.value
                    )
                  }
                  required
                >

                  <option value="">
                    Selecione
                  </option>

                  <option value="PIX">
                    Pix
                  </option>

                  <option value="DINHEIRO">
                    Dinheiro
                  </option>

                  <option value="CARTAO_DEBITO">
                    Cartão de Débito
                  </option>

                  <option value="CARTAO_CREDITO">
                    Cartão de Crédito
                  </option>

                </select>

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
                    ? "Confirmando..."
                    : "Confirmar Pagamento"}
                </button>

              </div>

            </form>

          )}

        </div>

      )}

    </div>
  );
}


export default PagamentoBanhoTosa;