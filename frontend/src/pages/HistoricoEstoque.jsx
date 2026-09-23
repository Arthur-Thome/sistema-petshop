import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/HistoricoEstoque.css";


function HistoricoEstoque() {
  const navigate = useNavigate();

  const { id } = useParams();


  const [produto, setProduto] =
    useState(null);

  const [
    movimentacoes,
    setMovimentacoes,
  ] = useState([]);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  useEffect(() => {
    async function carregarHistorico() {
      try {
        setCarregando(true);
        setErro("");


        /*
         * Buscamos produto e histórico separadamente.
         * Dessa forma a tela consegue apresentar também
         * a situação atual do estoque.
         */
        const [
          respostaProduto,
          respostaHistorico,
        ] = await Promise.all([
          api.get(`/produtos/${id}`),

          api.get(
            `/estoque/produtos/${id}/movimentacoes`
          ),
        ]);


        setProduto(
          respostaProduto.data.produto
        );

        setMovimentacoes(
          respostaHistorico.data
        );
      } catch (error) {
        console.error(
          "Erro ao carregar histórico:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar o histórico do produto."
        );
      } finally {
        setCarregando(false);
      }
    }


    carregarHistorico();
  }, [id]);


  function formatarData(data) {
    if (!data) {
      return "-";
    }

    return new Date(
      data
    ).toLocaleString("pt-BR");
  }


  function formatarTipo(tipo) {
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

    return tipos[tipo] || tipo;
  }


  function obterClasseTipo(tipo) {
    if (
      tipo === "ENTRADA" ||
      tipo === "AJUSTE_ENTRADA"
    ) {
      return "movimento-entrada";
    }

    return "movimento-saida";
  }


  if (carregando) {
    return (
      <div className="historico-estoque-page">
        <p>
          Carregando histórico...
        </p>
      </div>
    );
  }


  return (
    <div className="historico-estoque-page">

      <div className="historico-topo">

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/produtos")
          }
        >
          ← Voltar aos produtos
        </button>


        <div>
          <span className="historico-label">
            HISTÓRICO DE ESTOQUE
          </span>

          <h1>
            {produto?.nome ||
              "Produto"}
          </h1>

          <p>
            Acompanhe todas as entradas,
            saídas e ajustes realizados.
          </p>
        </div>

      </div>


      {erro ? (

        <div className="historico-erro">
          {erro}
        </div>

      ) : (

        <>
          <section className="estoque-resumo">

            <div className="estoque-resumo-principal">

              <span>
                Estoque atual
              </span>

              <strong>
                {produto?.quantidade_atual ?? 0}
              </strong>

              <small>
                {produto?.unidade || ""}
              </small>

            </div>


            <div className="estoque-resumo-item">

              <span>
                Estoque mínimo
              </span>

              <strong>
                {produto?.quantidade_minima ?? 0}
              </strong>

            </div>


            <div className="estoque-resumo-item">

              <span>
                Situação
              </span>

              <strong>
                {!produto?.ativo
                  ? "Inativo"
                  : produto?.estoque_baixo
                    ? "Estoque baixo"
                    : "Normal"}
              </strong>

            </div>


            <div className="estoque-resumo-item">

              <span>
                Movimentações
              </span>

              <strong>
                {movimentacoes.length}
              </strong>

            </div>

          </section>


          <section className="historico-conteudo">

            <div className="historico-titulo">

              <div>
                <h2>
                  Movimentações
                </h2>

                <p>
                  Registro completo das alterações
                  realizadas no estoque.
                </p>
              </div>

            </div>


            {movimentacoes.length === 0 ? (

              <div className="historico-vazio">
                Este produto ainda não possui
                movimentações de estoque.
              </div>

            ) : (

              <div className="historico-tabela-container">

                <table className="historico-tabela">

                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Quantidade</th>
                      <th>Anterior</th>
                      <th>Posterior</th>
                      <th>Motivo</th>
                      <th>Usuário</th>
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
                            {formatarData(
                              movimentacao.criado_em
                            )}
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


                          <td>
                            {movimentacao.motivo ||
                              "-"}
                          </td>


                          <td>
                            {movimentacao.usuario_nome ||
                              "-"}
                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>

            )}

          </section>
        </>

      )}

    </div>
  );
}


export default HistoricoEstoque;