import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/DetalhesProduto.css";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";


function DetalhesProduto() {
  const navigate = useNavigate();
  const { id } = useParams();

  const usuarioSalvo =
    localStorage.getItem("usuario");

  const usuario =
    usuarioSalvo
      ? JSON.parse(usuarioSalvo)
      : null;

  const podeGerenciar =
    ["administrador", "gerente"].includes(
      usuario?.perfil
    );


  const [produto, setProduto] =
    useState(null);

  const [movimentacoes, setMovimentacoes] =
    useState([]);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  const [modalStatusAberto, setModalStatusAberto] =
    useState(false);

  const [alterandoStatus, setAlterandoStatus] =
    useState(false);
  
  const [erroConfirmacao, setErroConfirmacao,] = 
    useState("");

/*
 * Ativar/inativar é uma operação crítica.
 * Por isso enviamos novamente a senha do usuário
 * através do cabeçalho X-Confirm-Password.
 */
async function confirmarAlteracaoStatus(senha) {
  try {
    setAlterandoStatus(true);
    setErroConfirmacao("");


    const novoStatus =
      !produto.ativo;


    const resposta = await api.patch(
      `/produtos/${id}/status`,

      {
        ativo: novoStatus,
      },

      {
        headers: {
          "X-Confirm-Password": senha,
        },
      }
    );


    /*
     * Atualiza os dados da tela sem precisar
     * recarregar manualmente a página.
     */
    setProduto(
      resposta.data.produto
    );


    setModalStatusAberto(false);
    setErroConfirmacao("");

  } catch (error) {

    console.error(
      "Erro ao alterar status do produto:",
      error
    );


    setErroConfirmacao(
      error.response?.data?.mensagem ||
      "Não foi possível confirmar a operação."
    );

  } finally {

    setAlterandoStatus(false);

  }
}

  async function carregarDados() {
    try {
      setCarregando(true);
      setErro("");

      /*
       * Produto e histórico são carregados juntos
       * para montar a ficha completa do estoque.
       */
      const [
        respostaProduto,
        respostaMovimentacoes,
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
        respostaMovimentacoes.data
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


  useEffect(() => {
    carregarDados();
  }, [id]);


  function formatarValor(valor) {
    if (
      valor === null ||
      valor === undefined ||
      valor === ""
    ) {
      return "Não informado";
    }

    return Number(valor).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL",
      }
    );
  }


  function formatarData(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }

  async function alterarStatus(senha) {
    try {

      setAlterandoStatus(true);
      setErro("");


      /*
      * Se está ativo, envia false.
      * Se está inativo, envia true.
      */
      const novoStatus =
        !produto.ativo;


      const resposta =
        await api.patch(
          `/produtos/${id}/status`,

          {
            ativo: novoStatus,
          },

          {
            headers: {
              "X-Confirm-Password":
                senha,
            },
          }
        );


      /*
      * Atualiza a ficha sem precisar
      * recarregar toda a página.
      */
      setProduto(
        resposta.data.produto
      );


      setModalStatusAberto(false);

    } catch (error) {

      console.error(
        "Erro ao alterar status do produto:",
        error
      );


      /*
      * O modal que já utilizamos no sistema
      * poderá tratar a senha incorreta.
      */
      throw error;

    } finally {

      setAlterandoStatus(false);

    }
  }

  if (carregando) {
    return (
      <p>
        Carregando produto...
      </p>
    );
  }


  if (erro) {
    return (
      <div className="produto-detalhes-erro">
        {erro}
      </div>
    );
  }


  if (!produto) {
    return null;
  }


  return (
    <div className="produto-detalhes-page">

      <div className="produto-detalhes-header">

        <div>
          <button
            className="btn-link"
            onClick={() =>
              navigate("/produtos")
            }
          >
            ← Voltar
          </button>

          <h1>
            {produto.nome}
          </h1>

          <p>
            {produto.categoria ||
              "Sem categoria"}
          </p>
        </div>


        <div className="produto-header-acoes">

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
            Estoque OK
          </span>

        )}


        {podeGerenciar && (

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/produtos/${id}/editar`
              )
            }
          >
            Editar Produto
          </button>

        )}

        {podeGerenciar && (
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setModalStatusAberto(true)
            }
          >
            {produto.ativo
              ? "Inativar Produto"
              : "Reativar Produto"}
          </button>

        )}

      </div>

      </div>


      <div className="produto-resumo">

        <div className="produto-resumo-card">
          <span>
            Quantidade atual
          </span>

          <strong>
            {produto.quantidade_atual}
          </strong>

          <small>
            {produto.unidade}
          </small>
        </div>


        <div className="produto-resumo-card">
          <span>
            Quantidade mínima
          </span>

          <strong>
            {produto.quantidade_minima}
          </strong>

          <small>
            {produto.unidade}
          </small>
        </div>


        <div className="produto-resumo-card">
          <span>
            Valor unitário
          </span>

          <strong className="valor-produto">
            {formatarValor(
              produto.valor_unitario
            )}
          </strong>
        </div>

      </div>


      <div className="produto-info-card">

        <h2>
          Informações
        </h2>

        <div className="produto-info-grid">

          <div>
            <span>Categoria</span>
            <strong>
              {produto.categoria || "-"}
            </strong>
          </div>

          <div>
            <span>Unidade de controle</span>
            <strong>
              {produto.unidade}
            </strong>
          </div>

          <div>
            <span>Descrição</span>
            <strong>
              {produto.descricao || "-"}
            </strong>
          </div>

          <div>
            <span>Observações</span>
            <strong>
              {produto.observacoes || "-"}
            </strong>
          </div>

        </div>

      </div>


      {podeGerenciar && produto.ativo && (

        <div className="produto-movimentar-card">

          <div>
            <h2>
              Movimentar estoque
            </h2>

            <p>
              Registre entradas e saídas
              deste produto.
            </p>
          </div>


          <div className="produto-movimentar-acoes">

            <button
              className="btn-primary"
              onClick={() =>
                navigate(
                  `/produtos/${id}/movimentar?tipo=ENTRADA`
                )
              }
            >
              + Entrada
            </button>


            <button
              className="btn-secondary"
              onClick={() =>
                navigate(
                  `/produtos/${id}/movimentar?tipo=SAIDA`
                )
              }
            >
              − Saída
            </button>

          </div>

        </div>

      )}


      <div className="produto-historico">

        <h2>
          Histórico de movimentações
        </h2>


        {movimentacoes.length === 0 ? (

          <div className="historico-vazio">
            Nenhuma movimentação registrada.
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

                    <tr key={movimentacao.id}>

                      <td>
                        {formatarData(
                          movimentacao.criado_em
                        )}
                      </td>

                      <td>
                        <strong>
                          {movimentacao.tipo}
                        </strong>
                      </td>

                      <td>
                        {movimentacao.quantidade}
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
                        {
                          movimentacao
                            .usuario_nome
                        }
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>
      <ModalConfirmacaoSenha
        aberto={modalStatusAberto}
        titulo={
          produto.ativo
            ? "Inativar produto?"
            : "Reativar produto?"
        }
        mensagem={
          produto.ativo
            ? "Confirme sua senha para inativar este produto. O cadastro e todo o histórico de movimentações permanecerão armazenados no sistema."
            : "Confirme sua senha para reativar este produto."
        }
        textoConfirmar={
          produto.ativo
            ? "Inativar Produto"
            : "Reativar Produto"
        }
        processando={alterandoStatus}
        erro={erroConfirmacao}
        onConfirmar={confirmarAlteracaoStatus}
        onCancelar={() => {
          setModalStatusAberto(false);
          setErroConfirmacao("");
        }}
      />
    </div>
  );
}


export default DetalhesProduto;