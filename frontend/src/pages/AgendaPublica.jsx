import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import axios from "axios";

import "../styles/AgendaPublica.css";


const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001/api";


const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];


const DIAS_SEMANA = [
  {
    numero: 0,
    curto: "DOM",
    nome: "Domingo",
  },
  {
    numero: 1,
    curto: "SEG",
    nome: "Segunda",
  },
  {
    numero: 2,
    curto: "TER",
    nome: "Terça",
  },
  {
    numero: 3,
    curto: "QUA",
    nome: "Quarta",
  },
  {
    numero: 4,
    curto: "QUI",
    nome: "Quinta",
  },
  {
    numero: 5,
    curto: "SEX",
    nome: "Sexta",
  },
  {
    numero: 6,
    curto: "SÁB",
    nome: "Sábado",
  },
];


const TRATAMENTOS = [
  {
    valor: "MANTER",
    titulo: "Manter existentes",
    descricao:
      "Datas que já possuem configuração não serão alteradas.",
  },
  {
    valor: "ADICIONAR",
    titulo: "Adicionar horários",
    descricao:
      "Mantém os horários existentes e adiciona somente os novos.",
  },
  {
    valor: "SUBSTITUIR",
    titulo: "Substituir configuração",
    descricao:
      "Os novos horários passam a substituir a configuração existente.",
  },
];


function formatarDataISO(
  ano,
  mes,
  dia
) {
  return [
    ano,
    String(mes + 1).padStart(2, "0"),
    String(dia).padStart(2, "0"),
  ].join("-");
}


function formatarDataCompleta(dataISO) {
  if (!dataISO) {
    return "";
  }

  const [ano, mes, dia] =
    dataISO.split("-").map(Number);

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  ).format(
    new Date(
      Date.UTC(
        ano,
        mes - 1,
        dia
      )
    )
  );
}


function normalizarHorarioFrontend(
  horario
) {
  if (!horario) {
    return "";
  }

  return String(horario).slice(
    0,
    5
  );
}


