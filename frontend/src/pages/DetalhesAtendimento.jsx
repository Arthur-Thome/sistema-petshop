import { useCallback, useEffect, useState } from "react";
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

import "../styles/Atendimentos.css";


function DetalhesAtendimento() {
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

  const [historicoOperacional, setHistoricoOperacional] = useState([]);

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

  const [modalCancelamentoAberto, setModalCancelamentoAberto] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [confirmacaoCancelamento, setConfirmacaoCancelamento] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState("");


  /*
   * Carrega todos os dados do atendimento.
   *
   * O backend já devolve pet, tutor, serviços
   * contratados e informações financeiras.
   */
  const carregarAtendimento = useCallback(async () => {
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
  }, [id]);

  const carregarHistoricoOperacional = useCallback(async () => {
    try {
      const resposta = await api.get(`/atendimentos/${id}/historico`);
      setHistoricoOperacional(resposta.data.eventos || []);
    } catch {
      setHistoricoOperacional([]);
    }
  }, [id]);

  async function confirmarCancelamento(event) {
    event.preventDefault();
    if (!motivoCancelamento.trim()) {
      setErroCancelamento("Informe o motivo do cancelamento.");
      return;
    }
    if (!confirmacaoCancelamento) {
      setErroCancelamento("Confirme que deseja cancelar este atendimento.");
      return;
    }
    if (atendimento.pagamento_status === "PAGO") {
      setErroCancelamento("Faça o estorno autorizado antes de cancelar o atendimento.");
      return;
    }
    try {
      setProcessando(true);
      setErroCancelamento("");
      await api.patch(`/atendimentos/${id}/cancelar`, {
        motivo_cancelamento: motivoCancelamento.trim(),
      });
      setModalCancelamentoAberto(false);
      setMotivoCancelamento("");
      setConfirmacaoCancelamento(false);
      await Promise.all([carregarAtendimento(), carregarHistoricoOperacional()]);
    } catch (error) {
      setErroCancelamento(error.response?.data?.mensagem || "Não foi possível cancelar o atendimento.");
    } finally {
      setProcessando(false);
    }
  }


  useEffect(() => {
    let ativo = true;
    queueMicrotask(() => {
      if (ativo) {
        void carregarAtendimento();
        void carregarHistoricoOperacional();
      }
    });
    return () => { ativo = false; };
  }, [carregarAtendimento, carregarHistoricoOperacional]);


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR",
      { timeZone: "America/Sao_Paulo" }
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
      AGUARDANDO_CONFIRMACAO: "Aguardando confirmação da equipe",
      RECUSADO: "Solicitação recusada",
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
        "atendimento-status-agendado",

      EM_ATENDIMENTO:
        "atendimento-status-atendimento",

      FINALIZADO:
        "atendimento-status-finalizado",

      CANCELADO:
        "atendimento-status-cancelado",

      AGUARDANDO_CONFIRMACAO:
        "atendimento-status-cancelado",

      RECUSADO:
        "atendimento-status-cancelado",
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
      <div className="atendimento-page">

        <div className="atendimento-mensagem">
          Carregando...
        </div>

      </div>
    );
  }


  if (!atendimento) {
    return (
      <div className="atendimento-page">

        {erro && (
          <div className="atendimento-erro">
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
    <div className="atendimento-page">

      <div className="atendimento-header">

        <div>
          <h1>Atendimento</h1>

          <p>
            Informações do agendamento de
            {` ${atendimento.pet_nome}.`}
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


      {erro && (
        <div className="atendimento-erro">
          {erro}
        </div>
      )}

      {atendimento.status === "AGUARDANDO_CONFIRMACAO" && (
        <div className="atendimento-estorno-aviso">
          <div><strong>Solicitação aguardando confirmação</strong>
            <p>Este pedido ainda não está confirmado e não possui cobrança. A equipe deve decidir pela fila de solicitações públicas.</p>
            <button type="button" className="secondary-button" onClick={() => navigate("/atendimentos/solicitacoes")}>Abrir fila de solicitações</button>
          </div>
        </div>
      )}


      <div className="atendimento-detalhes-card">

        <div className="atendimento-detalhes-topo">

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
            {String(atendimento.pet_raca || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === "nao sei informar" && (
              <p className="atendimento-raca-pendente">
                Raça não identificada — Porte: {atendimento.pet_porte || "não informado"}. A equipe deve confirmar a raça.
              </p>
            )}
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


        <div className="atendimento-detalhes-grid">

          <div><span>Raça</span><strong>{atendimento.pet_raca || "Não cadastrada"}</strong></div>
          <div><span>Porte / Sexo</span><strong>{[atendimento.pet_porte, atendimento.pet_sexo].filter(Boolean).join(" / ") || "-"}</strong></div>
          <div><span>Alergias</span><strong>{atendimento.pet_alergias || "Nenhuma informada"}</strong></div>
          <div><span>Necessidades especiais</span><strong>{atendimento.pet_necessidades_especiais || "Nenhuma informada"}</strong></div>
          <div><span>Comportamento / observações</span><strong>{[atendimento.pet_comportamento, atendimento.pet_observacoes].filter(Boolean).join(" — ") || "Nenhuma informação"}</strong></div>

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
              {atendimento.status === "AGUARDANDO_CONFIRMACAO" && !atendimento.pagamento_status
                ? "Ainda não criada"
                : formatarStatusPagamento(atendimento.pagamento_status)}
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

              <div className="atendimento-estorno-motivo-resumo">
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
        <div className="atendimento-estorno-aviso">

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


      <div className="atendimento-detalhes-card">

        <h2>Serviços</h2>


        <div className="atendimento-detalhes-servicos">

          {(atendimento.servicos || []).map(
            (servico) => (

              <div
                className="atendimento-detalhes-servico"
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


        <div className="atendimento-detalhes-total">

          <span>Total</span>

          <strong>
            {formatarValor(
              atendimento.valor_total
            )}
          </strong>

        </div>

      </div>


      {atendimento.observacoes_agendamento && (

        <div className="atendimento-detalhes-card">

          <h2>
            Observações do agendamento
          </h2>

          <p className="atendimento-detalhes-observacao">
            {
              atendimento
                .observacoes_agendamento
            }
          </p>

        </div>

      )}


      {atendimento.observacoes_atendimento && (

        <div className="atendimento-detalhes-card">

          <h2>
            Observações do atendimento
          </h2>

          <p className="atendimento-detalhes-observacao">
            {
              atendimento
                .observacoes_atendimento
            }
          </p>

        </div>

      )}

      <div className="atendimento-detalhes-card">
        <h2>Histórico operacional</h2>
        {historicoOperacional.length === 0 ? <p>Nenhum evento operacional registrado.</p> : (
          <div className="atendimento-detalhes-servicos">
            {historicoOperacional.map((evento) => (
              <div className="atendimento-detalhes-servico" key={evento.id}>
                <div>
                  <strong>{evento.evento === "SOLICITACAO_CRIADA" ? "Solicitação recebida" : evento.evento === "SOLICITACAO_CONFIRMADA" ? "Solicitação confirmada" : evento.evento === "SOLICITACAO_RECUSADA" ? "Solicitação recusada" : evento.evento}</strong>
                  <span>{evento.tutor_nome || evento.usuario_nome || "Equipe"}{evento.usuario_perfil ? ` · ${evento.usuario_perfil}` : ""} · {formatarDataHora(evento.criado_em)}</span>
                  {evento.motivo && <span>Motivo: {evento.motivo}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      <div className="atendimento-detalhes-acoes">

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


        {["AGUARDANDO_CONFIRMACAO", "AGENDADO"].includes(atendimento.status) && (
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setErroCancelamento("");
                setConfirmacaoCancelamento(false);
                setModalCancelamentoAberto(true);
              }}
              disabled={processando}
            >
              Cancelar agendamento
            </button>

            {atendimento.status === "AGENDADO" && <button
              type="button"
              className="primary-button"
              onClick={iniciarAtendimento}
              disabled={processando}
            >
              {processando
                ? "Processando..."
                : "Iniciar Atendimento"}
            </button>}
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
            className="atendimento-estorno-button"
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


      {modalCancelamentoAberto && (
        <div className="atendimento-cancelamento-overlay" role="presentation">
          <form
            className="atendimento-cancelamento-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-cancelamento-atendimento"
            onSubmit={confirmarCancelamento}
          >
            <h2 id="titulo-cancelamento-atendimento">Cancelar agendamento</h2>
            <p>O atendimento e seu histórico serão preservados. O horário só voltará à agenda se continuar aberto, publicado e futuro.</p>
            {atendimento.pagamento_status === "PAGO" && (
              <p className="atendimento-cancelamento-alerta">O pagamento está pago. Faça primeiro o estorno autorizado; os dados do pagamento original serão preservados.</p>
            )}
            <label>
              <span>Motivo do cancelamento</span>
              <textarea
                value={motivoCancelamento}
                onChange={(event) => setMotivoCancelamento(event.target.value)}
                maxLength={2000}
                rows={4}
                required
                disabled={processando}
                autoFocus
              />
            </label>
            <label className="atendimento-cancelamento-confirmacao">
              <input
                type="checkbox"
                checked={confirmacaoCancelamento}
                onChange={(event) => setConfirmacaoCancelamento(event.target.checked)}
                disabled={processando}
              />
              <span>Confirmo o cancelamento deste agendamento.</span>
            </label>
            {erroCancelamento && <div className="atendimento-cancelamento-erro" role="alert">{erroCancelamento}</div>}
            <div className="atendimento-cancelamento-acoes">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setModalCancelamentoAberto(false)}
                disabled={processando}
              >Fechar</button>
              <button
                type="submit"
                className="atendimento-cancelamento-confirmar"
                disabled={processando || !confirmacaoCancelamento || atendimento.pagamento_status === "PAGO"}
              >{processando ? "Cancelando..." : "Confirmar cancelamento"}</button>
            </div>
          </form>
        </div>
      )}


      {modalEstornoAberto && (
        <div
          className="atendimento-estorno-overlay"
          role="presentation"
        >

          <div
            className="atendimento-estorno-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-estorno-pagamento"
          >

            <div className="atendimento-estorno-modal-header">

              <div>
                <span className="atendimento-estorno-etiqueta">
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
              className="atendimento-estorno-form"
            >

              <div className="atendimento-estorno-resumo">

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
                      `atendimento-pagamento-situacao atendimento-pagamento-${String(
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


              <label className="atendimento-estorno-campo">
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
                <div className="atendimento-estorno-autorizacao">

                  <div className="atendimento-estorno-autorizacao-titulo">
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


                  <label className="atendimento-estorno-campo">
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


                  <label className="atendimento-estorno-campo">
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
                <div className="atendimento-estorno-permissao-direta">
                  Seu perfil possui permissão para realizar
                  o estorno diretamente. Não é necessária
                  confirmação adicional de senha.
                </div>
              )}


              {erroEstorno && (
                <div className="atendimento-estorno-erro">
                  {erroEstorno}
                </div>
              )}


              <div className="atendimento-estorno-acoes">

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
                  className="atendimento-estorno-confirmar"
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


export default DetalhesAtendimento;
