import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Atendimentos.css";


function HistoricoAtendimento() {
  const navigate = useNavigate();

  const [atendimentos, setAtendimentos] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");


  /*
   * O histórico contém somente atendimentos
   * finalizados ou cancelados.
   */
  async function carregarHistorico() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          "/atendimentos/historico"
        );


      const dados =
        Array.isArray(resposta.data)
          ? resposta.data
          : resposta.data.atendimentos || [];


      setAtendimentos(dados);

    } catch (error) {
      console.error(
        "Erro ao carregar histórico:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar o histórico."
      );

    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    let ativo = true;
    queueMicrotask(() => {
      if (ativo) void carregarHistorico();
    });
    return () => { ativo = false; };
  }, []);


  function formatarDataHora(data) {
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
    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return "Nenhum serviço";
    }

    return servicos
      .map((servico) => servico.nome)
      .join(" + ");
  }


  function formatarStatus(status) {
    const nomes = {
      FINALIZADO: "Finalizado",
      CANCELADO: "Cancelado",
      RECUSADO: "Solicitação recusada",
    };

    return nomes[status] || status;
  }


  function classeStatus(status) {
    const classes = {
      FINALIZADO:
        "atendimento-status-finalizado",

      CANCELADO:
        "atendimento-status-cancelado",

      RECUSADO:
        "atendimento-status-cancelado",
    };

    return classes[status] || "";
  }


  /*
   * O status do atendimento e o status do pagamento
   * representam situações diferentes.
   *
   * Um atendimento pode estar FINALIZADO e seu pagamento
   * estar PAGO, PENDENTE ou ESTORNADO.
   */
  function formatarStatusPagamento(status) {
    const nomes = {
      PENDENTE: "Pendente",
      PAGO: "Pago",
      CANCELADO: "Cancelado",
      ESTORNADO: "Estornado",
    };

    return nomes[status] || status || "-";
  }


  function classeStatusPagamento(status) {
    const classes = {
      PENDENTE:
        "atendimento-pagamento-pendente",

      PAGO:
        "atendimento-pagamento-pago",

      CANCELADO:
        "atendimento-pagamento-cancelado",

      ESTORNADO:
        "atendimento-pagamento-estornado",
    };

    return classes[status] || "";
  }


  /*
   * A busca considera pet, tutor e qualquer
   * serviço presente no atendimento.
   */
  const atendimentosFiltrados =
    atendimentos.filter(
      (atendimento) => {
        const termo =
          busca.trim().toLowerCase();

        if (!termo) {
          return true;
        }


        const encontrouServico =
          Array.isArray(
            atendimento.servicos
          ) &&
          atendimento.servicos.some(
            (servico) =>
              servico.nome
                ?.toLowerCase()
                .includes(termo)
          );


        return (
          atendimento.pet_nome
            ?.toLowerCase()
            .includes(termo) ||

          atendimento.tutor_nome
            ?.toLowerCase()
            .includes(termo) ||

          encontrouServico
        );
      }
    );


  const totalFinalizados =
    atendimentos.filter(
      (atendimento) =>
        atendimento.status ===
        "FINALIZADO"
    ).length;


  const totalCancelados =
    atendimentos.filter(
      (atendimento) =>
        atendimento.status ===
        "CANCELADO"
    ).length;


  return (
    <div className="atendimento-page">

      <div className="atendimento-header">

        <div>
          <h1>Histórico de Atendimentos</h1>

          <p>
            Consulte os atendimentos finalizados
            e os agendamentos cancelados.
          </p>
        </div>


        <div className="atendimento-header-acoes">

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


      <div className="atendimento-resumos">

        <div className="atendimento-resumo">

          <span>
            Finalizados
          </span>

          <strong>
            {carregando
              ? "..."
              : totalFinalizados}
          </strong>

        </div>


        <div className="atendimento-resumo">

          <span>
            Cancelados
          </span>

          <strong>
            {carregando
              ? "..."
              : totalCancelados}
          </strong>

        </div>

      </div>


      <div className="atendimento-busca">

        <input
          type="text"
          placeholder="Buscar por pet, tutor ou serviço..."
          value={busca}
          onChange={(event) =>
            setBusca(event.target.value)
          }
        />

      </div>


      {erro && (
        <div className="atendimento-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="atendimento-mensagem">
          Carregando...
        </div>

      ) : atendimentosFiltrados.length === 0 ? (

        <div className="atendimento-vazio">

          <h3>
            Nenhum atendimento encontrado
          </h3>

          <p>
            {busca
              ? "Nenhum atendimento corresponde à pesquisa."
              : "Ainda não existem atendimentos no histórico."}
          </p>

        </div>

      ) : (

        <div className="atendimento-grid">

          {atendimentosFiltrados.map(
            (atendimento) => (

              <div
                className="atendimento-card"
                key={atendimento.id}
              >

                <div className="atendimento-card-topo">

                  <div>

                    <h3>
                      {atendimento.pet_nome}
                    </h3>

                    <span>
                      Tutor:{" "}
                      {atendimento.tutor_nome}
                    </span>

                  </div>


                  <span
                    className={
                      `atendimento-status ${classeStatus(
                        atendimento.status
                      )}`
                    }
                  >
                    {formatarStatus(
                      atendimento.status
                    )}
                  </span>

                </div>


                <div className="atendimento-card-info">

                  <div>

                    <span>
                      Serviços
                    </span>

                    <strong>
                      {formatarServicos(
                        atendimento.servicos
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      Agendado para
                    </span>

                    <strong>
                      {formatarDataHora(
                        atendimento.agendado_para
                      )}
                    </strong>

                  </div>


                  {atendimento.status ===
                    "FINALIZADO" && (

                    <div>

                      <span>
                        Finalizado em
                      </span>

                      <strong>
                        {formatarDataHora(
                          atendimento.finalizado_em
                        )}
                      </strong>

                    </div>

                  )}


                  <div>

                    <span>
                      Valor total
                    </span>

                    <strong>
                      {formatarValor(
                        atendimento.valor_total
                      )}
                    </strong>

                  </div>


                  <div>

                    <span>
                      Pagamento
                    </span>

                    <strong
                      className={
                        `atendimento-pagamento-card ${classeStatusPagamento(
                          atendimento.pagamento_status
                        )}`
                      }
                    >
                      {formatarStatusPagamento(
                        atendimento.pagamento_status
                      )}
                    </strong>

                  </div>

                </div>


                {atendimento.status ===
                  "CANCELADO" &&
                  atendimento.motivo_cancelamento && (

                  <div className="atendimento-observacao">

                    <span>
                      Motivo do cancelamento
                    </span>

                    <p>
                      {
                        atendimento
                          .motivo_cancelamento
                      }
                    </p>

                  </div>

                )}


                <div className="atendimento-card-acoes">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      navigate(
                        `/atendimentos/${atendimento.id}`
                      )
                    }
                  >
                    Ver Atendimento
                  </button>

                </div>

              </div>

            )
          )}

        </div>

      )}

    </div>
  );
}


export default HistoricoAtendimento;