function AgendaPublica() {
  const hoje = useMemo(
    () => new Date(),
    []
  );

  const usuario = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          "usuario"
        ) || "{}"
      );
    } catch {
      return {};
    }
  }, []);


  const ehFuncionario =
    usuario.perfil === "funcionario";


  const [anoAtual, setAnoAtual] =
    useState(
      hoje.getFullYear()
    );

  const [mesAtual, setMesAtual] =
    useState(
      hoje.getMonth()
    );

  const [diasAgenda, setDiasAgenda] =
    useState([]);

  const [carregando, setCarregando] =
    useState(true);

  const [
    erroCarregamento,
    setErroCarregamento,
  ] = useState("");


  /*
   * =========================================================
   * EDITOR INDIVIDUAL
   * =========================================================
   */

  const [
    editorAberto,
    setEditorAberto,
  ] = useState(false);

  const [
    carregandoEditor,
    setCarregandoEditor,
  ] = useState(false);

  const [
    salvandoEditor,
    setSalvandoEditor,
  ] = useState(false);

  const [
    dataSelecionada,
    setDataSelecionada,
  ] = useState("");

  const [
    diaConfigurado,
    setDiaConfigurado,
  ] = useState(false);

  const [diaAberto, setDiaAberto] =
    useState(false);

  const [
    diaPublicado,
    setDiaPublicado,
  ] = useState(false);

  const [
    observacao,
    setObservacao,
  ] = useState("");

  const [horarios, setHorarios] =
    useState([]);

  const [
    novoHorario,
    setNovoHorario,
  ] = useState("");

  const [
    erroEditor,
    setErroEditor,
  ] = useState("");

  const [
    mensagemEditor,
    setMensagemEditor,
  ] = useState("");


  /*
   * =========================================================
   * ABERTURA EM MASSA
   * =========================================================
   */

  const [
    modalPeriodoAberto,
    setModalPeriodoAberto,
  ] = useState(false);

  const [
    salvandoPeriodo,
    setSalvandoPeriodo,
  ] = useState(false);

  const [
    periodoInicio,
    setPeriodoInicio,
  ] = useState("");

  const [
    periodoFim,
    setPeriodoFim,
  ] = useState("");

  const [
    periodoDiasSemana,
    setPeriodoDiasSemana,
  ] = useState([
    1,
    2,
    3,
    4,
    5,
  ]);

  const [
    periodoHorarios,
    setPeriodoHorarios,
  ] = useState([]);

  const [
    periodoNovoHorario,
    setPeriodoNovoHorario,
  ] = useState("");

  const [
    periodoPublicado,
    setPeriodoPublicado,
  ] = useState(true);

  const [
    periodoTratamento,
    setPeriodoTratamento,
  ] = useState("MANTER");

  const [
    periodoObservacao,
    setPeriodoObservacao,
  ] = useState("");

  const [
    erroPeriodo,
    setErroPeriodo,
  ] = useState("");

  const [
    mensagemPeriodo,
    setMensagemPeriodo,
  ] = useState("");

  const [
    resumoOperacao,
    setResumoOperacao,
  ] = useState(null);

  const [
    confirmacaoSubstituicaoAberta,
    setConfirmacaoSubstituicaoAberta,
  ] = useState(false);


  /*
   * =========================================================
   * FECHAMENTO EM MASSA
   * =========================================================
   *
   * O fechamento é separado da abertura para evitar misturar
   * duas ações administrativas com efeitos diferentes.
   *
   * Fechar um período NÃO remove horários e NÃO cancela
   * agendamentos existentes. O backend apenas deixa as datas
   * fechadas e não publicadas para novos agendamentos.
   */

  const [
    modalFechamentoAberto,
    setModalFechamentoAberto,
  ] = useState(false);

  const [
    salvandoFechamento,
    setSalvandoFechamento,
  ] = useState(false);

  const [
    fechamentoInicio,
    setFechamentoInicio,
  ] = useState("");

  const [
    fechamentoFim,
    setFechamentoFim,
  ] = useState("");

  const [
    fechamentoDiasSemana,
    setFechamentoDiasSemana,
  ] = useState([
    0,
    1,
    2,
    3,
    4,
    5,
    6,
  ]);

  const [
    fechamentoObservacao,
    setFechamentoObservacao,
  ] = useState("");

  const [
    erroFechamento,
    setErroFechamento,
  ] = useState("");

  const [
    mensagemFechamento,
    setMensagemFechamento,
  ] = useState("");

  const [
    resumoFechamento,
    setResumoFechamento,
  ] = useState(null);

  const [
    confirmacaoFechamentoAberta,
    setConfirmacaoFechamentoAberta,
  ] = useState(false);


  /*
   * =========================================================
   * AUTORIZAÇÃO
   * =========================================================
   *
   * O mesmo modal é reutilizado pelas alterações individuais,
   * abertura em massa e fechamento em massa.
   */

  const [
    modalAutorizacaoAberto,
    setModalAutorizacaoAberto,
  ] = useState(false);

  const [
    senhaAutorizacao,
    setSenhaAutorizacao,
  ] = useState("");

  const [
    erroAutorizacao,
    setErroAutorizacao,
  ] = useState("");

  const [
    tipoOperacaoAutorizacao,
    setTipoOperacaoAutorizacao,
  ] = useState(null);


  /*
   * =========================================================
   * PERÍODO DO MÊS
   * =========================================================
   */

  const inicioMes = useMemo(
    () =>
      formatarDataISO(
        anoAtual,
        mesAtual,
        1
      ),
    [
      anoAtual,
      mesAtual,
    ]
  );


  const ultimoDiaMes = useMemo(
    () =>
      new Date(
        anoAtual,
        mesAtual + 1,
        0
      ).getDate(),
    [
      anoAtual,
      mesAtual,
    ]
  );


  const fimMes = useMemo(
    () =>
      formatarDataISO(
        anoAtual,
        mesAtual,
        ultimoDiaMes
      ),
    [
      anoAtual,
      mesAtual,
      ultimoDiaMes,
    ]
  );


  /*
   * =========================================================
   * CARREGAMENTO DO CALENDÁRIO
   * =========================================================
   */

  const carregarAgenda =
    useCallback(async () => {
      try {
        setCarregando(true);
        setErroCarregamento("");

        const token =
          localStorage.getItem(
            "token"
          );

        const resposta =
          await axios.get(
            `${API_URL}/agenda-publica/admin`,
            {
              params: {
                data_inicio:
                  inicioMes,

                data_fim:
                  fimMes,
              },

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        setDiasAgenda(
          Array.isArray(
            resposta.data?.dias
          )
            ? resposta.data.dias
            : []
        );
      } catch (erro) {
        console.error(
          "Erro ao carregar agenda pública:",
          erro
        );

        setErroCarregamento(
          erro.response?.data
            ?.mensagem ||
            "Não foi possível carregar a agenda."
        );
      } finally {
        setCarregando(false);
      }
    }, [
      inicioMes,
      fimMes,
    ]);


  useEffect(() => {
    carregarAgenda();
  }, [carregarAgenda]);


  const agendaPorData =
    useMemo(() => {
      const mapa = new Map();

      for (const dia of diasAgenda) {
        mapa.set(
          String(dia.data).slice(
            0,
            10
          ),
          dia
        );
      }

      return mapa;
    }, [diasAgenda]);


  const celulasCalendario =
    useMemo(() => {
      const primeiroDiaSemana =
        new Date(
          anoAtual,
          mesAtual,
          1
        ).getDay();

      const celulas = [];

      for (
        let i = 0;
        i < primeiroDiaSemana;
        i++
      ) {
        celulas.push({
          tipo: "vazio",
          chave: `vazio-${i}`,
        });
      }

      for (
        let dia = 1;
        dia <= ultimoDiaMes;
        dia++
      ) {
        const data =
          formatarDataISO(
            anoAtual,
            mesAtual,
            dia
          );

        celulas.push({
          tipo: "dia",
          chave: data,
          numero: dia,
          data,

          agenda:
            agendaPorData.get(
              data
            ) || null,
        });
      }

      return celulas;
    }, [
      anoAtual,
      mesAtual,
      ultimoDiaMes,
      agendaPorData,
    ]);


  const resumoMes =
    useMemo(() => {
      let diasAbertos = 0;
      let diasPublicados = 0;
      let disponiveis = 0;
      let ocupados = 0;
      let bloqueados = 0;

      for (const dia of diasAgenda) {
        if (dia.aberto) {
          diasAbertos++;
        }

        if (dia.publicado) {
          diasPublicados++;
        }

        for (
          const horario
          of dia.horarios || []
        ) {
          if (
            horario.status ===
            "DISPONIVEL"
          ) {
            disponiveis++;
          }

          if (
            horario.status ===
            "OCUPADO"
          ) {
            ocupados++;
          }

          if (
            horario.status ===
            "BLOQUEADO"
          ) {
            bloqueados++;
          }
        }
      }

      return {
        diasAbertos,
        diasPublicados,
        disponiveis,
        ocupados,
        bloqueados,
      };
    }, [diasAgenda]);


  function alterarMes(diferenca) {
    const novaData =
      new Date(
        anoAtual,
        mesAtual + diferenca,
        1
      );

    setAnoAtual(
      novaData.getFullYear()
    );

    setMesAtual(
      novaData.getMonth()
    );
  }


  function irParaHoje() {
    setAnoAtual(
      hoje.getFullYear()
    );

    setMesAtual(
      hoje.getMonth()
    );
  }
  /*
   * =========================================================
   * EDITOR INDIVIDUAL
   * =========================================================
   */

  async function abrirEditorDia(
    data
  ) {
    try {
      setEditorAberto(true);
      setCarregandoEditor(true);

      setDataSelecionada(data);
      setErroEditor("");
      setMensagemEditor("");
      setNovoHorario("");

      const token =
        localStorage.getItem(
          "token"
        );

      const resposta =
        await axios.get(
          `${API_URL}/agenda-publica/admin/${data}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      const dia =
        resposta.data?.dia || {};

      setDiaConfigurado(
        Boolean(
          resposta.data
            ?.configurado
        )
      );

      setDiaAberto(
        Boolean(dia.aberto)
      );

      setDiaPublicado(
        Boolean(dia.publicado)
      );

      setObservacao(
        dia.observacao || ""
      );

      setHorarios(
        Array.isArray(
          dia.horarios
        )
          ? dia.horarios.map(
              (horario) => ({
                id:
                  horario.id ||
                  null,

                horario:
                  normalizarHorarioFrontend(
                    horario.horario
                  ),

                status:
                  horario.status ||
                  "DISPONIVEL",

                observacao:
                  horario.observacao ||
                  null,
              })
            )
          : []
      );
    } catch (erro) {
      console.error(
        "Erro ao carregar a data:",
        erro
      );

      setErroEditor(
        erro.response?.data
          ?.mensagem ||
          "Não foi possível carregar esta data."
      );
    } finally {
      setCarregandoEditor(
        false
      );
    }
  }


  function fecharEditor() {
    if (salvandoEditor) {
      return;
    }

    setEditorAberto(false);
    setDataSelecionada("");
    setDiaConfigurado(false);
    setDiaAberto(false);
    setDiaPublicado(false);
    setObservacao("");
    setHorarios([]);
    setNovoHorario("");
    setErroEditor("");
    setMensagemEditor("");
  }


  function alterarDiaAberto(
    novoValor
  ) {
    setDiaAberto(novoValor);

    if (!novoValor) {
      setDiaPublicado(false);
    }

    setErroEditor("");
    setMensagemEditor("");
  }


  function alterarPublicado(
    novoValor
  ) {
    if (
      novoValor &&
      !diaAberto
    ) {
      setErroEditor(
        "Abra a data antes de publicá-la no site."
      );

      return;
    }

    setDiaPublicado(novoValor);
    setErroEditor("");
    setMensagemEditor("");
  }


  function adicionarHorario() {
    setErroEditor("");
    setMensagemEditor("");

    if (!novoHorario) {
      setErroEditor(
        "Informe um horário antes de adicionar."
      );

      return;
    }

    const normalizado =
      normalizarHorarioFrontend(
        novoHorario
      );

    if (
      horarios.some(
        (item) =>
          item.horario ===
          normalizado
      )
    ) {
      setErroEditor(
        "Este horário já está na lista."
      );

      return;
    }

    setHorarios(
      [
        ...horarios,
        {
          id: null,
          horario: normalizado,
          status:
            "DISPONIVEL",
          observacao: null,
        },
      ].sort(
        (a, b) =>
          a.horario.localeCompare(
            b.horario
          )
      )
    );

    setNovoHorario("");
  }


  function removerHorario(indice) {
    const horario =
      horarios[indice];

    if (!horario) {
      return;
    }

    if (
      horario.status ===
      "OCUPADO"
    ) {
      setErroEditor(
        "Um horário ocupado não pode ser removido."
      );

      return;
    }

    setHorarios(
      horarios.filter(
        (_, posicao) =>
          posicao !== indice
      )
    );

    setErroEditor("");
    setMensagemEditor("");
  }


  function validarEditor() {
    if (
      diaAberto &&
      horarios.length === 0
    ) {
      setErroEditor(
        "Uma data aberta precisa possuir pelo menos um horário."
      );

      return false;
    }

    if (
      diaPublicado &&
      !diaAberto
    ) {
      setErroEditor(
        "Uma data fechada não pode ser publicada."
      );

      return false;
    }

    if (
      observacao.trim().length >
      1000
    ) {
      setErroEditor(
        "A observação deve possuir no máximo 1000 caracteres."
      );

      return false;
    }

    return true;
  }


  async function executarSalvamentoIndividual(
    senha = null
  ) {
    if (!validarEditor()) {
      return;
    }

    try {
      setSalvandoEditor(true);
      setErroEditor("");
      setMensagemEditor("");
      setErroAutorizacao("");

      const token =
        localStorage.getItem(
          "token"
        );

      const corpo = {
        aberto: diaAberto,
        publicado:
          diaPublicado,

        observacao:
          observacao.trim(),

        horarios:
          horarios.map(
            (item) =>
              item.horario
          ),
      };

      if (senha) {
        corpo.senha_autorizacao =
          senha;
      }

      const resposta =
        await axios.put(
          `${API_URL}/agenda-publica/admin/${dataSelecionada}`,
          corpo,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      const diaSalvo =
        resposta.data?.dia;

      setDiaConfigurado(true);

      setMensagemEditor(
        resposta.data?.mensagem ||
          "Agenda atualizada com sucesso."
      );

      if (diaSalvo) {
        setDiaAberto(
          Boolean(
            diaSalvo.aberto
          )
        );

        setDiaPublicado(
          Boolean(
            diaSalvo.publicado
          )
        );

        setObservacao(
          diaSalvo.observacao ||
            ""
        );

        setHorarios(
          Array.isArray(
            diaSalvo.horarios
          )
            ? diaSalvo.horarios.map(
                (horario) => ({
                  id:
                    horario.id ||
                    null,

                  horario:
                    normalizarHorarioFrontend(
                      horario.horario
                    ),

                  status:
                    horario.status ||
                    "DISPONIVEL",

                  observacao:
                    horario.observacao ||
                    null,
                })
              )
            : []
        );
      }

      setModalAutorizacaoAberto(
        false
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");
      setTipoOperacaoAutorizacao(
        null
      );

      await carregarAgenda();
    } catch (erro) {
      const dados =
        erro.response?.data || {};

      if (
        dados.codigo ===
          "AUTORIZACAO_NECESSARIA" ||
        dados.codigo ===
          "AUTORIZACAO_INVALIDA"
      ) {
        setModalAutorizacaoAberto(
          true
        );

        setTipoOperacaoAutorizacao(
          "INDIVIDUAL"
        );

        setErroAutorizacao(
          dados.codigo ===
            "AUTORIZACAO_INVALIDA"
            ? (
              dados.mensagem ||
              "Senha de autorização inválida."
            )
            : ""
        );

        return;
      }

      setErroEditor(
        dados.mensagem ||
          "Não foi possível salvar a agenda."
      );
    } finally {
      setSalvandoEditor(false);
    }
  }


  function solicitarSalvamentoIndividual() {
    setErroEditor("");
    setMensagemEditor("");

    if (!validarEditor()) {
      return;
    }

    if (ehFuncionario) {
      setTipoOperacaoAutorizacao(
        "INDIVIDUAL"
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");

      setModalAutorizacaoAberto(
        true
      );

      return;
    }

    executarSalvamentoIndividual();
  }


  /*
   * =========================================================
   * ABERTURA EM MASSA
   * =========================================================
   */

  function abrirModalPeriodo() {
    /*
     * Começamos pelo mês que o usuário está visualizando.
     * Isso reduz digitação e facilita operações mensais.
     */
    setPeriodoInicio(inicioMes);
    setPeriodoFim(fimMes);

    setPeriodoDiasSemana([
      1,
      2,
      3,
      4,
      5,
    ]);

    setPeriodoHorarios([]);
    setPeriodoNovoHorario("");
    setPeriodoPublicado(true);
    setPeriodoTratamento(
      "MANTER"
    );

    setPeriodoObservacao("");
    setErroPeriodo("");
    setMensagemPeriodo("");
    setResumoOperacao(null);

    setConfirmacaoSubstituicaoAberta(
      false
    );

    setModalPeriodoAberto(true);
  }


  function fecharModalPeriodo() {
    if (salvandoPeriodo) {
      return;
    }

    setModalPeriodoAberto(false);
    setErroPeriodo("");
    setMensagemPeriodo("");
    setResumoOperacao(null);

    setConfirmacaoSubstituicaoAberta(
      false
    );
  }


  function alternarDiaSemana(
    numero
  ) {
    setPeriodoDiasSemana(
      (atuais) => {
        if (
          atuais.includes(numero)
        ) {
          return atuais.filter(
            (dia) =>
              dia !== numero
          );
        }

        return [
          ...atuais,
          numero,
        ].sort(
          (a, b) => a - b
        );
      }
    );

    setErroPeriodo("");
  }


  function adicionarHorarioPeriodo() {
    setErroPeriodo("");
    setMensagemPeriodo("");

    if (!periodoNovoHorario) {
      setErroPeriodo(
        "Informe um horário antes de adicionar."
      );

      return;
    }

    const normalizado =
      normalizarHorarioFrontend(
        periodoNovoHorario
      );

    if (
      periodoHorarios.includes(
        normalizado
      )
    ) {
      setErroPeriodo(
        "Este horário já foi adicionado."
      );

      return;
    }

    setPeriodoHorarios(
      [
        ...periodoHorarios,
        normalizado,
      ].sort()
    );

    setPeriodoNovoHorario("");
  }


  function removerHorarioPeriodo(
    horario
  ) {
    setPeriodoHorarios(
      periodoHorarios.filter(
        (item) =>
          item !== horario
      )
    );

    setErroPeriodo("");
    setMensagemPeriodo("");
  }


  function validarPeriodo() {
    if (
      !periodoInicio ||
      !periodoFim
    ) {
      setErroPeriodo(
        "Informe a data inicial e a data final."
      );

      return false;
    }

    if (
      periodoFim <
      periodoInicio
    ) {
      setErroPeriodo(
        "A data final não pode ser anterior à data inicial."
      );

      return false;
    }

    if (
      periodoDiasSemana.length ===
      0
    ) {
      setErroPeriodo(
        "Selecione pelo menos um dia da semana."
      );

      return false;
    }

    if (
      periodoHorarios.length ===
      0
    ) {
      setErroPeriodo(
        "Adicione pelo menos um horário."
      );

      return false;
    }

    if (
      periodoObservacao
        .trim()
        .length > 1000
    ) {
      setErroPeriodo(
        "A observação deve possuir no máximo 1000 caracteres."
      );

      return false;
    }

    return true;
  }


  function solicitarAplicacaoPeriodo() {
    setErroPeriodo("");
    setMensagemPeriodo("");
    setResumoOperacao(null);

    if (!validarPeriodo()) {
      return;
    }

    /*
     * SUBSTITUIR é destrutivo.
     *
     * Exigimos uma confirmação separada antes de enviar
     * confirmacao_substituicao=true ao backend.
     */
    if (
      periodoTratamento ===
      "SUBSTITUIR"
    ) {
      setConfirmacaoSubstituicaoAberta(
        true
      );

      return;
    }

    prepararAutorizacaoPeriodo(
      false
    );
  }


  function confirmarSubstituicao() {
    setConfirmacaoSubstituicaoAberta(
      false
    );

    prepararAutorizacaoPeriodo(
      true
    );
  }


  function prepararAutorizacaoPeriodo(
    confirmouSubstituicao
  ) {
    if (ehFuncionario) {
      setTipoOperacaoAutorizacao(
        "PERIODO"
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");

      /*
       * Guardamos a confirmação para que ela seja enviada
       * somente depois que a senha for informada.
       */
      setConfirmacaoSubstituicaoAberta(
        false
      );

      window.sessionStorage.setItem(
        "agenda_confirmou_substituicao",
        confirmouSubstituicao
          ? "true"
          : "false"
      );

      setModalAutorizacaoAberto(
        true
      );

      return;
    }

    executarAplicacaoPeriodo(
      null,
      confirmouSubstituicao
    );
  }


  async function executarAplicacaoPeriodo(
    senha = null,
    confirmouSubstituicao = false
  ) {
    if (!validarPeriodo()) {
      return;
    }

    try {
      setSalvandoPeriodo(true);
      setErroPeriodo("");
      setMensagemPeriodo("");
      setErroAutorizacao("");

      const token =
        localStorage.getItem(
          "token"
        );

      const corpo = {
        data_inicio:
          periodoInicio,

        data_fim:
          periodoFim,

        dias_semana:
          periodoDiasSemana,

        horarios:
          periodoHorarios,

        tratamento_existentes:
          periodoTratamento,

        publicado:
          periodoPublicado,

        observacao:
          periodoObservacao.trim(),
      };


      if (
        periodoTratamento ===
        "SUBSTITUIR"
      ) {
        corpo.confirmacao_substituicao =
          confirmouSubstituicao;
      }


      if (senha) {
        corpo.senha_autorizacao =
          senha;
      }


      const resposta =
        await axios.post(
          `${API_URL}/agenda-publica/admin/operacoes/massa`,
          corpo,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );


      setMensagemPeriodo(
        resposta.data?.mensagem ||
          "Período aplicado com sucesso."
      );

      setResumoOperacao(
        resposta.data?.resumo ||
          null
      );

      setModalAutorizacaoAberto(
        false
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");
      setTipoOperacaoAutorizacao(
        null
      );

      window.sessionStorage.removeItem(
        "agenda_confirmou_substituicao"
      );

      await carregarAgenda();

    } catch (erro) {
      console.error(
        "Erro ao aplicar período:",
        erro
      );

      const dados =
        erro.response?.data || {};


      if (
        dados.codigo ===
          "AUTORIZACAO_NECESSARIA" ||
        dados.codigo ===
          "AUTORIZACAO_INVALIDA"
      ) {
        setTipoOperacaoAutorizacao(
          "PERIODO"
        );

        setModalAutorizacaoAberto(
          true
        );

        setErroAutorizacao(
          dados.codigo ===
            "AUTORIZACAO_INVALIDA"
            ? (
              dados.mensagem ||
              "Senha de autorização inválida."
            )
            : ""
        );

        return;
      }


      if (
        dados.codigo ===
        "HORARIO_OCUPADO_IMPEDE_SUBSTITUICAO"
      ) {
        setErroPeriodo(
          dados.mensagem ||
          "Existe um horário ocupado que impede a substituição."
        );

        return;
      }


      if (
        dados.codigo ===
        "CONFIRMACAO_SUBSTITUICAO_NECESSARIA"
      ) {
        setConfirmacaoSubstituicaoAberta(
          true
        );

        return;
      }


      setErroPeriodo(
        dados.mensagem ||
          "Não foi possível aplicar o período."
      );

    } finally {
      setSalvandoPeriodo(false);
    }
  }
  /*
   * =========================================================
   * FECHAMENTO EM MASSA
   * =========================================================
   */

  function abrirModalFechamento() {
    /*
     * Começamos pelo mês visualizado, assim como na abertura.
     * Todos os dias da semana vêm selecionados porque o caso
     * mais comum de fechamento é um período inteiro.
     */
    setFechamentoInicio(inicioMes);
    setFechamentoFim(fimMes);

    setFechamentoDiasSemana([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ]);

    setFechamentoObservacao("");
    setErroFechamento("");
    setMensagemFechamento("");
    setResumoFechamento(null);
    setConfirmacaoFechamentoAberta(false);
    setModalFechamentoAberto(true);
  }


  function fecharModalFechamento() {
    if (salvandoFechamento) {
      return;
    }

    setModalFechamentoAberto(false);
    setConfirmacaoFechamentoAberta(false);
    setErroFechamento("");
    setMensagemFechamento("");
    setResumoFechamento(null);
  }


  function alternarDiaSemanaFechamento(
    numero
  ) {
    setFechamentoDiasSemana(
      (atuais) => {
        if (atuais.includes(numero)) {
          return atuais.filter(
            (dia) => dia !== numero
          );
        }

        return [
          ...atuais,
          numero,
        ].sort(
          (a, b) => a - b
        );
      }
    );

    setErroFechamento("");
  }


  function validarFechamento() {
    if (
      !fechamentoInicio ||
      !fechamentoFim
    ) {
      setErroFechamento(
        "Informe a data inicial e a data final."
      );

      return false;
    }

    if (
      fechamentoFim <
      fechamentoInicio
    ) {
      setErroFechamento(
        "A data final não pode ser anterior à data inicial."
      );

      return false;
    }

    if (
      fechamentoDiasSemana.length ===
      0
    ) {
      setErroFechamento(
        "Selecione pelo menos um dia da semana."
      );

      return false;
    }

    if (
      fechamentoObservacao
        .trim()
        .length > 1000
    ) {
      setErroFechamento(
        "A observação deve possuir no máximo 1000 caracteres."
      );

      return false;
    }

    return true;
  }


  function solicitarFechamentoPeriodo() {
    setErroFechamento("");
    setMensagemFechamento("");
    setResumoFechamento(null);

    if (!validarFechamento()) {
      return;
    }

    /*
     * O fechamento em massa sempre exige uma confirmação
     * explícita antes da requisição.
     *
     * Isso evita que um período inteiro seja fechado
     * acidentalmente com apenas um clique.
     */
    setConfirmacaoFechamentoAberta(true);
  }


  function confirmarFechamentoPeriodo() {
    setConfirmacaoFechamentoAberta(
      false
    );

    /*
     * Funcionários podem preparar a alteração, mas a operação
     * só é executada depois que o backend validar a senha de
     * um Administrador ou Gerente ativo.
     */
    if (ehFuncionario) {
      setTipoOperacaoAutorizacao(
        "FECHAMENTO"
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");

      setModalAutorizacaoAberto(
        true
      );

      return;
    }

    /*
     * Administrador e Gerente não precisam da autorização
     * adicional. A confirmação destrutiva já foi realizada.
     */
    executarFechamentoPeriodo();
  }


  async function executarFechamentoPeriodo(
    senha = null
  ) {
    if (!validarFechamento()) {
      return;
    }

    try {
      setSalvandoFechamento(true);
      setErroFechamento("");
      setMensagemFechamento("");
      setErroAutorizacao("");

      const token =
        localStorage.getItem(
          "token"
        );

      const corpo = {
        data_inicio:
          fechamentoInicio,

        data_fim:
          fechamentoFim,

        dias_semana:
          fechamentoDiasSemana,

        observacao:
          fechamentoObservacao.trim(),

        /*
         * Esta confirmação também é validada no backend.
         * Assim, a segurança não depende somente do frontend.
         */
        confirmacao_fechamento:
          true,
      };


      /*
       * A senha só existe quando quem está executando a
       * operação é um Funcionário.
       *
       * O frontend não informa qual usuário está autorizando.
       * O backend identifica se a senha pertence a um
       * Administrador ou Gerente ativo.
       */
      if (senha) {
        corpo.senha_autorizacao =
          senha;
      }


      const resposta =
        await axios.post(
          `${API_URL}/agenda-publica/admin/operacoes/fechamento`,
          corpo,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );


      setMensagemFechamento(
        resposta.data?.mensagem ||
          "Período fechado com sucesso."
      );

      setResumoFechamento(
        resposta.data?.resumo ||
          null
      );


      /*
       * Se a operação veio do fluxo de Funcionário,
       * fechamos e limpamos o modal de autorização.
       */
      setModalAutorizacaoAberto(
        false
      );

      setSenhaAutorizacao("");
      setErroAutorizacao("");

      setTipoOperacaoAutorizacao(
        null
      );


      /*
       * Recarregamos o mês para que o calendário mostre
       * imediatamente as datas que acabaram de ser fechadas.
       */
      await carregarAgenda();

    } catch (erro) {
      console.error(
        "Erro ao fechar período:",
        erro
      );

      const dados =
        erro.response?.data || {};


      /*
       * O backend é a autoridade final sobre a permissão.
       * Mesmo que o frontend já saiba que é Funcionário,
       * continuamos tratando os códigos retornados pela API.
       */
      if (
        dados.codigo ===
          "AUTORIZACAO_NECESSARIA" ||
        dados.codigo ===
          "AUTORIZACAO_INVALIDA"
      ) {
        setTipoOperacaoAutorizacao(
          "FECHAMENTO"
        );

        setModalAutorizacaoAberto(
          true
        );

        setErroAutorizacao(
          dados.codigo ===
            "AUTORIZACAO_INVALIDA"
            ? (
              dados.mensagem ||
              "Senha de autorização inválida."
            )
            : ""
        );

        return;
      }


      /*
       * Caso alguém tente chamar a API sem a confirmação
       * explícita, o backend também bloqueia a operação.
       */
      if (
        dados.codigo ===
        "CONFIRMACAO_FECHAMENTO_NECESSARIA"
      ) {
        setConfirmacaoFechamentoAberta(
          true
        );

        return;
      }


      setErroFechamento(
        dados.mensagem ||
          "Não foi possível fechar o período."
      );

    } finally {
      setSalvandoFechamento(false);
    }
  }


  /*
   * =========================================================
   * AUTORIZAÇÃO COMPARTILHADA
   * =========================================================
   *
   * Este modal agora atende três operações:
   *
   * INDIVIDUAL  -> alteração de uma única data
   * PERIODO     -> abertura/configuração em massa
   * FECHAMENTO  -> fechamento em massa
   */

  async function autorizarESalvar(
    evento
  ) {
    evento.preventDefault();

    if (
      !senhaAutorizacao.trim()
    ) {
      setErroAutorizacao(
        "Informe a senha de autorização."
      );

      return;
    }


    if (
      tipoOperacaoAutorizacao ===
      "INDIVIDUAL"
    ) {
      await executarSalvamentoIndividual(
        senhaAutorizacao
      );

      return;
    }


    if (
      tipoOperacaoAutorizacao ===
      "PERIODO"
    ) {
      const confirmou =
        window.sessionStorage.getItem(
          "agenda_confirmou_substituicao"
        ) === "true";

      await executarAplicacaoPeriodo(
        senhaAutorizacao,
        confirmou
      );

      return;
    }


    if (
      tipoOperacaoAutorizacao ===
      "FECHAMENTO"
    ) {
      await executarFechamentoPeriodo(
        senhaAutorizacao
      );
    }
  }


  function fecharModalAutorizacao() {
    /*
     * Não permitimos fechar o modal enquanto alguma alteração
     * estiver sendo processada para evitar requisições
     * duplicadas ou estado visual inconsistente.
     */
    if (
      salvandoEditor ||
      salvandoPeriodo ||
      salvandoFechamento
    ) {
      return;
    }

    setModalAutorizacaoAberto(
      false
    );

    setSenhaAutorizacao("");
    setErroAutorizacao("");

    setTipoOperacaoAutorizacao(
      null
    );

    window.sessionStorage.removeItem(
      "agenda_confirmou_substituicao"
    );
  }


  /*
   * =========================================================
   * APARÊNCIA DOS DIAS
   * =========================================================
   */

  function classeDia(agenda) {
    if (!agenda) {
      return (
        "agenda-dia " +
        "agenda-dia-nao-configurado"
      );
    }

    if (!agenda.aberto) {
      return (
        "agenda-dia " +
        "agenda-dia-fechado"
      );
    }

    if (agenda.publicado) {
      return (
        "agenda-dia " +
        "agenda-dia-publicado"
      );
    }

    return (
      "agenda-dia " +
      "agenda-dia-nao-publicado"
    );
  }


  function textoDia(agenda) {
    if (!agenda) {
      return "Não configurado";
    }

    if (!agenda.aberto) {
      return "Fechado";
    }

    const quantidade =
      (agenda.horarios || [])
        .filter(
          (item) =>
            item.status ===
            "DISPONIVEL"
        )
        .length;

    return quantidade === 1
      ? "1 horário"
      : `${quantidade} horários`;
  }


  return (
    <div className="agenda-publica-page">

      <div className="agenda-publica-topo">
        <div>
          <span className="agenda-publica-eyebrow">
            SITE PÚBLICO
          </span>

          <h1>
            Agenda Pública
          </h1>

          <p>
            Defina exatamente quais dias e horários
            estarão disponíveis para agendamento no site.
          </p>
        </div>


        <div className="agenda-publica-acoes">
          <button
            type="button"
            className="agenda-botao-hoje"
            onClick={irParaHoje}
          >
            Hoje
          </button>


          <button
            type="button"
            className="agenda-botao-fechar-periodo"
            onClick={
              abrirModalFechamento
            }
          >
            Fechar período
          </button>


          <button
            type="button"
            className="agenda-botao-periodo"
            onClick={
              abrirModalPeriodo
            }
          >
            + Abrir período
          </button>
        </div>
      </div>


      {ehFuncionario && (
        <div className="agenda-aviso-funcionario">
          <div className="agenda-aviso-funcionario-icone">
            🔐
          </div>

          <div>
            <strong>
              Alterações precisam de autorização
            </strong>

            <span>
              Você pode preparar normalmente as alterações.
              Ao salvar, será solicitada a senha de um
              Administrador ou Gerente ativo.
            </span>
          </div>
        </div>
      )}


      {erroCarregamento && (
        <div className="agenda-alerta agenda-alerta-erro">
          {erroCarregamento}
        </div>
      )}


      <div className="agenda-publica-card">
        <section className="agenda-calendario">
          <div className="agenda-calendario-cabecalho">
            <div>
              <span>
                CALENDÁRIO DE DISPONIBILIDADE
              </span>

              <h2>
                {NOMES_MESES[mesAtual]}{" "}
                {anoAtual}
              </h2>
            </div>

            <div className="agenda-navegacao">
              <button
                type="button"
                onClick={() =>
                  alterarMes(-1)
                }
                aria-label="Mês anterior"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={() =>
                  alterarMes(1)
                }
                aria-label="Próximo mês"
              >
                ›
              </button>
            </div>
          </div>


          {carregando ? (
            <div className="agenda-carregando">
              Carregando agenda...
            </div>
          ) : (
            <>
              <div className="agenda-semana">
                {DIAS_SEMANA.map(
                  (dia) => (
                    <div
                      key={
                        dia.numero
                      }
                    >
                      {dia.curto}
                    </div>
                  )
                )}
              </div>


              <div className="agenda-grade">
                {celulasCalendario.map(
                  (celula) => {
                    if (
                      celula.tipo ===
                      "vazio"
                    ) {
                      return (
                        <div
                          key={
                            celula.chave
                          }
                          className="agenda-dia-vazio"
                        />
                      );
                    }


                    const selecionado =
                      editorAberto &&
                      dataSelecionada ===
                        celula.data;


                    return (
                      <button
                        type="button"
                        key={
                          celula.chave
                        }
                        className={
                          `${classeDia(
                            celula.agenda
                          )}${
                            selecionado
                              ? " agenda-dia-selecionado"
                              : ""
                          }`
                        }
                        onClick={() =>
                          abrirEditorDia(
                            celula.data
                          )
                        }
                      >
                        <strong>
                          {celula.numero}
                        </strong>

                        <span>
                          {textoDia(
                            celula.agenda
                          )}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>
            </>
          )}
        </section>


        <aside className="agenda-resumo">
          <span className="agenda-resumo-eyebrow">
            VISÃO DO MÊS
          </span>

          <h3>
            {NOMES_MESES[mesAtual]}
          </h3>

          <div className="agenda-resumo-destaque">
            <strong>
              {resumoMes.disponiveis}
            </strong>

            <span>
              horários disponíveis
            </span>
          </div>


          <div className="agenda-resumo-lista">
            <div>
              <span>
                Dias abertos
              </span>

              <strong>
                {resumoMes.diasAbertos}
              </strong>
            </div>

            <div>
              <span>
                Dias publicados
              </span>

              <strong>
                {resumoMes.diasPublicados}
              </strong>
            </div>

            <div>
              <span>
                Horários ocupados
              </span>

              <strong>
                {resumoMes.ocupados}
              </strong>
            </div>

            <div>
              <span>
                Horários bloqueados
              </span>

              <strong>
                {resumoMes.bloqueados}
              </strong>
            </div>
          </div>


          <div className="agenda-legenda">
            <h4>
              Legenda
            </h4>

            <div>
              <span className="agenda-legenda-cor publicado" />
              Publicado no site
            </div>

            <div>
              <span className="agenda-legenda-cor aberto" />
              Aberto não publicado
            </div>

            <div>
              <span className="agenda-legenda-cor fechado" />
              Fechado
            </div>

            <div>
              <span className="agenda-legenda-cor nao-configurado" />
              Não configurado
            </div>
          </div>
        </aside>
      </div>
            {/* ===================================================
          EDITOR INDIVIDUAL
          =================================================== */}

      {editorAberto && (
        <div
          className="agenda-editor-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              fecharEditor();
            }
          }}
        >
          <section
            className="agenda-editor"
            role="dialog"
            aria-modal="true"
          >
            <div className="agenda-editor-cabecalho">
              <div>
                <span>
                  {diaConfigurado
                    ? "EDITAR DATA"
                    : "CONFIGURAR DATA"}
                </span>

                <h2>
                  {formatarDataCompleta(
                    dataSelecionada
                  )}
                </h2>
              </div>

              <button
                type="button"
                className="agenda-editor-fechar"
                onClick={fecharEditor}
                disabled={
                  salvandoEditor
                }
              >
                ×
              </button>
            </div>


            {carregandoEditor ? (
              <div className="agenda-editor-carregando">
                Carregando configuração...
              </div>
            ) : (
              <div className="agenda-editor-conteudo">

                {erroEditor && (
                  <div className="agenda-alerta agenda-alerta-erro">
                    {erroEditor}
                  </div>
                )}

                {mensagemEditor && (
                  <div className="agenda-alerta agenda-alerta-sucesso">
                    {mensagemEditor}
                  </div>
                )}


                <div className="agenda-editor-bloco">
                  <div className="agenda-editor-bloco-titulo">
                    <div>
                      <span>
                        DISPONIBILIDADE
                      </span>

                      <strong>
                        O pet shop trabalhará nesta data?
                      </strong>
                    </div>

                    <label className="agenda-switch">
                      <input
                        type="checkbox"
                        checked={
                          diaAberto
                        }
                        onChange={(
                          evento
                        ) =>
                          alterarDiaAberto(
                            evento.target
                              .checked
                          )
                        }
                      />

                      <span className="agenda-switch-slider" />
                    </label>
                  </div>

                  <p>
                    {diaAberto
                      ? "A data está aberta para receber horários."
                      : "A data está fechada e não aparecerá como disponível."}
                  </p>
                </div>


                <div
                  className={
                    `agenda-editor-bloco${
                      !diaAberto
                        ? " agenda-editor-bloco-desabilitado"
                        : ""
                    }`
                  }
                >
                  <div className="agenda-editor-bloco-titulo">
                    <div>
                      <span>
                        PUBLICAÇÃO
                      </span>

                      <strong>
                        Mostrar a data no site?
                      </strong>
                    </div>

                    <label className="agenda-switch">
                      <input
                        type="checkbox"
                        checked={
                          diaPublicado
                        }
                        disabled={
                          !diaAberto
                        }
                        onChange={(
                          evento
                        ) =>
                          alterarPublicado(
                            evento.target
                              .checked
                          )
                        }
                      />

                      <span className="agenda-switch-slider" />
                    </label>
                  </div>

                  <p>
                    Uma data pode permanecer aberta
                    internamente sem ser publicada.
                  </p>
                </div>


                <div className="agenda-editor-secao">
                  <div className="agenda-editor-secao-cabecalho">
                    <div>
                      <span>
                        HORÁRIOS
                      </span>

                      <h3>
                        Disponibilidade do dia
                      </h3>
                    </div>

                    <strong className="agenda-editor-contador">
                      {horarios.length}
                    </strong>
                  </div>


                  <div className="agenda-adicionar-horario">
                    <input
                      type="time"
                      value={
                        novoHorario
                      }
                      onChange={(
                        evento
                      ) =>
                        setNovoHorario(
                          evento.target
                            .value
                        )
                      }
                      disabled={
                        !diaAberto
                      }
                    />

                    <button
                      type="button"
                      onClick={
                        adicionarHorario
                      }
                      disabled={
                        !diaAberto
                      }
                    >
                      + Adicionar
                    </button>
                  </div>


                  {horarios.length ===
                  0 ? (
                    <div className="agenda-horarios-vazio">
                      <strong>
                        Nenhum horário
                      </strong>

                      <span>
                        Esta data ainda não possui horários.
                      </span>
                    </div>
                  ) : (
                    <div className="agenda-horarios-lista">
                      {horarios.map(
                        (
                          horario,
                          indice
                        ) => (
                          <div
                            className={
                              `agenda-horario-item agenda-horario-${horario.status.toLowerCase()}`
                            }
                            key={
                              horario.id ||
                              `${horario.horario}-${indice}`
                            }
                          >
                            <div className="agenda-horario-principal">
                              <strong>
                                {horario.horario}
                              </strong>

                              <span>
                                {horario.status}
                              </span>
                            </div>

                            {horario.status ===
                            "OCUPADO" ? (
                              <div className="agenda-horario-protegido">
                                🔒
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="agenda-horario-remover"
                                onClick={() =>
                                  removerHorario(
                                    indice
                                  )
                                }
                                disabled={
                                  !diaAberto
                                }
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>


                <div className="agenda-editor-secao">
                  <div className="agenda-editor-secao-cabecalho">
                    <div>
                      <span>
                        OBSERVAÇÃO
                      </span>

                      <h3>
                        Informação interna
                      </h3>
                    </div>
                  </div>

                  <textarea
                    value={observacao}
                    onChange={(
                      evento
                    ) =>
                      setObservacao(
                        evento.target.value
                      )
                    }
                    maxLength={1000}
                    rows={4}
                    placeholder="Ex.: horário especial, feriado, equipe reduzida..."
                  />

                  <div className="agenda-observacao-contador">
                    {observacao.length}/1000
                  </div>
                </div>
              </div>
            )}


            {!carregandoEditor && (
              <div className="agenda-editor-rodape">
                <button
                  type="button"
                  className="agenda-editor-cancelar"
                  onClick={fecharEditor}
                  disabled={
                    salvandoEditor
                  }
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="agenda-editor-salvar"
                  onClick={
                    solicitarSalvamentoIndividual
                  }
                  disabled={
                    salvandoEditor
                  }
                >
                  {salvandoEditor
                    ? "Salvando..."
                    : ehFuncionario
                      ? "Solicitar autorização"
                      : "Salvar alterações"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}


      {/* ===================================================
          ABERTURA EM MASSA
          =================================================== */}

      {modalPeriodoAberto && (
        <div className="agenda-periodo-overlay">
          <section
            className="agenda-periodo-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="agenda-periodo-topo">
              <div>
                <span>
                  AGENDA EM MASSA
                </span>

                <h2>
                  Abrir período
                </h2>

                <p>
                  Escolha exatamente as datas e os horários
                  que ficarão disponíveis.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  fecharModalPeriodo
                }
                disabled={
                  salvandoPeriodo
                }
              >
                ×
              </button>
            </div>


            <div className="agenda-periodo-conteudo">

              {erroPeriodo && (
                <div className="agenda-alerta agenda-alerta-erro">
                  {erroPeriodo}
                </div>
              )}

              {mensagemPeriodo && (
                <div className="agenda-alerta agenda-alerta-sucesso">
                  {mensagemPeriodo}
                </div>
              )}


              {resumoOperacao && (
                <div className="agenda-periodo-resultado">
                  <strong>
                    Operação concluída
                  </strong>

                  <div>
                    <span>
                      Datas selecionadas
                    </span>
                    <b>
                      {resumoOperacao.datas_selecionadas}
                    </b>
                  </div>

                  <div>
                    <span>
                      Datas criadas
                    </span>
                    <b>
                      {resumoOperacao.datas_criadas}
                    </b>
                  </div>

                  <div>
                    <span>
                      Datas alteradas
                    </span>
                    <b>
                      {resumoOperacao.datas_alteradas}
                    </b>
                  </div>

                  <div>
                    <span>
                      Datas mantidas
                    </span>
                    <b>
                      {resumoOperacao.datas_mantidas}
                    </b>
                  </div>

                  <div>
                    <span>
                      Horários adicionados
                    </span>
                    <b>
                      {resumoOperacao.horarios_adicionados}
                    </b>
                  </div>
                </div>
              )}


              <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    01
                  </span>

                  <div>
                    <strong>
                      Período
                    </strong>

                    <p>
                      Defina a primeira e a última data.
                    </p>
                  </div>
                </div>

                <div className="agenda-periodo-datas">
                  <label>
                    <span>
                      Data inicial
                    </span>

                    <input
                      type="date"
                      value={
                        periodoInicio
                      }
                      onChange={(
                        evento
                      ) =>
                        setPeriodoInicio(
                          evento.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Data final
                    </span>

                    <input
                      type="date"
                      value={
                        periodoFim
                      }
                      onChange={(
                        evento
                      ) =>
                        setPeriodoFim(
                          evento.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </div>


              <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    02
                  </span>

                  <div>
                    <strong>
                      Dias da semana
                    </strong>

                    <p>
                      Somente os dias marcados serão configurados.
                    </p>
                  </div>
                </div>

                <div className="agenda-periodo-dias">
                  {DIAS_SEMANA.map(
                    (dia) => {
                      const ativo =
                        periodoDiasSemana.includes(
                          dia.numero
                        );

                      return (
                        <button
                          type="button"
                          key={
                            dia.numero
                          }
                          className={
                            ativo
                              ? "ativo"
                              : ""
                          }
                          onClick={() =>
                            alternarDiaSemana(
                              dia.numero
                            )
                          }
                        >
                          <strong>
                            {dia.curto}
                          </strong>

                          <span>
                            {dia.nome}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>


              <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    03
                  </span>

                  <div>
                    <strong>
                      Horários
                    </strong>

                    <p>
                      Os horários podem ser completamente irregulares.
                    </p>
                  </div>
                </div>

                <div className="agenda-periodo-adicionar">
                  <input
                    type="time"
                    value={
                      periodoNovoHorario
                    }
                    onChange={(
                      evento
                    ) =>
                      setPeriodoNovoHorario(
                        evento.target.value
                      )
                    }
                  />

                  <button
                    type="button"
                    onClick={
                      adicionarHorarioPeriodo
                    }
                  >
                    + Adicionar horário
                  </button>
                </div>


                {periodoHorarios.length >
                0 ? (
                  <div className="agenda-periodo-horarios">
                    {periodoHorarios.map(
                      (horario) => (
                        <div
                          key={horario}
                        >
                          <strong>
                            {horario}
                          </strong>

                          <button
                            type="button"
                            onClick={() =>
                              removerHorarioPeriodo(
                                horario
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="agenda-periodo-vazio">
                    Nenhum horário adicionado.
                  </div>
                )}
              </div>
                            <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    04
                  </span>

                  <div>
                    <strong>
                      Datas já configuradas
                    </strong>

                    <p>
                      Escolha o comportamento quando uma data já existir.
                    </p>
                  </div>
                </div>

                <div className="agenda-periodo-tratamentos">
                  {TRATAMENTOS.map(
                    (opcao) => (
                      <label
                        key={
                          opcao.valor
                        }
                        className={
                          periodoTratamento ===
                          opcao.valor
                            ? "selecionado"
                            : ""
                        }
                      >
                        <input
                          type="radio"
                          name="tratamento-agenda"
                          value={
                            opcao.valor
                          }
                          checked={
                            periodoTratamento ===
                            opcao.valor
                          }
                          onChange={() =>
                            setPeriodoTratamento(
                              opcao.valor
                            )
                          }
                        />

                        <div>
                          <strong>
                            {opcao.titulo}
                          </strong>

                          <span>
                            {opcao.descricao}
                          </span>
                        </div>
                      </label>
                    )
                  )}
                </div>

                {periodoTratamento ===
                  "SUBSTITUIR" && (
                  <div className="agenda-periodo-aviso-substituir">
                    <strong>
                      Atenção
                    </strong>

                    <span>
                      Os horários disponíveis e bloqueados
                      existentes nas datas selecionadas poderão
                      ser substituídos. Horários ocupados são
                      protegidos pelo sistema.
                    </span>
                  </div>
                )}
              </div>


              <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    05
                  </span>

                  <div>
                    <strong>
                      Publicação
                    </strong>

                    <p>
                      Defina se as datas serão publicadas
                      imediatamente no site.
                    </p>
                  </div>
                </div>

                <div className="agenda-periodo-publicacao">
                  <div>
                    <strong>
                      Publicar no site
                    </strong>

                    <span>
                      Os horários poderão aparecer para
                      agendamento assim que a operação terminar.
                    </span>
                  </div>

                  <label className="agenda-switch">
                    <input
                      type="checkbox"
                      checked={
                        periodoPublicado
                      }
                      onChange={(
                        evento
                      ) =>
                        setPeriodoPublicado(
                          evento.target.checked
                        )
                      }
                    />

                    <span className="agenda-switch-slider" />
                  </label>
                </div>
              </div>


              <div className="agenda-periodo-secao">
                <div className="agenda-periodo-secao-titulo">
                  <span>
                    06
                  </span>

                  <div>
                    <strong>
                      Observação
                    </strong>

                    <p>
                      Informação interna opcional para as
                      datas configuradas.
                    </p>
                  </div>
                </div>

                <textarea
                  value={
                    periodoObservacao
                  }
                  onChange={(
                    evento
                  ) =>
                    setPeriodoObservacao(
                      evento.target.value
                    )
                  }
                  maxLength={1000}
                  rows={4}
                  placeholder="Ex.: agenda especial do mês, equipe reduzida, horário de verão..."
                />

                <div className="agenda-observacao-contador">
                  {periodoObservacao.length}/1000
                </div>
              </div>
            </div>


            <div className="agenda-periodo-rodape">
              <button
                type="button"
                className="agenda-editor-cancelar"
                onClick={
                  fecharModalPeriodo
                }
                disabled={
                  salvandoPeriodo
                }
              >
                {resumoOperacao
                  ? "Fechar"
                  : "Cancelar"}
              </button>

              {!resumoOperacao && (
                <button
                  type="button"
                  className="agenda-editor-salvar"
                  onClick={
                    solicitarAplicacaoPeriodo
                  }
                  disabled={
                    salvandoPeriodo
                  }
                >
                  {salvandoPeriodo
                    ? "Aplicando..."
                    : ehFuncionario
                      ? "Solicitar autorização"
                      : "Aplicar período"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}


      {/* ===================================================
          FECHAMENTO EM MASSA
          =================================================== */}

      {modalFechamentoAberto && (
        <div className="agenda-fechamento-overlay">
          <section
            className="agenda-fechamento-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="agenda-fechamento-topo">
              <div>
                <span>
                  AGENDA EM MASSA
                </span>

                <h2>
                  Fechar período
                </h2>

                <p>
                  Escolha as datas que deixarão de receber
                  novos agendamentos pelo site.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  fecharModalFechamento
                }
                disabled={
                  salvandoFechamento
                }
              >
                ×
              </button>
            </div>


            <div className="agenda-fechamento-conteudo">

              {erroFechamento && (
                <div className="agenda-alerta agenda-alerta-erro">
                  {erroFechamento}
                </div>
              )}


              {mensagemFechamento && (
                <div className="agenda-alerta agenda-alerta-sucesso">
                  {mensagemFechamento}
                </div>
              )}


              {resumoFechamento && (
                <div className="agenda-fechamento-resultado">
                  <strong>
                    Fechamento concluído
                  </strong>

                  <div>
                    <span>
                      Datas selecionadas
                    </span>

                    <b>
                      {resumoFechamento
                        .datas_selecionadas ?? 0}
                    </b>
                  </div>

                  <div>
                    <span>
                      Datas fechadas
                    </span>

                    <b>
                      {resumoFechamento
                        .datas_fechadas ?? 0}
                    </b>
                  </div>

                  <div>
                    <span>
                      Já estavam fechadas
                    </span>

                    <b>
                      {resumoFechamento
                        .datas_ja_fechadas ?? 0}
                    </b>
                  </div>

                  <div>
                    <span>
                      Não configuradas
                    </span>

                    <b>
                      {resumoFechamento
                        .datas_nao_configuradas ?? 0}
                    </b>
                  </div>

                  <div>
                    <span>
                      Horários preservados
                    </span>

                    <b>
                      {resumoFechamento
                        .horarios_preservados ?? 0}
                    </b>
                  </div>

                  <div>
                    <span>
                      Ocupados preservados
                    </span>

                    <b>
                      {resumoFechamento
                        .horarios_ocupados_preservados ?? 0}
                    </b>
                  </div>
                </div>
              )}


              {!resumoFechamento && (
                <>
                  <div className="agenda-fechamento-secao">
                    <div className="agenda-fechamento-secao-titulo">
                      <span>
                        01
                      </span>

                      <div>
                        <strong>
                          Período
                        </strong>

                        <p>
                          Defina a primeira e a última data.
                        </p>
                      </div>
                    </div>


                    <div className="agenda-fechamento-datas">
                      <label>
                        <span>
                          Data inicial
                        </span>

                        <input
                          type="date"
                          value={
                            fechamentoInicio
                          }
                          onChange={(
                            evento
                          ) =>
                            setFechamentoInicio(
                              evento.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        <span>
                          Data final
                        </span>

                        <input
                          type="date"
                          value={
                            fechamentoFim
                          }
                          onChange={(
                            evento
                          ) =>
                            setFechamentoFim(
                              evento.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>


                  <div className="agenda-fechamento-secao">
                    <div className="agenda-fechamento-secao-titulo">
                      <span>
                        02
                      </span>

                      <div>
                        <strong>
                          Dias da semana
                        </strong>

                        <p>
                          Somente os dias marcados serão fechados.
                        </p>
                      </div>
                    </div>


                    <div className="agenda-fechamento-dias">
                      {DIAS_SEMANA.map(
                        (dia) => {
                          const ativo =
                            fechamentoDiasSemana.includes(
                              dia.numero
                            );

                          return (
                            <button
                              type="button"
                              key={
                                dia.numero
                              }
                              className={
                                ativo
                                  ? "ativo"
                                  : ""
                              }
                              onClick={() =>
                                alternarDiaSemanaFechamento(
                                  dia.numero
                                )
                              }
                            >
                              <strong>
                                {dia.curto}
                              </strong>

                              <span>
                                {dia.nome}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>


                  <div className="agenda-fechamento-secao">
                    <div className="agenda-fechamento-secao-titulo">
                      <span>
                        03
                      </span>

                      <div>
                        <strong>
                          Motivo / observação
                        </strong>

                        <p>
                          Informação interna opcional sobre
                          o fechamento.
                        </p>
                      </div>
                    </div>


                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={
                        fechamentoObservacao
                      }
                      onChange={(
                        evento
                      ) =>
                        setFechamentoObservacao(
                          evento.target.value
                        )
                      }
                      placeholder="Ex.: férias coletivas, manutenção, feriado..."
                    />

                    <div className="agenda-observacao-contador">
                      {fechamentoObservacao.length}/1000
                    </div>
                  </div>


                  <div className="agenda-fechamento-preservacao">
                    <div className="agenda-fechamento-preservacao-icone">
                      🔒
                    </div>

                    <div>
                      <strong>
                        Agendamentos serão preservados
                      </strong>

                      <span>
                        Fechar a agenda impede novos
                        agendamentos, mas não remove horários
                        nem cancela atendimentos que já existem.
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>


            <div className="agenda-fechamento-rodape">
              <button
                type="button"
                className="agenda-editor-cancelar"
                onClick={
                  fecharModalFechamento
                }
                disabled={
                  salvandoFechamento
                }
              >
                {resumoFechamento
                  ? "Fechar"
                  : "Cancelar"}
              </button>

              {!resumoFechamento && (
                <button
                  type="button"
                  className="agenda-fechamento-continuar"
                  onClick={
                    solicitarFechamentoPeriodo
                  }
                  disabled={
                    salvandoFechamento
                  }
                >
                  {salvandoFechamento
                    ? "Fechando..."
                    : "Continuar"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {/* ===================================================
          CONFIRMAÇÃO DE FECHAMENTO
          =================================================== */}

      {confirmacaoFechamentoAberta && (
        <div className="agenda-confirmacao-overlay">
          <div className="agenda-confirmacao-modal agenda-confirmacao-fechamento">
            <div className="agenda-confirmacao-icone">
              !
            </div>

            <span>
              CONFIRMAR FECHAMENTO
            </span>

            <h2>
              Fechar o período selecionado?
            </h2>

            <p>
              As datas selecionadas ficarão fechadas e não
              publicadas, impedindo novos agendamentos.
            </p>

            <p>
              Horários e agendamentos existentes serão
              preservados. Esta ação não cancela atendimentos.
            </p>

            <div className="agenda-confirmacao-acoes">
              <button
                type="button"
                onClick={() =>
                  setConfirmacaoFechamentoAberta(
                    false
                  )
                }
              >
                Voltar
              </button>

              <button
                type="button"
                className="agenda-confirmacao-fechar"
                onClick={
                  confirmarFechamentoPeriodo
                }
              >
                Confirmar fechamento
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===================================================
          CONFIRMAÇÃO DE SUBSTITUIÇÃO
          =================================================== */}

      {confirmacaoSubstituicaoAberta && (
        <div className="agenda-confirmacao-overlay">
          <div className="agenda-confirmacao-modal">
            <div className="agenda-confirmacao-icone">
              !
            </div>

            <span>
              CONFIRMAÇÃO NECESSÁRIA
            </span>

            <h2>
              Substituir configurações?
            </h2>

            <p>
              Esta operação poderá remover horários
              disponíveis ou bloqueados existentes nas
              datas selecionadas e substituí-los pelos
              novos horários informados.
            </p>

            <p>
              Horários que já estiverem ocupados são
              protegidos pelo sistema e podem impedir
              a substituição.
            </p>

            <div className="agenda-confirmacao-acoes">
              <button
                type="button"
                onClick={() =>
                  setConfirmacaoSubstituicaoAberta(
                    false
                  )
                }
              >
                Voltar
              </button>

              <button
                type="button"
                className="agenda-confirmacao-substituir"
                onClick={
                  confirmarSubstituicao
                }
              >
                Confirmar substituição
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===================================================
          AUTORIZAÇÃO
          =================================================== */}

      {modalAutorizacaoAberto && (
        <div
          className="agenda-autorizacao-overlay"
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              fecharModalAutorizacao();
            }
          }}
        >
          <form
            className="agenda-autorizacao-modal"
            onSubmit={
              autorizarESalvar
            }
          >
            <div className="agenda-autorizacao-icone">
              🔐
            </div>

            <span className="agenda-autorizacao-eyebrow">
              AUTORIZAÇÃO NECESSÁRIA
            </span>

            <h2>
              {tipoOperacaoAutorizacao ===
              "FECHAMENTO"
                ? "Autorizar fechamento"
                : "Confirmar alteração"}
            </h2>

            <p>
              Para continuar, informe a senha de um
              Administrador ou Gerente ativo.
            </p>

            <div className="agenda-autorizacao-regra">
              <strong>
                Importante
              </strong>

              <span>
                Não é necessário selecionar quem está
                autorizando. O sistema identificará
                automaticamente o Administrador ou
                Gerente correspondente à senha.
              </span>
            </div>


            {erroAutorizacao && (
              <div className="agenda-alerta agenda-alerta-erro">
                {erroAutorizacao}
              </div>
            )}


            <label className="agenda-autorizacao-campo">
              <span>
                Senha de autorização
              </span>

              <input
                type="password"
                value={
                  senhaAutorizacao
                }
                onChange={(
                  evento
                ) => {
                  setSenhaAutorizacao(
                    evento.target.value
                  );

                  setErroAutorizacao("");
                }}
                placeholder="Digite a senha"
                autoFocus
                autoComplete="current-password"
              />
            </label>


            <div className="agenda-autorizacao-acoes">
              <button
                type="button"
                className="agenda-editor-cancelar"
                onClick={
                  fecharModalAutorizacao
                }
                disabled={
                  salvandoEditor ||
                  salvandoPeriodo ||
                  salvandoFechamento
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="agenda-editor-salvar"
                disabled={
                  salvandoEditor ||
                  salvandoPeriodo ||
                  salvandoFechamento
                }
              >
                {salvandoEditor ||
                salvandoPeriodo ||
                salvandoFechamento
                  ? "Autorizando..."
                  : tipoOperacaoAutorizacao ===
                    "FECHAMENTO"
                    ? "Autorizar e fechar"
                    : "Autorizar e salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}


export default AgendaPublica;