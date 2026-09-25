import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import {
  abrirWhatsApp,
  mensagemLembreteAtendimento,
  mensagemAtendimentoConcluido,
  mensagemContatoTutor,
} from "../utils/whatsapp";

import "../styles/BanhoTosa.css";


function DetalhesBanhoTosa() {
  const navigate = useNavigate();
  const { id } = useParams();

  const usuario = JSON.parse(
    localStorage.getItem("usuario") || "{}"
  );

  const perfilUsuario =
    String(usuario.perfil || "")
      .trim()
      .toLowerCase();

  /*
   * Administrador e Gerente possuem autorização própria
   * para realizar o estorno.
   *
   * Funcionários também podem iniciar a operação, mas
   * precisam da autorização de um desses dois perfis.
   */
  const podeEstornarDiretamente =
    perfilUsuario === "administrador" ||
    perfilUsuario === "gerente";

  const [atendimento, setAtendimento] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  /*
   * Estados exclusivos do fluxo de estorno.
   */
  const [modalEstornoAberto, setModalEstornoAberto] =
    useState(false);

  const [motivoEstorno, setMotivoEstorno] =
    useState("");

  const [autorizadores, setAutorizadores] =
    useState([]);

  const [
    usuarioAutorizacaoId,
    setUsuarioAutorizacaoId,
  ] = useState("");

  const [
    senhaAutorizacao,
    setSenhaAutorizacao,
  ] = useState("");

  const [
    carregandoAutorizadores,
    setCarregandoAutorizadores,
  ] = useState(false);

  const [erroEstorno, setErroEstorno] =
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


  function formatarStatusPagamento(status) {
    const nomes = {
      PENDENTE: "Pendente",
      PAGO: "Pago",
      CANCELADO: "Cancelado",
      ESTORNADO: "Estornado",
    };

    return nomes[status] || status || "-";
  }


  function formatarPerfil(perfil) {
    const nomes = {
      administrador: "Administrador",
      gerente: "Gerente",
    };

    return nomes[perfil] || perfil;
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


  /*
   * Abre o WhatsApp com uma mensagem adequada ao
   * estado atual do atendimento.
   */
  function contatarTutorWhatsApp() {
    let mensagem;

    if (atendimento.status === "AGENDADO") {
      mensagem =
        mensagemLembreteAtendimento({
          tutorNome:
            atendimento.tutor_nome,

          petNome:
            atendimento.pet_nome,

          agendadoPara:
            formatarDataHora(
              atendimento.agendado_para
            ),
        });

    } else if (
      atendimento.status ===
      "FINALIZADO"
    ) {
      mensagem =
        mensagemAtendimentoConcluido({
          tutorNome:
            atendimento.tutor_nome,

          petNome:
            atendimento.pet_nome,
        });

    } else {
      mensagem =
        mensagemContatoTutor({
          tutorNome:
            atendimento.tutor_nome,

          petNome:
            atendimento.pet_nome,
        });
    }

    const abriu =
      abrirWhatsApp({
        telefone:
          atendimento.tutor_telefone,
        mensagem,
      });

    if (!abriu) {
      alert(
        "O tutor não possui telefone cadastrado."
      );
    }
  }


  /*
   * Funcionários precisam escolher quem autorizará o
   * estorno. Por isso carregamos somente Administradores
   * e Gerentes ativos quando o modal for aberto.
   *
   * Administrador e Gerente não precisam desta consulta.
   */
  async function carregarAutorizadoresEstorno() {
    try {
      setCarregandoAutorizadores(true);
      setErroEstorno("");

      const resposta =
        await api.get(
          "/atendimentos/autorizadores-estorno"
        );

      setAutorizadores(
        resposta.data.autorizadores || []
      );

    } catch (error) {
      console.error(
        "Erro ao carregar autorizadores:",
        error
      );

      setAutorizadores([]);

      setErroEstorno(
        error.response?.data?.mensagem ||
        "Não foi possível carregar os responsáveis pela autorização."
      );

    } finally {
      setCarregandoAutorizadores(false);
    }
  }


  /*
   * Prepara o modal sem manter dados de uma tentativa
   * anterior, principalmente a senha do autorizador.
   */
  async function abrirModalEstorno() {
    setMotivoEstorno("");
    setUsuarioAutorizacaoId("");
    setSenhaAutorizacao("");
    setErroEstorno("");
    setAutorizadores([]);

    setModalEstornoAberto(true);

    if (!podeEstornarDiretamente) {
      await carregarAutorizadoresEstorno();
    }
  }


  function fecharModalEstorno() {
    if (processando) {
      return;
    }

    setModalEstornoAberto(false);
    setMotivoEstorno("");
    setUsuarioAutorizacaoId("");
    setSenhaAutorizacao("");
    setErroEstorno("");
    setAutorizadores([]);
  }


  /*
   * Envia somente os dados necessários ao backend.
   *
   * A senha do autorizador nunca é salva no navegador
   * depois que o modal é fechado.
   */
  async function confirmarEstorno(event) {
    event.preventDefault();

    const motivo =
      motivoEstorno.trim();

    if (!motivo) {
      setErroEstorno(
        "Informe o motivo do estorno."
      );

      return;
    }

    if (motivo.length > 1000) {
      setErroEstorno(
        "O motivo do estorno deve possuir no máximo 1000 caracteres."
      );

      return;
    }

    if (!podeEstornarDiretamente) {
      if (!usuarioAutorizacaoId) {
        setErroEstorno(
          "Selecione quem está autorizando o estorno."
        );

        return;
      }

      if (!senhaAutorizacao) {
        setErroEstorno(
          "Informe a senha do Gerente ou Administrador."
        );

        return;
      }
    }

    try {
      setProcessando(true);
      setErroEstorno("");

      const dados = {
        motivo_estorno: motivo,
      };

      if (!podeEstornarDiretamente) {
        dados.usuario_autorizacao_id =
          Number(usuarioAutorizacaoId);

        dados.senha_autorizacao =
          senhaAutorizacao;
      }

      await api.patch(
        `/atendimentos/${id}/estornar-pagamento`,
        dados
      );

      /*
       * Limpamos imediatamente a senha antes mesmo de
       * recarregar os dados da tela.
       */
      setSenhaAutorizacao("");
      setModalEstornoAberto(false);

      await carregarAtendimento();

    } catch (error) {
      console.error(
        "Erro ao estornar pagamento:",
        error
      );

      setSenhaAutorizacao("");

      setErroEstorno(
        error.response?.data?.mensagem ||
        "Não foi possível estornar o pagamento."
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
              {formatarStatusPagamento(
                atendimento.pagamento_status
              )}
            </strong>
          </div>


          {(
            atendimento.pagamento_status === "PAGO" ||
            atendimento.pagamento_status === "ESTORNADO"
          ) && (
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


          {atendimento.pagamento_status === "ESTORNADO" && (
            <>
              <div>
                <span>Estornado em</span>

                <strong>
                  {formatarDataHora(
                    atendimento.pagamento_estornado_em
                  )}
                </strong>
              </div>

              <div className="banho-tosa-estorno-motivo-resumo">
                <span>Motivo do estorno</span>

                <strong>
                  {atendimento.pagamento_motivo_estorno ||
                    "-"}
                </strong>
              </div>
            </>
          )}

        </div>

      </div>


      {atendimento.pagamento_status === "ESTORNADO" && (
        <div className="banho-tosa-estorno-aviso">

          <div>
            <strong>
              Pagamento estornado
            </strong>

            <p>
              Este pagamento foi recebido anteriormente e
              depois estornado. O valor não deve ser
              considerado como pagamento ativo.
            </p>
          </div>

        </div>
      )}


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

        <button
          type="button"
          className="secondary-button"
          onClick={contatarTutorWhatsApp}
        >
          WhatsApp
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


        {atendimento.pagamento_status === "PAGO" && (
          <button
            type="button"
            className="banho-tosa-estorno-button"
            onClick={abrirModalEstorno}
            disabled={processando}
          >
            Estornar Pagamento
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


      {modalEstornoAberto && (
        <div
          className="banho-tosa-estorno-overlay"
          role="presentation"
        >

          <div
            className="banho-tosa-estorno-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-estorno-pagamento"
          >

            <div className="banho-tosa-estorno-modal-header">

              <div>
                <span className="banho-tosa-estorno-etiqueta">
                  Operação financeira
                </span>

                <h2 id="titulo-estorno-pagamento">
                  Estornar pagamento
                </h2>

                <p>
                  O pagamento continuará registrado no
                  histórico, mas deixará de ser considerado
                  como pagamento ativo.
                </p>
              </div>

            </div>


            <form
              onSubmit={confirmarEstorno}
              className="banho-tosa-estorno-form"
            >

              <div className="banho-tosa-estorno-resumo">

                <div>
                  <span>Pet</span>

                  <strong>
                    {atendimento.pet_nome}
                  </strong>
                </div>

                <div>
                  <span>Valor</span>

                  <strong>
                    {formatarValor(
                      atendimento.valor_total
                    )}
                  </strong>
                </div>

                <div>
                  <span>Forma de pagamento</span>

                  <strong>
                    {atendimento.pagamento_metodo ||
                      "-"}
                  </strong>
                </div>

                <div>
                  <span>Situação do pagamento</span>

                  <strong
                    className={
                      `banho-tosa-pagamento-situacao banho-tosa-pagamento-${String(
                        atendimento.pagamento_status || ""
                      ).toLowerCase()}`
                    }
                  >
                    {formatarStatusPagamento(
                      atendimento.pagamento_status
                    )}
                  </strong>
                </div>

              </div>


              <label className="banho-tosa-estorno-campo">
                <span>
                  Motivo do estorno
                </span>

                <textarea
                  value={motivoEstorno}
                  onChange={(event) =>
                    setMotivoEstorno(
                      event.target.value
                    )
                  }
                  maxLength={1000}
                  rows={4}
                  disabled={processando}
                  placeholder="Explique por que este pagamento precisa ser estornado."
                  autoFocus
                />

                <small>
                  {motivoEstorno.length}/1000
                </small>
              </label>


              {!podeEstornarDiretamente && (
                <div className="banho-tosa-estorno-autorizacao">

                  <div className="banho-tosa-estorno-autorizacao-titulo">
                    <strong>
                      Autorização obrigatória
                    </strong>

                    <p>
                      Como você está acessando como
                      Funcionário, um Gerente ou
                      Administrador precisa autorizar este
                      estorno.
                    </p>
                  </div>


                  <label className="banho-tosa-estorno-campo">
                    <span>
                      Autorizado por
                    </span>

                    <select
                      value={usuarioAutorizacaoId}
                      onChange={(event) =>
                        setUsuarioAutorizacaoId(
                          event.target.value
                        )
                      }
                      disabled={
                        processando ||
                        carregandoAutorizadores
                      }
                    >
                      <option value="">
                        {carregandoAutorizadores
                          ? "Carregando..."
                          : "Selecione"}
                      </option>

                      {autorizadores.map(
                        (autorizador) => (
                          <option
                            key={autorizador.id}
                            value={autorizador.id}
                          >
                            {autorizador.nome}
                            {" — "}
                            {formatarPerfil(
                              autorizador.perfil
                            )}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label className="banho-tosa-estorno-campo">
                    <span>
                      Senha do autorizador
                    </span>

                    <input
                      type="password"
                      value={senhaAutorizacao}
                      onChange={(event) =>
                        setSenhaAutorizacao(
                          event.target.value
                        )
                      }
                      disabled={processando}
                      autoComplete="new-password"
                      placeholder="Digite a senha do responsável"
                    />
                  </label>

                </div>
              )}


              {podeEstornarDiretamente && (
                <div className="banho-tosa-estorno-permissao-direta">
                  Seu perfil possui permissão para realizar
                  o estorno diretamente. Não é necessária
                  confirmação adicional de senha.
                </div>
              )}


              {erroEstorno && (
                <div className="banho-tosa-estorno-erro">
                  {erroEstorno}
                </div>
              )}


              <div className="banho-tosa-estorno-acoes">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={fecharModalEstorno}
                  disabled={processando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="banho-tosa-estorno-confirmar"
                  disabled={
                    processando ||
                    carregandoAutorizadores
                  }
                >
                  {processando
                    ? "Estornando..."
                    : "Confirmar Estorno"}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}


export default DetalhesBanhoTosa;