import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "../styles/HistoricoEstoque.css";


const TIPOS_MOVIMENTACAO = [
  {
    valor: "",
    texto: "Todos os tipos",
  },
  {
    valor: "ENTRADA",
    texto: "Entrada",
  },
  {
    valor: "SAIDA",
    texto: "Saída",
  },
  {
    valor: "AJUSTE_ENTRADA",
    texto: "Ajuste de entrada",
  },
  {
    valor: "AJUSTE_SAIDA",
    texto: "Ajuste de saída",
  },
];


function HistoricoEstoque() {
  const navigate = useNavigate();

  const [
    movimentacoes,
    setMovimentacoes,
  ] = useState([]);

  const [busca, setBusca] =
    useState("");

  const [
    buscaAplicada,
    setBuscaAplicada,
  ] = useState("");

  const [tipo, setTipo] =
    useState("");

  const [pagina, setPagina] =
    useState(1);

  const [
    paginacao,
    setPaginacao,
  ] = useState({
    pagina: 1,
    limite: 20,
    total: 0,
    total_paginas: 1,
  });

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * O histórico agora é geral.
   *
   * A API recebe paginação e filtros, evitando carregar
   * indefinidamente todas as movimentações do estoque
   * conforme o sistema crescer.
   */
  const carregarHistorico =
    useCallback(async () => {
      try {
        setCarregando(true);
        setErro("");

        const params = {
          pagina,
          limite: 20,
        };

        if (buscaAplicada) {
          params.busca =
            buscaAplicada;
        }

        if (tipo) {
          params.tipo = tipo;
        }

        const resposta =
          await api.get(
            "/estoque/historico",
            {
              params,
            }
          );

        setMovimentacoes(
          resposta.data.movimentacoes ||
            []
        );

        setPaginacao(
          resposta.data.paginacao || {
            pagina: 1,
            limite: 20,
            total: 0,
            total_paginas: 1,
          }
        );
      } catch (error) {
        console.error(
          "Erro ao carregar histórico geral de estoque:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar o histórico de estoque."
        );

        setMovimentacoes([]);
      } finally {
        setCarregando(false);
      }
    }, [
      buscaAplicada,
      tipo,
      pagina,
    ]);


  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);


  function pesquisar(event) {
    event.preventDefault();

    setPagina(1);
    setBuscaAplicada(
      busca.trim()
    );
  }


  function alterarTipo(event) {
    setTipo(event.target.value);
    setPagina(1);
  }


  function limparFiltros() {
    setBusca("");
    setBuscaAplicada("");
    setTipo("");
    setPagina(1);
  }


  function formatarData(data) {
    if (!data) {
      return "-";
    }

    return new Date(
      data
    ).toLocaleString("pt-BR");
  }


  function formatarTipo(tipoMovimentacao) {
    const tipos = {
      ENTRADA:
        "Entrada",

      SAIDA:
        "Saída",

      AJUSTE_ENTRADA:
        "Ajuste de entrada",

      AJUSTE_SAIDA:
        "Ajuste de saída",
    };

    return (
      tipos[tipoMovimentacao] ||
      tipoMovimentacao
    );
  }


  function obterClasseTipo(
    tipoMovimentacao
  ) {
    if (
      tipoMovimentacao ===
        "ENTRADA" ||
      tipoMovimentacao ===
        "AJUSTE_ENTRADA"
    ) {
      return "movimento-entrada";
    }

    return "movimento-saida";
  }


  const possuiFiltros =
    Boolean(
      buscaAplicada ||
      tipo
    );


  return (
    <div className="historico-estoque-page">

      <header className="historico-geral-header">

        <div>
          <span className="historico-label">
            ADMINISTRATIVO
          </span>

          <h1>
            Histórico Geral de Estoque
          </h1>

          <p>
            Consulte entradas, saídas e
            ajustes realizados em todos os
            produtos.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/produtos")
          }
        >
          Ver produtos
        </button>

      </header>


      <section className="historico-painel">

        <div className="historico-painel-info">

          <span>
            Movimentações encontradas
          </span>

          <strong>
            {paginacao.total}
          </strong>

          <small>
            Registro administrativo do
            estoque
          </small>

        </div>


        <form
          className="historico-filtros"
          onSubmit={pesquisar}
        >

          <div className="historico-campo historico-campo-busca">

            <label htmlFor="busca-estoque">
              Produto
            </label>

            <input
              id="busca-estoque"
              type="text"
              maxLength={100}
              placeholder="Pesquisar pelo nome..."
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
            />

          </div>


          <div className="historico-campo">

            <label htmlFor="tipo-movimentacao">
              Tipo de movimentação
            </label>

            <select
              id="tipo-movimentacao"
              value={tipo}
              onChange={alterarTipo}
            >
              {TIPOS_MOVIMENTACAO.map(
                (opcao) => (
                  <option
                    key={
                      opcao.valor ||
                      "todos"
                    }
                    value={opcao.valor}
                  >
                    {opcao.texto}
                  </option>
                )
              )}
            </select>

          </div>


          <div className="historico-filtro-acoes">

            <button
              type="submit"
              className="primary-button"
            >
              Pesquisar
            </button>

            {possuiFiltros && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFiltros}
              >
                Limpar
              </button>
            )}

          </div>

        </form>

      </section>


      {erro && (
        <div className="historico-erro">
          {erro}
        </div>
      )}


      <section className="historico-conteudo">

        <div className="historico-titulo">

          <div>
            <h2>
              Movimentações
            </h2>

            <p>
              As movimentações mais recentes
              aparecem primeiro.
            </p>
          </div>

          <span className="historico-pagina-indicador">
            Página {paginacao.pagina} de{" "}
            {paginacao.total_paginas}
          </span>

        </div>


        {carregando ? (

          <div className="historico-estado">
            Carregando histórico...
          </div>

        ) : movimentacoes.length === 0 ? (

          <div className="historico-vazio">
            Nenhuma movimentação de estoque
            foi encontrada.
          </div>

        ) : (

          <div className="historico-tabela-container">

            <table className="historico-tabela">

              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Anterior</th>
                  <th>Posterior</th>
                  <th>Motivo</th>
                  <th>Responsável</th>
                  <th>Data e hora</th>
                </tr>
              </thead>


              <tbody>

                {movimentacoes.map(
                  (movimentacao) => (

                    <tr
                      key={
                        movimentacao.id
                      }
                    >

                      <td>
                        <div className="historico-produto">
                          <strong>
                            {movimentacao.produto_nome ||
                              "Produto"}
                          </strong>

                          <span>
                            {movimentacao.produto_unidade ||
                              "-"}
                          </span>
                        </div>
                      </td>


                      <td>
                        <span
                          className={
                            obterClasseTipo(
                              movimentacao.tipo
                            )
                          }
                        >
                          {formatarTipo(
                            movimentacao.tipo
                          )}
                        </span>
                      </td>


                      <td>
                        <strong>
                          {movimentacao.quantidade}
                        </strong>
                      </td>


                      <td>
                        {
                          movimentacao
                            .quantidade_anterior
                        }
                      </td>


                      <td>
                        {
                          movimentacao
                            .quantidade_posterior
                        }
                      </td>


                      <td className="historico-motivo">
                        {movimentacao.motivo ||
                          "-"}
                      </td>


                      <td>
                        {movimentacao.usuario_nome ||
                          "Usuário não disponível"}
                      </td>


                      <td className="historico-data">
                        {formatarData(
                          movimentacao.criado_em
                        )}
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}


        {!carregando &&
          !erro &&
          paginacao.total_paginas > 1 && (

            <div className="historico-paginacao">

              <button
                type="button"
                className="secondary-button"
                disabled={
                  pagina <= 1
                }
                onClick={() =>
                  setPagina(
                    (paginaAtual) =>
                      paginaAtual - 1
                  )
                }
              >
                ← Anterior
              </button>


              <span>
                Página{" "}
                <strong>
                  {paginacao.pagina}
                </strong>{" "}
                de{" "}
                <strong>
                  {paginacao.total_paginas}
                </strong>
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
                    (paginaAtual) =>
                      paginaAtual + 1
                  )
                }
              >
                Próxima →
              </button>

            </div>

          )}

      </section>

    </div>
  );
}


export default HistoricoEstoque;