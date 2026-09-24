import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import "../styles/BanhoTosa.css";


function ServicosBanhoTosa() {
  const navigate = useNavigate();

  const [servicos, setServicos] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  /*
   * Estados utilizados para a alteração de status.
   */
  const [servicoSelecionado, setServicoSelecionado] =
    useState(null);

  const [modalAberto, setModalAberto] =
    useState(false);

  const [processandoStatus, setProcessandoStatus] =
    useState(false);

  const [erroConfirmacao, setErroConfirmacao] =
    useState("");


  /*
   * Carrega todos os serviços.
   *
   * Mantemos também os inativos na listagem administrativa
   * para preservar o histórico e permitir reativação.
   */
  async function carregarServicos() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get("/servicos");

      const dados =
        Array.isArray(resposta.data)
          ? resposta.data
          : resposta.data.servicos || [];

      setServicos(dados);

    } catch (error) {
      console.error(
        "Erro ao carregar serviços:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar os serviços."
      );

    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarServicos();
  }, []);


  /*
   * Pesquisa local por nome ou descrição.
   */
  const servicosFiltrados =
    servicos.filter((servico) => {
      const termo =
        busca.trim().toLowerCase();

      if (!termo) {
        return true;
      }

      return (
        servico.nome
          ?.toLowerCase()
          .includes(termo) ||

        servico.descricao
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


  /*
   * Solicita confirmação antes de ativar ou
   * inativar um serviço.
   */
  function solicitarAlteracaoStatus(servico) {
    setServicoSelecionado(servico);
    setErroConfirmacao("");
    setModalAberto(true);
  }


  /*
   * A alteração de status é considerada uma
   * operação crítica e exige confirmação da senha.
   */
  async function confirmarAlteracaoStatus(senha) {
    if (!servicoSelecionado) {
      return;
    }

    try {
      setProcessandoStatus(true);
      setErroConfirmacao("");

      await api.patch(
        `/servicos/${servicoSelecionado.id}/status`,
        {
          ativo: !servicoSelecionado.ativo,
        },
        {
          headers: {
            "X-Confirm-Password": senha,
          },
        }
      );

      setModalAberto(false);
      setServicoSelecionado(null);

      await carregarServicos();

    } catch (error) {
      console.error(
        "Erro ao alterar status do serviço:",
        error
      );

      setErroConfirmacao(
        error.response?.data?.mensagem ||
        "Não foi possível alterar o status do serviço."
      );

    } finally {
      setProcessandoStatus(false);
    }
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>Serviços</h1>

          <p>
            Cadastre e gerencie os serviços
            oferecidos nos atendimentos.
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


          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate(
                "/atendimentos/servicos/novo"
              )
            }
          >
            + Novo Serviço
          </button>

        </div>

      </div>


      <div className="banho-tosa-resumo">

        <span>
          Serviços ativos
        </span>

        <strong>
          {carregando
            ? "..."
            : servicos.filter(
                (servico) =>
                  servico.ativo
              ).length}
        </strong>

      </div>


      <div className="banho-tosa-busca">

        <input
          type="text"
          placeholder="Buscar serviço..."
          value={busca}
          onChange={(event) =>
            setBusca(event.target.value)
          }
        />

      </div>


      {erro && (
        <div className="banho-tosa-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="banho-tosa-mensagem">
          Carregando...
        </div>

      ) : servicosFiltrados.length === 0 ? (

        <div className="banho-tosa-vazio">

          <h3>
            Nenhum serviço encontrado
          </h3>

          <p>
            {busca
              ? "Nenhum serviço corresponde à pesquisa."
              : "Ainda não existem serviços cadastrados."}
          </p>

        </div>

      ) : (

        <div className="banho-tosa-servicos-grid">

          {servicosFiltrados.map(
            (servico) => (

              <div
                className="banho-tosa-servico-card"
                key={servico.id}
              >

                <div className="banho-tosa-servico-card-topo">

                  <div>

                    <h3>
                      {servico.nome}
                    </h3>

                    <span
                      className={
                        servico.ativo
                          ? "banho-tosa-servico-status ativo"
                          : "banho-tosa-servico-status inativo"
                      }
                    >
                      {servico.ativo
                        ? "Ativo"
                        : "Inativo"}
                    </span>

                  </div>


                  <strong className="banho-tosa-servico-valor">
                    {formatarValor(
                      servico.valor
                    )}
                  </strong>

                </div>


                {servico.descricao && (

                  <p className="banho-tosa-servico-descricao">
                    {servico.descricao}
                  </p>

                )}


                <div className="banho-tosa-servico-dados">

                  <div>

                    <span>
                      Duração aproximada
                    </span>

                    <strong>
                      {servico.duracao_minutos
                        ? `${servico.duracao_minutos} minutos`
                        : "Não informada"}
                    </strong>

                  </div>

                </div>


                <div className="banho-tosa-card-acoes">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      navigate(
                        `/atendimentos/servicos/${servico.id}/editar`
                      )
                    }
                  >
                    Editar
                  </button>


                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      solicitarAlteracaoStatus(
                        servico
                      )
                    }
                  >
                    {servico.ativo
                      ? "Inativar"
                      : "Reativar"}
                  </button>

                </div>

              </div>

            )
          )}

        </div>

      )}


      {servicoSelecionado && (

        <ModalConfirmacaoSenha
          aberto={modalAberto}

          titulo={
            servicoSelecionado.ativo
              ? "Inativar serviço?"
              : "Reativar serviço?"
          }

          mensagem={
            servicoSelecionado.ativo
              ? `Confirme sua senha para inativar o serviço "${servicoSelecionado.nome}". Ele deixará de aparecer nos novos atendimentos.`
              : `Confirme sua senha para reativar o serviço "${servicoSelecionado.nome}". Ele voltará a aparecer nos novos atendimentos.`
          }

          textoConfirmar={
            servicoSelecionado.ativo
              ? "Inativar Serviço"
              : "Reativar Serviço"
          }

          processando={
            processandoStatus
          }

          erro={
            erroConfirmacao
          }

          onConfirmar={
            confirmarAlteracaoStatus
          }

          onCancelar={() => {
            setModalAberto(false);
            setServicoSelecionado(null);
            setErroConfirmacao("");
          }}
        />

      )}

    </div>
  );
}


export default ServicosBanhoTosa;