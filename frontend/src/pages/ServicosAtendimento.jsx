import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";
import ModalConfirmacaoSenha from "../components/ModalConfirmacaoSenha";

import "../styles/Atendimentos.css";


function ServicosAtendimento() {
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
    let ativo = true;
    queueMicrotask(() => {
      if (ativo) void carregarServicos();
    });
    return () => { ativo = false; };
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
    <div className="atendimento-page">

      <div className="atendimento-header">

        <div>
          <h1>Serviços</h1>

          <p>
            Cadastre e gerencie os serviços
            oferecidos nos atendimentos.
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


      <div className="atendimento-resumo">

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


      <div className="atendimento-busca">

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
        <div className="atendimento-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="atendimento-mensagem">
          Carregando...
        </div>

      ) : servicosFiltrados.length === 0 ? (

        <div className="atendimento-vazio">

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

        <div className="atendimento-servicos-grid">

          {servicosFiltrados.map(
            (servico) => (

              <div
                className="atendimento-servico-card"
                key={servico.id}
              >

                <div className="atendimento-servico-card-topo">

                  <div>

                    <h3>
                      {servico.nome}
                    </h3>

                    <span
                      className={
                        servico.ativo
                          ? "atendimento-servico-status ativo"
                          : "atendimento-servico-status inativo"
                      }
                    >
                      {servico.ativo
                        ? "Ativo"
                        : "Inativo"}
                    </span>

                  </div>


                  <strong className="atendimento-servico-valor">
                    {formatarValor(
                      servico.valor
                    )}
                  </strong>

                </div>


                {servico.descricao && (

                  <p className="atendimento-servico-descricao">
                    {servico.descricao}
                  </p>

                )}


                <div className="atendimento-servico-dados">

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


                <div className="atendimento-card-acoes">

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


export default ServicosAtendimento;