import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/MovimentarEstoque.css";


function MovimentarEstoque() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [searchParams] = useSearchParams();

  /*
   * A ficha do produto envia o tipo pela URL:
   *
   * ?tipo=ENTRADA
   * ?tipo=SAIDA
   */
  const tipoRecebido =
    searchParams.get("tipo")?.toUpperCase();

  const tipoInicial =
    ["ENTRADA", "SAIDA"].includes(tipoRecebido)
      ? tipoRecebido
      : "ENTRADA";


  const [produto, setProduto] =
    useState(null);

  const [tipo, setTipo] =
    useState(tipoInicial);

  const [quantidade, setQuantidade] =
    useState(1);

  const [motivo, setMotivo] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega o produto para mostrar ao usuário qual
   * estoque está sendo movimentado e sua quantidade atual.
   */
  useEffect(() => {
    async function carregarProduto() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get(`/produtos/${id}`);

        setProduto(
          resposta.data.produto
        );

      } catch (error) {
        console.error(
          "Erro ao carregar produto:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar o produto."
        );

      } finally {
        setCarregando(false);
      }
    }

    carregarProduto();
  }, [id]);


  async function confirmarMovimentacao(event) {
    event.preventDefault();

    const quantidadeNumerica =
      Number(quantidade);


    if (
      !Number.isInteger(quantidadeNumerica) ||
      quantidadeNumerica <= 0
    ) {
      setErro(
        "Informe uma quantidade inteira maior que zero."
      );

      return;
    }


    /*
     * Fazemos uma validação também no frontend para
     * fornecer retorno imediato ao usuário.
     *
     * O backend continua realizando a mesma validação
     * por segurança.
     */
    if (
      tipo === "SAIDA" &&
      produto &&
      quantidadeNumerica >
        Number(produto.quantidade_atual)
    ) {
      setErro(
        `A quantidade informada é maior que o estoque disponível (${produto.quantidade_atual}).`
      );

      return;
    }


    try {
      setSalvando(true);
      setErro("");


      await api.post(
        `/estoque/produtos/${id}/movimentacoes`,
        {
          tipo,
          quantidade: quantidadeNumerica,
          motivo: motivo.trim() || null,
        }
      );


      /*
       * Após a movimentação voltamos para a ficha.
       * Ela será carregada novamente e mostrará tanto
       * a nova quantidade quanto o novo histórico.
       */
      navigate(
        `/produtos/${id}`,
        {
          replace: true,
        }
      );

    } catch (error) {
      console.error(
        "Erro ao movimentar estoque:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível realizar a movimentação."
      );

    } finally {
      setSalvando(false);
    }
  }


  if (carregando) {
    return (
      <p>Carregando produto...</p>
    );
  }


  if (!produto) {
    return (
      <div className="movimentacao-erro">
        {erro || "Produto não encontrado."}
      </div>
    );
  }


  return (
    <div className="movimentacao-page">

      <div className="movimentacao-header">

        <h1>
          Movimentar Estoque
        </h1>

        <p>
          Registre uma entrada ou saída
          do estoque.
        </p>

      </div>


      <div className="movimentacao-produto">

        <div>
          <span>Produto</span>

          <strong>
            {produto.nome}
          </strong>
        </div>


        <div>
          <span>Estoque atual</span>

          <strong>
            {produto.quantidade_atual}{" "}
            {produto.unidade}
          </strong>
        </div>

      </div>


      <form
        className="movimentacao-form"
        onSubmit={confirmarMovimentacao}
      >

        {erro && (
          <div className="movimentacao-erro">
            {erro}
          </div>
        )}


        <div className="form-group">

          <label>
            Tipo de movimentação *
          </label>

          <select
            value={tipo}
            onChange={(event) => {
              setTipo(event.target.value);
              setErro("");
            }}
          >
            <option value="ENTRADA">
              Entrada
            </option>

            <option value="SAIDA">
              Saída
            </option>
          </select>

        </div>


        <div className="form-group">

          <label>
            Quantidade *
          </label>

          <input
            type="number"
            min="1"
            step="1"
            value={quantidade}
            onChange={(event) =>
              setQuantidade(
                event.target.value
              )
            }
            required
          />

          <small>
            Quantidade em {produto.unidade}.
          </small>

        </div>


        <div className="form-group">

          <label>
            Motivo
            <span className="campo-opcional">
              {" "}(opcional)
            </span>
          </label>

          <input
            type="text"
            value={motivo}
            maxLength="255"
            onChange={(event) =>
              setMotivo(event.target.value)
            }
            placeholder={
              tipo === "ENTRADA"
                ? "Ex.: Reposição de estoque"
                : "Ex.: Produto finalizado"
            }
          />

        </div>


        {tipo === "SAIDA" && (

          <div className="movimentacao-aviso">

            Após esta saída, o estoque ficará
            com{" "}

            <strong>
              {Math.max(
                0,
                Number(
                  produto.quantidade_atual
                ) -
                Number(quantidade || 0)
              )}
            </strong>

            {" "}
            {produto.unidade}.

          </div>

        )}


        {tipo === "ENTRADA" && (

          <div className="movimentacao-aviso">

            Após esta entrada, o estoque ficará
            com{" "}

            <strong>
              {
                Number(
                  produto.quantidade_atual
                ) +
                Number(quantidade || 0)
              }
            </strong>

            {" "}
            {produto.unidade}.

          </div>

        )}


        <div className="movimentacao-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(`/produtos/${id}`)
            }
            disabled={salvando}
          >
            Cancelar
          </button>


          <button
            type="submit"
            className="primary-button"
            disabled={salvando}
          >
            {salvando
              ? "Salvando..."
              : tipo === "ENTRADA"
                ? "Confirmar Entrada"
                : "Confirmar Saída"}
          </button>

        </div>

      </form>

    </div>
  );
}


export default MovimentarEstoque;