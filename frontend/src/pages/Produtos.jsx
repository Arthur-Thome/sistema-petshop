import { useEffect, useState } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/Produtos.css";


function Produtos() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();


  /*
   * Quando estoque=baixo vier pela URL, a tela exibe
   * somente produtos ativos que precisam de reposição.
   */
  const somenteEstoqueBaixo =
    searchParams.get("estoque") === "baixo";


  /*
   * O usuário autenticado é armazenado no localStorage
   * durante o login.
   */
  const usuarioSalvo =
    localStorage.getItem("usuario");

  const usuario =
    usuarioSalvo
      ? JSON.parse(usuarioSalvo)
      : null;


  /*
   * Somente administrador e gerente podem realizar
   * alterações no módulo de produtos e estoque.
   *
   * O backend continua sendo a proteção principal.
   * Esta verificação serve para adequar a interface.
   */
  const podeGerenciar =
    [
      "administrador",
      "gerente",
    ].includes(usuario?.perfil);


  const [produtos, setProdutos] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  async function carregarProdutos() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get("/produtos");

      setProdutos(resposta.data);
    } catch (error) {
      console.error(
        "Erro ao carregar produtos:",
        error
      );

      setErro(
        "Não foi possível carregar os produtos."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarProdutos();
  }, []);


  /*
   * Primeiro aplicamos o filtro de estoque baixo.
   * Depois aplicamos a pesquisa digitada pelo usuário.
   *
   * Essa ordem é importante para que o filtro recebido
   * pela URL continue funcionando mesmo quando a caixa
   * de pesquisa estiver vazia.
   */
  const produtosFiltrados =
    produtos.filter((produto) => {
      if (
        somenteEstoqueBaixo &&
        (
          !produto.ativo ||
          !produto.estoque_baixo
        )
      ) {
        return false;
      }


      const termo =
        busca.trim().toLowerCase();


      if (!termo) {
        return true;
      }


      return (
        produto.nome
          ?.toLowerCase()
          .includes(termo) ||

        produto.categoria
          ?.toLowerCase()
          .includes(termo)
      );
    });


  function formatarValor(valor) {
    if (
      valor === null ||
      valor === undefined ||
      valor === ""
    ) {
      return "-";
    }

    return Number(valor).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    );
  }


  return (
    <div className="produtos-page">

      <div className="produtos-header">

        <div>
          <h1>
            Produtos e Estoque
          </h1>

          <p>
            Controle dos produtos utilizados
            nas atividades do pet shop.
          </p>
        </div>


        {podeGerenciar && (
          <button
            className="btn-primary"
            onClick={() =>
              navigate("/produtos/novo")
            }
          >
            + Novo Produto
          </button>
        )}

      </div>


      <div className="produtos-filtros">

        <input
          type="text"
          placeholder="Pesquisar por produto ou categoria..."
          value={busca}
          onChange={(event) =>
            setBusca(event.target.value)
          }
        />

      </div>


      {somenteEstoqueBaixo && (
        <div className="filtro-estoque-ativo">

          <span>
            Mostrando somente produtos que
            precisam de reposição.
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/produtos")
            }
          >
            Mostrar todos
          </button>

        </div>
      )}


      {erro && (
        <div className="produtos-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <p>
          Carregando produtos...
        </p>

      ) : produtosFiltrados.length === 0 ? (

        <div className="produtos-vazio">
          Nenhum produto encontrado.
        </div>

      ) : (

        <div className="produtos-tabela-container">

          <table className="produtos-tabela">

            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Mínimo</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>


            <tbody>

              {produtosFiltrados.map(
                (produto) => (

                  <tr key={produto.id}>

                    <td>
                      <strong>
                        {produto.nome}
                      </strong>

                      <div className="produto-unidade">
                        {produto.unidade}
                      </div>
                    </td>


                    <td>
                      {produto.categoria || "-"}
                    </td>


                    <td>
                      {produto.quantidade_atual}
                    </td>


                    <td>
                      {produto.quantidade_minima}
                    </td>


                    <td>
                      {formatarValor(
                        produto.valor_unitario
                      )}
                    </td>


                    <td>

                      {!produto.ativo ? (

                        <span className="status-inativo">
                          Inativo
                        </span>

                      ) : produto.estoque_baixo ? (

                        <span className="status-baixo">
                          Estoque baixo
                        </span>

                      ) : (

                        <span className="status-ok">
                          OK
                        </span>

                      )}

                    </td>


                    <td>
                      <div className="produto-acoes">

                        <button
                          className="btn-secondary"
                          onClick={() =>
                            navigate(
                              `/produtos/${produto.id}`
                            )
                          }
                        >
                          Visualizar
                        </button>
                      </div>
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      )}

    </div>
  );
}


export default Produtos;