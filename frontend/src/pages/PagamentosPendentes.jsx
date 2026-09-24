import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "../styles/PagamentosPendentes.css";


function PagamentosPendentes() {
  const navigate = useNavigate();

  const [pagamentos, setPagamentos] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [buscaAplicada, setBuscaAplicada] =
    useState("");

  const [pagina, setPagina] =
    useState(1);

  const [paginacao, setPaginacao] =
    useState({
      pagina: 1,
      limite: 20,
      total: 0,
      total_paginas: 0,
    });

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * A página consulta exclusivamente o endpoint
   * administrativo de pagamentos pendentes.
   *
   * O backend continua sendo responsável por decidir
   * quais perfis podem acessar essas informações.
   */
  const carregarPagamentos =
    useCallback(async () => {
      try {
        setCarregando(true);
        setErro("");


        const resposta =
          await api.get(
            "/atendimentos/pagamentos-pendentes",
            {
              params: {
                pagina,
                limite: 20,

                ...(buscaAplicada
                  ? {
                      busca:
                        buscaAplicada,
                    }
                  : {}),
              },
            }
          );


        setPagamentos(
          Array.isArray(
            resposta.data.pagamentos
          )
            ? resposta.data.pagamentos
            : []
        );


        setPaginacao(
          resposta.data.paginacao || {
            pagina: 1,
            limite: 20,
            total: 0,
            total_paginas: 0,
          }
        );

      } catch (error) {
        console.error(
          "Erro ao carregar pagamentos pendentes:",
          error
        );


        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar os pagamentos pendentes."
        );

      } finally {
        setCarregando(false);
      }
    }, [
      pagina,
      buscaAplicada,
    ]);


  useEffect(() => {
    carregarPagamentos();
  }, [carregarPagamentos]);


  function pesquisar(event) {
    event.preventDefault();

    setPagina(1);
    setBuscaAplicada(
      busca.trim()
    );
  }


  function limparBusca() {
    setBusca("");
    setBuscaAplicada("");
    setPagina(1);
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


  function formatarDataHora(data) {
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


  function formatarStatusAtendimento(
    status
  ) {
    const nomes = {
      AGENDADO: "Agendado",
      EM_ATENDIMENTO:
        "Em atendimento",
      FINALIZADO: "Finalizado",
      CANCELADO: "Cancelado",
    };


    return nomes[status] || status;
  }


  function formatarServicos(servicos) {
    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return "Nenhum serviço informado";
    }


    return servicos
      .map((servico) => servico.nome)
      .join(" + ");
  }


  /*
   * Este valor representa apenas os registros carregados
   * na página atual. O total geral de pendências continua
   * vindo da paginação fornecida pelo backend.
   */
  const valorPagina =
    pagamentos.reduce(
      (total, pagamento) =>
        total +
        Number(
          pagamento.valor_total || 0
        ),
      0
    );


  return (
    <div className="pagamentos-page">

      <div className="pagamentos-header">

        <div>
          <span className="pagamentos-label">
            ADMINISTRATIVO
          </span>

          <h1>
            Pagamentos Pendentes
          </h1>

          <p>
            Acompanhe cobranças ainda não
            registradas como pagas.
          </p>
        </div>


        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/dashboard")
          }
        >
          Voltar ao Dashboard
        </button>

      </div>


      <div className="pagamentos-resumo">

        <div className="pagamentos-resumo-principal">

          <span>
            Pendências encontradas
          </span>

          <strong>
            {carregando
              ? "..."
              : paginacao.total}
          </strong>

          <small>
            pagamentos aguardando
            confirmação
          </small>

        </div>


        <div className="pagamentos-resumo-secundario">

          <span>
            Valor exibido nesta página
          </span>

          <strong>
            {carregando
              ? "..."
              : formatarValor(
                  valorPagina
                )}
          </strong>

          <small>
            A soma considera somente os
            registros apresentados abaixo.
          </small>

        </div>


        <form
          className="pagamentos-busca"
          onSubmit={pesquisar}
        >

          <label htmlFor="busca-pagamento">
            Localizar cobrança
          </label>


          <div className="pagamentos-busca-controles">

            <input
              id="busca-pagamento"
              type="text"
              maxLength={100}
              placeholder="Nome do pet ou tutor..."
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
            />


            <button
              type="submit"
              className="primary-button"
            >
              Buscar
            </button>


            {(busca ||
              buscaAplicada) && (

              <button
                type="button"
                className="secondary-button"
                onClick={limparBusca}
              >
                Limpar
              </button>

            )}

          </div>

        </form>

      </div>


      {erro && (
        <div className="pagamentos-erro">
          {erro}
        </div>
      )}


      <div className="pagamentos-conteudo">

        <div className="pagamentos-conteudo-topo">

          <div>
            <h2>
              Cobranças em aberto
            </h2>

            <p>
              Selecione um atendimento
              para visualizar ou registrar
              o pagamento.
            </p>
          </div>


          {!carregando &&
            paginacao.total_paginas > 0 && (

            <span>
              Página {paginacao.pagina} de{" "}
              {paginacao.total_paginas}
            </span>

          )}

        </div>


        {carregando ? (

          <div className="pagamentos-estado">
            Carregando pagamentos...
          </div>

        ) : pagamentos.length === 0 ? (

          <div className="pagamentos-vazio">

            <div className="pagamentos-vazio-icone">
              ✓
            </div>

            <h3>
              Nenhum pagamento pendente
            </h3>

            <p>
              {buscaAplicada
                ? "Nenhuma cobrança corresponde à pesquisa realizada."
                : "Não existem cobranças aguardando confirmação no momento."}
            </p>

          </div>

        ) : (

          <div className="pagamentos-lista">

            {pagamentos.map(
              (pagamento) => (

              <article
                className="pagamento-card"
                key={
                  pagamento.pagamento_id
                }
              >

                <div className="pagamento-card-identificacao">

                  <div className="pagamento-pet-avatar">
                    🐾
                  </div>


                  <div>
                    <span>
                      Pet
                    </span>

                    <h3>
                      {pagamento.pet_nome}
                    </h3>

                    <p>
                      Tutor:{" "}
                      <strong>
                        {
                          pagamento
                            .tutor_nome
                        }
                      </strong>
                    </p>
                  </div>

                </div>


                <div className="pagamento-card-detalhes">

                  <div>
                    <span>
                      Atendimento
                    </span>

                    <strong>
                      #
                      {
                        pagamento
                          .atendimento_id
                      }
                    </strong>
                  </div>


                  <div>
                    <span>
                      Agendado para
                    </span>

                    <strong>
                      {formatarDataHora(
                        pagamento
                          .agendado_para
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>
                      Situação
                    </span>

                    <strong>
                      {formatarStatusAtendimento(
                        pagamento
                          .atendimento_status
                      )}
                    </strong>
                  </div>

                </div>


                <div className="pagamento-card-servicos">

                  <span>
                    Serviços
                  </span>

                  <p>
                    {formatarServicos(
                      pagamento.servicos
                    )}
                  </p>

                </div>


                <div className="pagamento-card-financeiro">

                  <span>
                    Valor pendente
                  </span>

                  <strong>
                    {formatarValor(
                      pagamento.valor_total
                    )}
                  </strong>

                  <span className="pagamento-status">
                    Pendente
                  </span>

                </div>


                <div className="pagamento-card-acao">

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      navigate(
                        `/atendimentos/${pagamento.atendimento_id}`
                      )
                    }
                  >
                    Ver Atendimento
                  </button>

                </div>

              </article>

              )
            )}

          </div>

        )}


        {!carregando &&
          paginacao.total_paginas > 1 && (

          <div className="pagamentos-paginacao">

            <button
              type="button"
              className="secondary-button"
              disabled={pagina <= 1}
              onClick={() =>
                setPagina(
                  (anterior) =>
                    anterior - 1
                )
              }
            >
              ← Anterior
            </button>


            <span>
              Página {paginacao.pagina} de{" "}
              {paginacao.total_paginas}
            </span>


            <button
              type="button"
              className="secondary-button"
              disabled={
                pagina >=
                paginacao.total_paginas
              }
              onClick={() =>
                setPagina(
                  (anterior) =>
                    anterior + 1
                )
              }
            >
              Próxima →
            </button>

          </div>

        )}

      </div>

    </div>
  );
}


export default PagamentosPendentes;