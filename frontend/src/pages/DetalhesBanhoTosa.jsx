import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function DetalhesBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [atendimento, setAtendimento] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega todos os dados do atendimento.
   *
   * O backend já devolve pet, tutor, serviços
   * contratados e informações financeiras.
   */
  async function carregarAtendimento() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          `/atendimentos/${id}`
        );

      setAtendimento(
        resposta.data.atendimento
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


  useEffect(() => {
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


  function formatarStatus(status) {
    const nomes = {
      AGENDADO: "Agendado",
      EM_ATENDIMENTO:
        "Em atendimento",
      FINALIZADO: "Finalizado",
      CANCELADO: "Cancelado",
    };

    return nomes[status] || status;
  }


  function classeStatus(status) {
    /*
     * As classes CSS mantêm o nome antigo
     * temporariamente para preservar o layout atual.
     */
    const classes = {
      AGENDADO:
        "banho-tosa-status-agendado",

      EM_ATENDIMENTO:
        "banho-tosa-status-atendimento",

      FINALIZADO:
        "banho-tosa-status-finalizado",

      CANCELADO:
        "banho-tosa-status-cancelado",
    };

    return classes[status] || "";
  }


  /*
   * Um atendimento somente pode ser iniciado
   * quando ainda está com status AGENDADO.
   */
  async function iniciarAtendimento() {
    try {
      setProcessando(true);
      setErro("");

      await api.patch(
        `/atendimentos/${id}/iniciar`
      );

      await carregarAtendimento();

    } catch (error) {
      console.error(
        "Erro ao iniciar atendimento:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível iniciar o atendimento."
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


  if (!atendimento) {
    return (
      <div className="banho-tosa-page">

        {erro && (
          <div className="banho-tosa-erro">
            {erro}
          </div>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/atendimentos")
          }
        >
          Voltar
        </button>

      </div>
    );
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>Atendimento</h1>

          <p>
            Informações do agendamento de
            {` ${atendimento.pet_nome}.`}
          </p>
        </div>


        <div className="banho-tosa-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/atendimentos")
            }
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


      <div className="banho-tosa-detalhes-card">

        <div className="banho-tosa-detalhes-topo">

          <div>
            <h2>
              {atendimento.pet_nome}
            </h2>

            <p>
              {atendimento.pet_especie || "Pet"}

              {atendimento.pet_raca
                ? ` • ${atendimento.pet_raca}`
                : ""}
            </p>
          </div>


          <span
            className={
              `banho-tosa-status ${classeStatus(
                atendimento.status
              )}`
            }
          >
            {formatarStatus(
              atendimento.status
            )}
          </span>

        </div>


        <div className="banho-tosa-detalhes-grid">

          <div>
            <span>Tutor</span>

            <strong>
              {atendimento.tutor_nome}
            </strong>
          </div>


          <div>
            <span>Telefone</span>

            <strong>
              {atendimento.tutor_telefone ||
                "-"}
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


          <div>
            <span>Iniciado em</span>

            <strong>
              {formatarDataHora(
                atendimento.iniciado_em
              )}
            </strong>
          </div>


          <div>
            <span>Finalizado em</span>

            <strong>
              {formatarDataHora(
                atendimento.finalizado_em
              )}
            </strong>
          </div>


          <div>
            <span>Pagamento</span>

            <strong>
              {atendimento.pagamento_status === "PAGO"
                ? "Pago"
                : atendimento.pagamento_status === "CANCELADO"
                  ? "Cancelado"
                  : "Pendente"}
            </strong>
          </div>


          {atendimento.pagamento_status === "PAGO" && (
            <>
              <div>
                <span>
                  Forma de pagamento
                </span>

                <strong>
                  {atendimento.pagamento_metodo ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>Pago em</span>

                <strong>
                  {formatarDataHora(
                    atendimento.pagamento_pago_em
                  )}
                </strong>
              </div>
            </>
          )}

        </div>

      </div>


      <div className="banho-tosa-detalhes-card">

        <h2>Serviços</h2>


        <div className="banho-tosa-detalhes-servicos">

          {(atendimento.servicos || []).map(
            (servico) => (

              <div
                className="banho-tosa-detalhes-servico"
                key={servico.id}
              >

                <div>
                  <strong>
                    {servico.nome}
                  </strong>

                  {servico.duracao_minutos && (
                    <span>
                      {servico.duracao_minutos}
                      {" minutos"}
                    </span>
                  )}
                </div>


                <strong>
                  {formatarValor(
                    servico.valor
                  )}
                </strong>

              </div>

            )
          )}

        </div>


        <div className="banho-tosa-detalhes-total">

          <span>Total</span>

          <strong>
            {formatarValor(
              atendimento.valor_total
            )}
          </strong>

        </div>

      </div>


      {atendimento.observacoes_agendamento && (

        <div className="banho-tosa-detalhes-card">

          <h2>
            Observações do agendamento
          </h2>

          <p className="banho-tosa-detalhes-observacao">
            {
              atendimento
                .observacoes_agendamento
            }
          </p>

        </div>

      )}


      {atendimento.observacoes_atendimento && (

        <div className="banho-tosa-detalhes-card">

          <h2>
            Observações do atendimento
          </h2>

          <p className="banho-tosa-detalhes-observacao">
            {
              atendimento
                .observacoes_atendimento
            }
          </p>

        </div>

      )}


      <div className="banho-tosa-detalhes-acoes">

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              `/pets/${atendimento.pet_id}`
            )
          }
        >
          Ver Pet
        </button>


        {atendimento.status === "AGENDADO" && (
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                navigate(
                  `/atendimentos/${id}/cancelar`
                )
              }
              disabled={processando}
            >
              Cancelar Agendamento
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={iniciarAtendimento}
              disabled={processando}
            >
              {processando
                ? "Processando..."
                : "Iniciar Atendimento"}
            </button>
          </>
        )}


        {atendimento.pagamento_status === "PENDENTE" && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/atendimentos/${id}/pagamento`
              )
            }
          >
            Marcar como Pago
          </button>
        )}


        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate(
              `/atendimentos/${id}/comprovante`
            )
          }
        >
          Ver Comprovante
        </button>


        {atendimento.status === "EM_ATENDIMENTO" && (
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate(
                `/atendimentos/${id}/finalizar`
              )
            }
          >
            Finalizar Atendimento
          </button>
        )}

      </div>

    </div>
  );
}


export default DetalhesBanhoTosa;