import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import axios from "axios";

import "../public-styles/AgendamentoPublico.css";


const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001/api";

  /*
 * URL base do backend sem o sufixo /api.
 *
 * As fotos dos Pets são arquivos estáticos servidos pelo
 * backend e não pelas rotas da API.
 */
const BACKEND_URL =
  API_URL.replace(/\/api\/?$/, "");


function obterFotoPet(foto) {
  if (!foto) {
    return null;
  }

  /*
   * Caso o banco já possua uma URL completa, ela pode ser
   * utilizada diretamente.
   */
  if (
    foto.startsWith("http://") ||
    foto.startsWith("https://") ||
    foto.startsWith("data:")
  ) {
    return foto;
  }

  /*
   * Garante somente uma barra entre o endereço do backend
   * e o caminho salvo no banco.
   */
  const caminho =
    foto.startsWith("/")
      ? foto
      : `/${foto}`;

  return `${BACKEND_URL}${caminho}`;
}

const MESES = [
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
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
];


/*
 * Etapas principais do fluxo.
 *
 * Mantemos nomes explícitos para facilitar futuras
 * alterações no portal.
 */
const ORDEM_ETAPAS = {
  INICIO: 1,
  IDENTIFICACAO: 1,
  CODIGO: 1,
  CADASTRO: 1,
  PET: 2,
  SERVICOS: 3,
  DISPONIBILIDADE: 4,
  CONFIRMACAO: 5,
  SUCESSO: 6,
};


function formatarDataAPI(data) {
  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1
    ).padStart(2, "0");

  const dia =
    String(
      data.getDate()
    ).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}


function criarDataLocal(valor) {
  const [
    ano,
    mes,
    dia,
  ] = String(valor)
    .slice(0, 10)
    .split("-")
    .map(Number);

  return new Date(
    ano,
    mes - 1,
    dia
  );
}


function formatarDataCompleta(valor) {
  if (!valor) {
    return "";
  }

  return criarDataLocal(
    valor
  ).toLocaleDateString(
    "pt-BR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }
  );
}


function formatarHorario(valor) {
  if (!valor) {
    return "";
  }

  return String(valor).slice(
    0,
    5
  );
}


function formatarMoeda(valor) {
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


function somenteDigitos(valor) {
  return String(
    valor || ""
  ).replace(/\D/g, "");
}


function mascaraCPF(valor) {
  const digitos =
    somenteDigitos(valor)
      .slice(0, 11);

  return digitos
    .replace(
      /^(\d{3})(\d)/,
      "$1.$2"
    )
    .replace(
      /^(\d{3})\.(\d{3})(\d)/,
      "$1.$2.$3"
    )
    .replace(
      /\.(\d{3})(\d)/,
      ".$1-$2"
    );
}


function mascaraTelefone(valor) {
  const digitos =
    somenteDigitos(valor)
      .slice(0, 11);

  if (digitos.length <= 10) {
    return digitos
      .replace(
        /^(\d{2})(\d)/,
        "($1) $2"
      )
      .replace(
        /(\d{4})(\d)/,
        "$1-$2"
      );
  }

  return digitos
    .replace(
      /^(\d{2})(\d)/,
      "($1) $2"
    )
    .replace(
      /(\d{5})(\d)/,
      "$1-$2"
    );
}


function mascaraCEP(valor) {
  return somenteDigitos(
    valor
  )
    .slice(0, 8)
    .replace(
      /^(\d{5})(\d)/,
      "$1-$2"
    );
}


function AgendamentoPublico() {
  const hoje =
    useMemo(
      () => new Date(),
      []
    );


  /*
   * ==========================================================
   * FLUXO
   * ==========================================================
   */
  const [
    etapa,
    setEtapa,
  ] = useState("INICIO");

  const [
    tipoCliente,
    setTipoCliente,
  ] = useState(null);

  const [
    erroFluxo,
    setErroFluxo,
  ] = useState("");

  const [
    carregandoFluxo,
    setCarregandoFluxo,
  ] = useState(false);


  /*
   * A sessão pública é independente do login administrativo.
   *
   * Não utilizamos a chave "token", pois ela já pertence ao
   * login dos funcionários.
   */
  const [
    tokenCliente,
    setTokenCliente,
  ] = useState(
    () =>
      sessionStorage.getItem(
        "amores_pet_token_cliente"
      ) || ""
  );

  const [
    tutor,
    setTutor,
  ] = useState(null);


  /*
   * ==========================================================
   * CLIENTE EXISTENTE
   * ==========================================================
   */
  const [
    cpfIdentificacao,
    setCpfIdentificacao,
  ] = useState("");

  const [
    verificacao,
    setVerificacao,
  ] = useState(null);

  const [
    codigo,
    setCodigo,
  ] = useState("");


  /*
   * ==========================================================
   * NOVO CLIENTE
   * ==========================================================
   */
  const [
    dadosTutor,
    setDadosTutor,
  ] = useState({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });


  const [
    dadosPet,
    setDadosPet,
  ] = useState({
    nome: "",
    especie: "",
    raca: "",
    sexo: "",
    data_nascimento: "",
    idade_aproximada_anos: "",
    peso: "",
    cor: "",
    porte: "",
    castrado: "",
    alergias: "",
    necessidades_especiais: "",
    comportamento: "",
    observacoes: "",
  });


  /*
   * ==========================================================
   * PETS
   * ==========================================================
   */
  const [
    pets,
    setPets,
  ] = useState([]);

  const [
    petSelecionado,
    setPetSelecionado,
  ] = useState(null);


  /*
   * ==========================================================
   * SERVIÇOS
   * ==========================================================
   */
  const [
    servicos,
    setServicos,
  ] = useState([]);

  const [
    servicosSelecionados,
    setServicosSelecionados,
  ] = useState([]);

  const [
    carregandoServicos,
    setCarregandoServicos,
  ] = useState(false);


  /*
   * ==========================================================
   * AGENDA
   * ==========================================================
   */
  const [
    anoAtual,
    setAnoAtual,
  ] = useState(
    hoje.getFullYear()
  );

  const [
    mesAtual,
    setMesAtual,
  ] = useState(
    hoje.getMonth()
  );

  const [
    diasDisponiveis,
    setDiasDisponiveis,
  ] = useState([]);

  const [
    carregandoAgenda,
    setCarregandoAgenda,
  ] = useState(false);

  const [
    erroAgenda,
    setErroAgenda,
  ] = useState("");

  const [
    dataSelecionada,
    setDataSelecionada,
  ] = useState(null);

  const [
    horarioSelecionado,
    setHorarioSelecionado,
  ] = useState(null);


  /*
   * ==========================================================
   * CONFIRMAÇÃO
   * ==========================================================
   */
  const [
    observacoes,
    setObservacoes,
  ] = useState("");

  const [
    resultadoAgendamento,
    setResultadoAgendamento,
  ] = useState(null);


  const etapaNumero =
    ORDEM_ETAPAS[etapa] || 1;


  const periodoAtual =
    useMemo(
      () => {
        const inicio =
          new Date(
            anoAtual,
            mesAtual,
            1
          );

        const fim =
          new Date(
            anoAtual,
            mesAtual + 1,
            0
          );

        return {
          inicio:
            formatarDataAPI(
              inicio
            ),

          fim:
            formatarDataAPI(
              fim
            ),
        };
      },
      [
        anoAtual,
        mesAtual,
      ]
    );


  const valorTotal =
    useMemo(
      () =>
        servicosSelecionados
          .reduce(
            (
              total,
              servico
            ) =>
              total +
              Number(
                servico.valor || 0
              ),
            0
          ),
      [servicosSelecionados]
    );


  const duracaoTotal =
    useMemo(
      () =>
        servicosSelecionados
          .reduce(
            (
              total,
              servico
            ) =>
              total +
              Number(
                servico
                  .duracao_minutos ||
                0
              ),
            0
          ),
      [servicosSelecionados]
    );


  /*
   * ==========================================================
   * DISPONIBILIDADE REAL
   * ==========================================================
   */
  useEffect(
    () => {
      if (
        etapa !==
        "DISPONIBILIDADE"
      ) {
        return;
      }

      let ativo = true;


      async function carregar() {
        setCarregandoAgenda(
          true
        );

        setErroAgenda("");


        try {
          const resposta =
            await axios.get(
              `${API_URL}/agenda-publica/disponibilidade`,
              {
                params: {
                  data_inicio:
                    periodoAtual.inicio,

                  data_fim:
                    periodoAtual.fim,
                },
              }
            );


          if (!ativo) {
            return;
          }


          setDiasDisponiveis(
            Array.isArray(
              resposta.data?.dias
            )
              ? resposta.data.dias
              : []
          );

        } catch (erro) {
          if (!ativo) {
            return;
          }

          console.error(
            "Erro ao carregar disponibilidade:",
            erro
          );

          setDiasDisponiveis(
            []
          );

          setErroAgenda(
            erro.response?.data
              ?.mensagem ||
            "Não foi possível carregar os horários disponíveis."
          );

        } finally {
          if (ativo) {
            setCarregandoAgenda(
              false
            );
          }
        }
      }


      carregar();


      return () => {
        ativo = false;
      };
    },
    [
      etapa,
      periodoAtual,
    ]
  );


  const agendaPorData =
    useMemo(
      () => {
        const mapa =
          new Map();

        for (
          const dia
          of diasDisponiveis
        ) {
          mapa.set(
            String(
              dia.data
            ).slice(0, 10),
            dia
          );
        }

        return mapa;
      },
      [diasDisponiveis]
    );


  const diasCalendario =
    useMemo(
      () => {
        const primeiroDia =
          new Date(
            anoAtual,
            mesAtual,
            1
          );

        const ultimoDia =
          new Date(
            anoAtual,
            mesAtual + 1,
            0
          );

        const quantidadeDias =
          ultimoDia.getDate();

        const deslocamento =
          primeiroDia.getDay();

        const celulas = [];


        for (
          let i = 0;
          i < deslocamento;
          i++
        ) {
          celulas.push({
            vazio: true,
            chave:
              `vazio-${i}`,
          });
        }


        const inicioHoje =
          new Date(
            hoje.getFullYear(),
            hoje.getMonth(),
            hoje.getDate()
          );


        for (
          let numero = 1;
          numero <=
          quantidadeDias;
          numero++
        ) {
          const data =
            new Date(
              anoAtual,
              mesAtual,
              numero
            );

          const dataFormatada =
            formatarDataAPI(
              data
            );

          const agenda =
            agendaPorData.get(
              dataFormatada
            );

          const passado =
            data < inicioHoje;


          celulas.push({
            vazio: false,

            chave:
              dataFormatada,

            numero,

            data:
              dataFormatada,

            disponivel:
              !passado &&
              Boolean(
                agenda &&
                Array.isArray(
                  agenda.horarios
                ) &&
                agenda.horarios
                  .length > 0
              ),

            horarios:
              agenda?.horarios ||
              [],
          });
        }

        return celulas;
      },
      [
        agendaPorData,
        anoAtual,
        mesAtual,
        hoje,
      ]
    );


  const diaSelecionado =
    useMemo(
      () => {
        if (!dataSelecionada) {
          return null;
        }

        return (
          agendaPorData.get(
            dataSelecionada
          ) || null
        );
      },
      [
        agendaPorData,
        dataSelecionada,
      ]
    );


  const podeVoltarMes =
    anoAtual >
      hoje.getFullYear() ||
    (
      anoAtual ===
        hoje.getFullYear() &&
      mesAtual >
        hoje.getMonth()
    );


  /*
   * ==========================================================
   * FUNÇÕES GERAIS
   * ==========================================================
   */
  function limparErro() {
    setErroFluxo("");
  }


  function guardarSessao(
    token
  ) {
    setTokenCliente(token);

    sessionStorage.setItem(
      "amores_pet_token_cliente",
      token
    );
  }


  function cabecalhoCliente(
    token = tokenCliente
  ) {
    return {
      Authorization:
        `Bearer ${token}`,
    };
  }


  function voltarInicio() {
    setEtapa("INICIO");
    setTipoCliente(null);
    setErroFluxo("");
    setCodigo("");
    setVerificacao(null);
  }


  function iniciarFluxo(
    tipo
  ) {
    setTipoCliente(tipo);
    setErroFluxo("");

    if (
      tipo === "EXISTENTE"
    ) {
      setEtapa(
        "IDENTIFICACAO"
      );
    } else {
      setEtapa(
        "CADASTRO"
      );
    }
  }


  /*
   * ==========================================================
   * CLIENTE EXISTENTE
   * ==========================================================
   */
  async function solicitarCodigo(
    evento
  ) {
    evento.preventDefault();

    limparErro();


    if (
      somenteDigitos(
        cpfIdentificacao
      ).length !== 11
    ) {
      setErroFluxo(
        "Informe um CPF válido."
      );

      return;
    }


    try {
      setCarregandoFluxo(true);

      const resposta =
        await axios.post(
          `${API_URL}/agendamento-publico/identificacao/solicitar`,
          {
            cpf:
              cpfIdentificacao,
          }
        );


      if (
        !resposta.data
          ?.encontrado
      ) {
        setErroFluxo(
          resposta.data
            ?.mensagem ||
          "Não foi possível localizar o cadastro."
        );

        return;
      }


      setVerificacao(
        resposta.data
      );

      setCodigo("");

      setEtapa("CODIGO");

    } catch (erro) {
      setErroFluxo(
        erro.response?.data
          ?.mensagem ||
        "Não foi possível iniciar a identificação."
      );

    } finally {
      setCarregandoFluxo(
        false
      );
    }
  }


  async function confirmarCodigo(
    evento
  ) {
    evento.preventDefault();

    limparErro();


    if (
      !/^\d{6}$/.test(
        codigo
      )
    ) {
      setErroFluxo(
        "Digite o código de 6 dígitos."
      );

      return;
    }


    try {
      setCarregandoFluxo(true);

      const resposta =
        await axios.post(
          `${API_URL}/agendamento-publico/identificacao/confirmar`,
          {
            verificacao_id:
              verificacao
                ?.verificacao_id,

            codigo,
          }
        );


      guardarSessao(
        resposta.data.token
      );

      setTutor(
        resposta.data.tutor
      );


      await carregarPets(
        resposta.data.token
      );

      setEtapa("PET");

    } catch (erro) {
      setErroFluxo(
        erro.response?.data
          ?.mensagem ||
        "Não foi possível confirmar o código."
      );

    } finally {
      setCarregandoFluxo(
        false
      );
    }
  }


  async function carregarPets(
    token = tokenCliente
  ) {
    const resposta =
      await axios.get(
        `${API_URL}/agendamento-publico/meus-pets`,
        {
          headers:
            cabecalhoCliente(
              token
            ),
        }
      );


    setPets(
      Array.isArray(
        resposta.data?.pets
      )
        ? resposta.data.pets
        : []
    );
  }


  /*
   * ==========================================================
   * NOVO CLIENTE
   * ==========================================================
   */
  function alterarTutor(
    campo,
    valor
  ) {
    let novoValor = valor;


    if (campo === "cpf") {
      novoValor =
        mascaraCPF(valor);
    }


    if (
      campo === "telefone"
    ) {
      novoValor =
        mascaraTelefone(valor);
    }


    if (campo === "cep") {
      novoValor =
        mascaraCEP(valor);
    }


    if (campo === "estado") {
      novoValor =
        valor
          .toUpperCase()
          .slice(0, 2);
    }


    setDadosTutor(
      (anterior) => ({
        ...anterior,
        [campo]:
          novoValor,
      })
    );
  }


  function alterarPet(
    campo,
    valor
  ) {
    setDadosPet(
      (anterior) => ({
        ...anterior,
        [campo]:
          valor,
      })
    );
  }


  async function cadastrarNovoCliente(
    evento
  ) {
    evento.preventDefault();

    limparErro();


    if (
      !dadosTutor.nome.trim() ||
      !dadosTutor.cpf.trim() ||
      !dadosTutor.telefone.trim() ||
      !dadosTutor.email.trim() ||
      !dadosTutor.cep.trim() ||
      !dadosTutor.endereco.trim() ||
      !dadosTutor.numero.trim() ||
      !dadosTutor.bairro.trim() ||
      !dadosTutor.cidade.trim() ||
      !dadosTutor.estado.trim()
    ) {
      setErroFluxo(
        "Preencha todos os campos obrigatórios do Tutor."
      );

      return;
    }


    if (
      !dadosPet.nome.trim() ||
      !dadosPet.especie.trim() ||
      !dadosPet.porte
    ) {
      setErroFluxo(
        "Preencha nome, espécie e porte do Pet."
      );

      return;
    }


    if (
      dadosPet.data_nascimento &&
      dadosPet.idade_aproximada_anos
    ) {
      setErroFluxo(
        "Informe a data de nascimento ou a idade aproximada do Pet, não as duas."
      );

      return;
    }


    try {
      setCarregandoFluxo(true);


      const petParaAPI = {
        ...dadosPet,

        castrado:
          dadosPet.castrado === ""
            ? null
            : dadosPet.castrado ===
              "sim",
      };


      const resposta =
        await axios.post(
          `${API_URL}/agendamento-publico/cadastro`,
          {
            tutor:
              dadosTutor,

            pet:
              petParaAPI,
          }
        );


      guardarSessao(
        resposta.data.token
      );

      setTutor(
        resposta.data.tutor
      );


      /*
       * O cadastro retorna o primeiro Pet.
       * Ainda consultamos /meus-pets para manter o frontend
       * usando a mesma fonte dos clientes existentes.
       */
      await carregarPets(
        resposta.data.token
      );


      setPetSelecionado(
        resposta.data.pet
      );

      setEtapa("PET");

    } catch (erro) {
      setErroFluxo(
        erro.response?.data
          ?.mensagem ||
        "Não foi possível concluir o cadastro."
      );

    } finally {
      setCarregandoFluxo(
        false
      );
    }
  }
  /*
   * ==========================================================
   * PET
   * ==========================================================
   */
  function escolherPet(
    pet
  ) {
    setPetSelecionado(pet);
    setErroFluxo("");
  }


  async function continuarComPet() {
    if (!petSelecionado) {
      setErroFluxo(
        "Selecione o Pet que receberá o atendimento."
      );

      return;
    }


    setErroFluxo("");

    await carregarServicos();

    setEtapa("SERVICOS");
  }


  /*
   * ==========================================================
   * SERVIÇOS
   * ==========================================================
   */
  async function carregarServicos() {
    try {
      setCarregandoServicos(
        true
      );

      setErroFluxo("");


      const resposta =
        await axios.get(
          `${API_URL}/agendamento-publico/servicos`
        );


      setServicos(
        Array.isArray(
          resposta.data
        )
          ? resposta.data
          : []
      );

    } catch (erro) {
      console.error(
        "Erro ao carregar serviços:",
        erro
      );


      setServicos([]);

      setErroFluxo(
        erro.response?.data
          ?.mensagem ||
        "Não foi possível carregar os serviços disponíveis."
      );

    } finally {
      setCarregandoServicos(
        false
      );
    }
  }


  function alternarServico(
    servico
  ) {
    setServicosSelecionados(
      (anteriores) => {
        const existe =
          anteriores.some(
            (item) =>
              item.id ===
              servico.id
          );


        if (existe) {
          return anteriores.filter(
            (item) =>
              item.id !==
              servico.id
          );
        }


        return [
          ...anteriores,
          servico,
        ];
      }
    );

    setErroFluxo("");
  }


  function continuarParaAgenda() {
    if (
      servicosSelecionados
        .length === 0
    ) {
      setErroFluxo(
        "Selecione pelo menos um serviço."
      );

      return;
    }


    setErroFluxo("");

    setDataSelecionada(null);
    setHorarioSelecionado(null);

    setEtapa(
      "DISPONIBILIDADE"
    );
  }


  /*
   * ==========================================================
   * CALENDÁRIO
   * ==========================================================
   */
  function mesAnterior() {
    if (!podeVoltarMes) {
      return;
    }


    const novaData =
      new Date(
        anoAtual,
        mesAtual - 1,
        1
      );


    setAnoAtual(
      novaData.getFullYear()
    );

    setMesAtual(
      novaData.getMonth()
    );

    setDataSelecionada(null);
    setHorarioSelecionado(null);
  }


  function proximoMes() {
    const novaData =
      new Date(
        anoAtual,
        mesAtual + 1,
        1
      );


    setAnoAtual(
      novaData.getFullYear()
    );

    setMesAtual(
      novaData.getMonth()
    );

    setDataSelecionada(null);
    setHorarioSelecionado(null);
  }


  function selecionarData(
    dia
  ) {
    if (!dia.disponivel) {
      return;
    }


    setDataSelecionada(
      dia.data
    );

    /*
     * Um horário pertence a uma data específica.
     * Portanto, trocar a data invalida a seleção anterior.
     */
    setHorarioSelecionado(
      null
    );

    setErroFluxo("");
  }


  function selecionarHorario(
    horario
  ) {
    setHorarioSelecionado({
      id:
        horario.id,

      horario:
        horario.horario,
    });

    setErroFluxo("");
  }


  function continuarParaConfirmacao() {
    if (
      !dataSelecionada ||
      !horarioSelecionado
    ) {
      setErroFluxo(
        "Selecione uma data e um horário."
      );

      return;
    }


    setErroFluxo("");

    setEtapa(
      "CONFIRMACAO"
    );
  }


  /*
   * ==========================================================
   * CONFIRMAÇÃO DO AGENDAMENTO
   * ==========================================================
   */
  async function confirmarAgendamento() {
    if (
      !tokenCliente ||
      !petSelecionado ||
      !horarioSelecionado ||
      servicosSelecionados
        .length === 0
    ) {
      setErroFluxo(
        "O agendamento está incompleto. Revise os dados antes de confirmar."
      );

      return;
    }


    try {
      setCarregandoFluxo(true);
      setErroFluxo("");


      /*
       * O frontend envia apenas IDs.
       *
       * Valores, duração, vínculo do Pet e disponibilidade
       * são novamente validados pelo backend.
       */
      const resposta =
        await axios.post(
          `${API_URL}/agendamento-publico/confirmar`,
          {
            pet_id:
              petSelecionado.id,

            horario_id:
              horarioSelecionado.id,

            servicos:
              servicosSelecionados.map(
                (servico) =>
                  servico.id
              ),

            observacoes:
              observacoes.trim(),
          },
          {
            headers:
              cabecalhoCliente(),
          }
        );


      setResultadoAgendamento(
        resposta.data
      );

      setEtapa("SUCESSO");

    } catch (erro) {
      console.error(
        "Erro ao confirmar agendamento:",
        erro
      );


      const mensagem =
        erro.response?.data
          ?.mensagem ||
        "Não foi possível confirmar o agendamento.";


      setErroFluxo(mensagem);


      /*
       * A disponibilidade é sempre revalidada no servidor.
       *
       * Se outro cliente ocupar o horário entre a escolha
       * e a confirmação, voltamos à agenda para que o usuário
       * escolha outro horário.
       */
      if (
        erro.response?.status ===
          409 ||
        /horário|horario|dispon/i.test(
          mensagem
        )
      ) {
        setHorarioSelecionado(
          null
        );

        setEtapa(
          "DISPONIBILIDADE"
        );
      }

    } finally {
      setCarregandoFluxo(
        false
      );
    }
  }


  function voltarEtapa() {
    setErroFluxo("");


    if (
      etapa ===
      "IDENTIFICACAO"
    ) {
      voltarInicio();
      return;
    }


    if (etapa === "CODIGO") {
      setEtapa(
        "IDENTIFICACAO"
      );

      setCodigo("");
      return;
    }


    if (etapa === "CADASTRO") {
      voltarInicio();
      return;
    }


    if (etapa === "PET") {
      /*
       * Depois que a identidade foi validada ou o novo cadastro
       * foi criado, voltar ao início não apaga o cadastro.
       * Apenas reinicia a navegação visual.
       */
      voltarInicio();
      return;
    }


    if (
      etapa === "SERVICOS"
    ) {
      setEtapa("PET");
      return;
    }


    if (
      etapa ===
      "DISPONIBILIDADE"
    ) {
      setEtapa(
        "SERVICOS"
      );

      return;
    }


    if (
      etapa ===
      "CONFIRMACAO"
    ) {
      setEtapa(
        "DISPONIBILIDADE"
      );
    }
  }


  function novoAgendamento() {
    setResultadoAgendamento(
      null
    );

    setServicosSelecionados(
      []
    );

    setDataSelecionada(null);
    setHorarioSelecionado(null);
    setObservacoes("");

    /*
     * Mantemos Tutor, sessão e Pets.
     *
     * Assim um cliente que acabou de agendar pode iniciar outro
     * agendamento sem precisar validar sua identidade novamente.
     */
    if (
      tokenCliente &&
      pets.length > 0
    ) {
      setPetSelecionado(null);
      setEtapa("PET");
      return;
    }


    voltarInicio();
  }


  return (
    <div className="agendamento-publico">

      <header className="agendamento-header">

        <Link
          to="/"
          className="agendamento-marca"
        >
          <img
            src="/images/logo-amores-pet.png"
            alt="Amores Pet"
          />

          <div>
            <strong>
              Amores Pet
            </strong>

            <span>
              Banho, Tosa e Hospedagem
            </span>
          </div>
        </Link>


        <Link
          to="/"
          className="agendamento-voltar"
        >
          ← Voltar ao site
        </Link>

      </header>


      <main className="agendamento-conteudo">

        <section className="agendamento-introducao">

          <span className="agendamento-etiqueta">
            Agendamento online
          </span>

          <h1>
            Vamos cuidar do seu pet?
          </h1>

          <p>
            Faça seu agendamento online.
            Identifique seu cadastro ou faça
            seu primeiro cadastro, escolha o
            Pet, os serviços e um horário
            disponibilizado pela Amores Pet.
          </p>


          {etapa !== "SUCESSO" && (
            <div className="agendamento-passos">

              {[
                [
                  1,
                  "Seus dados",
                ],
                [
                  2,
                  "Seu Pet",
                ],
                [
                  3,
                  "Serviço",
                ],
                [
                  4,
                  "Data e horário",
                ],
                [
                  5,
                  "Confirmar",
                ],
              ].map(
                ([
                  numero,
                  titulo,
                ]) => (
                  <div
                    key={numero}
                    className={
                      etapaNumero ===
                      numero
                        ? "ativo"
                        : etapaNumero >
                          numero
                          ? "concluido"
                          : ""
                    }
                  >
                    <span>
                      {String(
                        numero
                      ).padStart(
                        2,
                        "0"
                      )}
                    </span>

                    <strong>
                      {titulo}
                    </strong>
                  </div>
                )
              )}

            </div>
          )}

        </section>


        {erroFluxo && (
          <div className="agendamento-mensagem-erro">
            {erroFluxo}
          </div>
        )}


        {etapa === "INICIO" && (
          <section className="agendamento-inicio">

            <div className="agendamento-inicio-cabecalho">

              <span>
                Começar
              </span>

              <h2>
                Como deseja continuar?
              </h2>

              <p>
                Você não precisa possuir uma
                conta no portal para realizar
                um agendamento.
              </p>

            </div>


            <div className="agendamento-opcoes">

              <button
                type="button"
                className="agendamento-opcao-principal"
                onClick={() =>
                  iniciarFluxo(
                    "EXISTENTE"
                  )
                }
              >
                <span>
                  Já sou cliente
                </span>

                <strong>
                  Identificar meu cadastro
                </strong>

                <small>
                  Use seu CPF para localizar
                  seus Pets cadastrados.
                </small>
              </button>


              <button
                type="button"
                className="agendamento-opcao"
                onClick={() =>
                  iniciarFluxo(
                    "NOVO"
                  )
                }
              >
                <span>
                  Primeira vez
                </span>

                <strong>
                  Fazer meu cadastro
                </strong>

                <small>
                  Cadastre seus dados e seu
                  primeiro Pet para continuar.
                </small>
              </button>

            </div>


            <div className="agendamento-login">

              <p>
                Já possui uma conta no portal?
              </p>

              <button
                type="button"
                disabled
              >
                Entrar no portal

                <small>
                  Disponível em breve
                </small>
              </button>

            </div>

          </section>
        )}


        {etapa ===
          "IDENTIFICACAO" && (
          <section className="agendamento-painel-formulario">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Cliente cadastrado
                </span>

                <h2>
                  Vamos localizar seu cadastro
                </h2>

                <p>
                  Informe o CPF utilizado no
                  cadastro da Amores Pet.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            <form
              className="agendamento-formulario-identificacao"
              onSubmit={
                solicitarCodigo
              }
            >
              <label>
                CPF *

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={
                    cpfIdentificacao
                  }
                  onChange={(
                    evento
                  ) =>
                    setCpfIdentificacao(
                      mascaraCPF(
                        evento.target
                          .value
                      )
                    )
                  }
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </label>


              <button
                type="submit"
                className="agendamento-acao-principal"
                disabled={
                  carregandoFluxo
                }
              >
                {carregandoFluxo
                  ? "Localizando..."
                  : "Continuar"}
              </button>
            </form>

          </section>
        )}


        {etapa === "CODIGO" && (
          <section className="agendamento-painel-formulario">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Verificação
                </span>

                <h2>
                  Confirme que é você
                </h2>

                <p>
                  Digite o código de 6 dígitos
                  enviado para o contato
                  cadastrado.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            {verificacao
              ?.destino_mascarado && (
              <div className="agendamento-destino-codigo">
                Código enviado para{" "}
                <strong>
                  {
                    verificacao
                      .destino_mascarado
                  }
                </strong>
              </div>
            )}


            {verificacao
              ?.codigo_desenvolvimento && (
              <div className="agendamento-codigo-dev">
                <span>
                  Ambiente de desenvolvimento
                </span>

                <strong>
                  {
                    verificacao
                      .codigo_desenvolvimento
                  }
                </strong>

                <small>
                  Este código não será exibido
                  em produção.
                </small>
              </div>
            )}


            <form
              className="agendamento-formulario-identificacao"
              onSubmit={
                confirmarCodigo
              }
            >
              <label>
                Código *

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(
                    evento
                  ) =>
                    setCodigo(
                      somenteDigitos(
                        evento.target
                          .value
                      ).slice(
                        0,
                        6
                      )
                    )
                  }
                  placeholder="000000"
                  maxLength={6}
                />
              </label>


              <button
                type="submit"
                className="agendamento-acao-principal"
                disabled={
                  carregandoFluxo
                }
              >
                {carregandoFluxo
                  ? "Confirmando..."
                  : "Confirmar código"}
              </button>
            </form>

          </section>
        )}


        {etapa ===
          "CADASTRO" && (
          <section className="agendamento-painel-formulario agendamento-cadastro">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Primeira visita
                </span>

                <h2>
                  Conte um pouco sobre vocês
                </h2>

                <p>
                  Criaremos o cadastro do Tutor
                  e do Pet antes de continuar.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            <form
              onSubmit={
                cadastrarNovoCliente
              }
            >
              <div className="agendamento-formulario-secao">

                <div className="agendamento-formulario-titulo">
                  <span>01</span>

                  <div>
                    <strong>
                      Dados do Tutor
                    </strong>

                    <small>
                      Seus dados de contato e
                      endereço.
                    </small>
                  </div>
                </div>


                <div className="agendamento-grade-formulario">

                  <label className="campo-largo">
                    Nome completo *

                    <input
                      value={
                        dadosTutor.nome
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "nome",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    CPF *

                    <input
                      inputMode="numeric"
                      value={
                        dadosTutor.cpf
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "cpf",
                          evento.target
                            .value
                        )
                      }
                      maxLength={14}
                    />
                  </label>


                  <label>
                    Celular / WhatsApp *

                    <input
                      inputMode="tel"
                      value={
                        dadosTutor.telefone
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "telefone",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label className="campo-largo">
                    E-mail *

                    <input
                      type="email"
                      value={
                        dadosTutor.email
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "email",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    CEP *

                    <input
                      inputMode="numeric"
                      value={
                        dadosTutor.cep
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "cep",
                          evento.target
                            .value
                        )
                      }
                      maxLength={9}
                    />
                  </label>


                  <label className="campo-largo">
                    Rua *

                    <input
                      value={
                        dadosTutor.endereco
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "endereco",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Número *

                    <input
                      value={
                        dadosTutor.numero
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "numero",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Complemento

                    <input
                      value={
                        dadosTutor.complemento
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "complemento",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Bairro *

                    <input
                      value={
                        dadosTutor.bairro
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "bairro",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Cidade *

                    <input
                      value={
                        dadosTutor.cidade
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "cidade",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Estado *

                    <input
                      value={
                        dadosTutor.estado
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarTutor(
                          "estado",
                          evento.target
                            .value
                        )
                      }
                      maxLength={2}
                      placeholder="RS"
                    />
                  </label>

                </div>
              </div>


              <div className="agendamento-formulario-secao">

                <div className="agendamento-formulario-titulo">
                  <span>02</span>

                  <div>
                    <strong>
                      Dados do Pet
                    </strong>

                    <small>
                      Informações importantes
                      para conhecermos seu Pet.
                    </small>
                  </div>
                </div>


                <div className="agendamento-grade-formulario">

                  <label>
                    Nome *

                    <input
                      value={
                        dadosPet.nome
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "nome",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Espécie *

                    <select
                      value={
                        dadosPet.especie
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "especie",
                          evento.target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Selecione
                      </option>

                      <option value="cachorro">
                        Cachorro
                      </option>

                      <option value="gato">
                        Gato
                      </option>

                      <option value="outro">
                        Outro
                      </option>
                    </select>
                  </label>


                  <label>
                    Raça

                    <input
                      value={
                        dadosPet.raca
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "raca",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Sexo

                    <select
                      value={
                        dadosPet.sexo
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "sexo",
                          evento.target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Não informado
                      </option>

                      <option value="macho">
                        Macho
                      </option>

                      <option value="femea">
                        Fêmea
                      </option>
                    </select>
                  </label>


                  <label>
                    Data de nascimento

                    <input
                      type="date"
                      value={
                        dadosPet
                          .data_nascimento
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "data_nascimento",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Idade aproximada

                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={
                        dadosPet
                          .idade_aproximada_anos
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "idade_aproximada_anos",
                          evento.target
                            .value
                        )
                      }
                      placeholder="Anos"
                    />
                  </label>


                  <label>
                    Porte *

                    <select
                      value={
                        dadosPet.porte
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "porte",
                          evento.target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Selecione
                      </option>

                      <option value="pequeno">
                        Pequeno
                      </option>

                      <option value="medio">
                        Médio
                      </option>

                      <option value="grande">
                        Grande
                      </option>
                    </select>
                  </label>


                  <label>
                    Castrado?

                    <select
                      value={
                        dadosPet.castrado
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "castrado",
                          evento.target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Não informado
                      </option>

                      <option value="sim">
                        Sim
                      </option>

                      <option value="nao">
                        Não
                      </option>
                    </select>
                  </label>


                  <label>
                    Peso aproximado (kg)

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        dadosPet.peso
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "peso",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label>
                    Cor

                    <input
                      value={
                        dadosPet.cor
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "cor",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label className="campo-largo">
                    Alergias

                    <textarea
                      value={
                        dadosPet.alergias
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "alergias",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label className="campo-largo">
                    Condição ou necessidade especial

                    <textarea
                      value={
                        dadosPet
                          .necessidades_especiais
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "necessidades_especiais",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label className="campo-largo">
                    Comportamento

                    <textarea
                      value={
                        dadosPet
                          .comportamento
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "comportamento",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>


                  <label className="campo-largo">
                    Outras observações

                    <textarea
                      value={
                        dadosPet.observacoes
                      }
                      onChange={(
                        evento
                      ) =>
                        alterarPet(
                          "observacoes",
                          evento.target
                            .value
                        )
                      }
                    />
                  </label>

                </div>
              </div>


              <div className="agendamento-formulario-acoes">

                <button
                  type="button"
                  className="agendamento-acao-secundaria"
                  onClick={
                    voltarEtapa
                  }
                >
                  Voltar
                </button>


                <button
                  type="submit"
                  className="agendamento-acao-principal"
                  disabled={
                    carregandoFluxo
                  }
                >
                  {carregandoFluxo
                    ? "Criando cadastro..."
                    : "Cadastrar e continuar"}
                </button>

              </div>
            </form>

          </section>
        )}


        {etapa === "PET" && (
          <section className="agendamento-painel-formulario">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Seu Pet
                </span>

                <h2>
                  Quem vem para a Amores Pet?
                </h2>

                <p>
                  {tutor?.nome
                    ? `${tutor.nome}, selecione o Pet que receberá o atendimento.`
                    : "Selecione o Pet que receberá o atendimento."}
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            {pets.length === 0 ? (
              <div className="agendamento-vazio">
                <strong>
                  Nenhum Pet disponível
                </strong>

                <p>
                  Não encontramos Pets ativos
                  vinculados ao seu cadastro.
                </p>
              </div>
            ) : (
              <div className="agendamento-pets-grade">

                {pets.map(
                  (pet) => {
                    const selecionado =
                      petSelecionado
                        ?.id === pet.id;


                    return (
                      <button
                        key={pet.id}
                        type="button"
                        className={
                          selecionado
                            ? "selecionado"
                            : ""
                        }
                        onClick={() =>
                          escolherPet(
                            pet
                          )
                        }
                      >
                        <div className="agendamento-pet-avatar">
                          {pet.foto ? (
                            <img
                              src={
                                obterFotoPet(
                                  pet.foto
                                )
                              }
                              alt={
                                pet.nome
                              }
                            />
                          ) : (
                            <span>
                              {String(
                                pet.nome ||
                                  "P"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>

                        <strong>
                          {pet.nome}
                        </strong>

                        <small>
                          {[
                            pet.especie,
                            pet.raca,
                          ]
                            .filter(
                              Boolean
                            )
                            .join(" • ")}
                        </small>

                        <span className="agendamento-pet-selecao">
                          {selecionado
                            ? "Selecionado ✓"
                            : "Selecionar"}
                        </span>
                      </button>
                    );
                  }
                )}

              </div>
            )}


            <div className="agendamento-formulario-acoes">

              <button
                type="button"
                className="agendamento-acao-secundaria"
                onClick={
                  voltarEtapa
                }
              >
                Voltar
              </button>


              <button
                type="button"
                className="agendamento-acao-principal"
                onClick={
                  continuarComPet
                }
                disabled={
                  !petSelecionado ||
                  pets.length === 0
                }
              >
                Continuar
              </button>

            </div>

          </section>
        )}


        {etapa ===
          "SERVICOS" && (
          <section className="agendamento-painel-formulario">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Serviços
                </span>

                <h2>
                  O que vamos fazer hoje?
                </h2>

                <p>
                  Você pode selecionar um ou
                  mais serviços para{" "}
                  <strong>
                    {petSelecionado?.nome}
                  </strong>.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            {carregandoServicos ? (
              <div className="agendamento-carregando">
                <div />

                <strong>
                  Carregando serviços...
                </strong>
              </div>
            ) : servicos.length === 0 ? (
              <div className="agendamento-vazio">
                <strong>
                  Nenhum serviço disponível
                </strong>

                <p>
                  Não há serviços públicos
                  ativos neste momento.
                </p>
              </div>
            ) : (
              <div className="agendamento-servicos-grade">

                {servicos.map(
                  (servico) => {
                    const selecionado =
                      servicosSelecionados
                        .some(
                          (item) =>
                            item.id ===
                            servico.id
                        );


                    return (
                      <button
                        key={
                          servico.id
                        }
                        type="button"
                        className={
                          selecionado
                            ? "selecionado"
                            : ""
                        }
                        onClick={() =>
                          alternarServico(
                            servico
                          )
                        }
                      >
                        <div className="agendamento-servico-topo">
                          <span>
                            {selecionado
                              ? "✓"
                              : "+"}
                          </span>

                          <strong>
                            {formatarMoeda(
                              servico.valor
                            )}
                          </strong>
                        </div>

                        <h3>
                          {servico.nome}
                        </h3>

                        <p>
                          {servico
                            .descricao ||
                            "Serviço disponível para agendamento online."}
                        </p>

                        {servico
                          .duracao_minutos && (
                          <small>
                            Duração aproximada:{" "}
                            {
                              servico
                                .duracao_minutos
                            }{" "}
                            min
                          </small>
                        )}
                      </button>
                    );
                  }
                )}

              </div>
            )}


            <div className="agendamento-servicos-resumo">

              <div>
                <span>
                  {
                    servicosSelecionados
                      .length
                  }{" "}
                  {servicosSelecionados
                    .length === 1
                    ? "serviço"
                    : "serviços"}
                </span>

                <strong>
                  {formatarMoeda(
                    valorTotal
                  )}
                </strong>

                {duracaoTotal > 0 && (
                  <small>
                    Tempo aproximado total:{" "}
                    {duracaoTotal} min
                  </small>
                )}
              </div>


              <button
                type="button"
                onClick={
                  continuarParaAgenda
                }
                disabled={
                  servicosSelecionados
                    .length === 0
                }
              >
                Escolher data
              </button>

            </div>

          </section>
        )}
        {etapa ===
          "DISPONIBILIDADE" && (
          <section className="agendamento-agenda">

            <div className="agendamento-agenda-topo">

              <div>
                <span>
                  Disponibilidade
                </span>

                <h2>
                  Escolha quando deseja vir
                </h2>

                <p>
                  Mostramos somente os dias e
                  horários liberados pela
                  Amores Pet.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
              >
                ← Voltar
              </button>

            </div>


            <div className="agendamento-agenda-contexto">

              <span>
                Agendamento para{" "}
                <strong>
                  {petSelecionado?.nome}
                </strong>
              </span>

              <small>
                {servicosSelecionados
                  .map(
                    (servico) =>
                      servico.nome
                  )
                  .join(" • ")}
              </small>

            </div>


            <div className="agendamento-calendario">

              <div className="agendamento-calendario-topo">

                <button
                  type="button"
                  onClick={
                    mesAnterior
                  }
                  disabled={
                    !podeVoltarMes
                  }
                  aria-label="Mês anterior"
                >
                  ‹
                </button>


                <div>
                  <strong>
                    {MESES[mesAtual]}
                  </strong>

                  <span>
                    {anoAtual}
                  </span>
                </div>


                <button
                  type="button"
                  onClick={
                    proximoMes
                  }
                  aria-label="Próximo mês"
                >
                  ›
                </button>

              </div>


              {erroAgenda && (
                <div className="agendamento-agenda-erro">
                  {erroAgenda}
                </div>
              )}


              {carregandoAgenda ? (
                <div className="agendamento-agenda-carregando">

                  <div />

                  <strong>
                    Consultando horários...
                  </strong>

                  <span>
                    Aguarde enquanto verificamos
                    a agenda da Amores Pet.
                  </span>

                </div>
              ) : (
                <>
                  <div className="agendamento-calendario-semana">

                    {DIAS_SEMANA.map(
                      (dia) => (
                        <span
                          key={dia}
                        >
                          {dia}
                        </span>
                      )
                    )}

                  </div>


                  <div className="agendamento-calendario-grade">

                    {diasCalendario.map(
                      (dia) => {
                        if (
                          dia.vazio
                        ) {
                          return (
                            <div
                              key={
                                dia.chave
                              }
                              className="agendamento-dia-vazio"
                            />
                          );
                        }


                        const selecionado =
                          dataSelecionada ===
                          dia.data;


                        return (
                          <button
                            key={
                              dia.chave
                            }
                            type="button"
                            className={[
                              "agendamento-dia",

                              dia.disponivel
                                ? "disponivel"
                                : "indisponivel",

                              selecionado
                                ? "selecionado"
                                : "",
                            ]
                              .filter(
                                Boolean
                              )
                              .join(" ")}
                            disabled={
                              !dia.disponivel
                            }
                            onClick={() =>
                              selecionarData(
                                dia
                              )
                            }
                          >
                            <span>
                              {dia.numero}
                            </span>

                            {dia.disponivel && (
                              <small>
                                Disponível
                              </small>
                            )}

                          </button>
                        );
                      }
                    )}

                  </div>
                </>
              )}

            </div>


            <div className="agendamento-horarios">

              {!dataSelecionada ? (
                <div className="agendamento-horarios-vazio">

                  <span>
                    04
                  </span>

                  <strong>
                    Selecione uma data
                  </strong>

                  <p>
                    Os horários disponíveis
                    aparecerão aqui.
                  </p>

                </div>
              ) : (
                <>
                  <div className="agendamento-horarios-topo">

                    <span>
                      Horários disponíveis
                    </span>

                    <h3>
                      {formatarDataCompleta(
                        dataSelecionada
                      )}
                    </h3>

                  </div>


                  {diaSelecionado
                    ?.horarios
                    ?.length > 0 ? (
                    <div className="agendamento-horarios-grade">

                      {diaSelecionado
                        .horarios
                        .map(
                          (horario) => {
                            const selecionado =
                              horarioSelecionado
                                ?.id ===
                              horario.id;


                            return (
                              <button
                                key={
                                  horario.id
                                }
                                type="button"
                                className={
                                  selecionado
                                    ? "selecionado"
                                    : ""
                                }
                                onClick={() =>
                                  selecionarHorario(
                                    horario
                                  )
                                }
                              >
                                {formatarHorario(
                                  horario.horario
                                )}
                              </button>
                            );
                          }
                        )}

                    </div>
                  ) : (
                    <div className="agendamento-vazio agendamento-vazio-menor">
                      <strong>
                        Nenhum horário disponível
                      </strong>

                      <p>
                        Escolha outra data.
                      </p>
                    </div>
                  )}
                </>
              )}

            </div>


            {dataSelecionada &&
              horarioSelecionado && (
              <div className="agendamento-selecao-resumo">

                <div>
                  <span>
                    Sua escolha
                  </span>

                  <strong>
                    {formatarDataCompleta(
                      dataSelecionada
                    )}
                  </strong>

                  <small>
                    às{" "}
                    {formatarHorario(
                      horarioSelecionado
                        .horario
                    )}
                  </small>
                </div>


                <button
                  type="button"
                  className="agendamento-continuar-agenda"
                  onClick={
                    continuarParaConfirmacao
                  }
                >
                  Continuar

                  <small>
                    Revisar agendamento
                  </small>
                </button>

              </div>
            )}

          </section>
        )}


        {etapa ===
          "CONFIRMACAO" && (
          <section className="agendamento-confirmacao">

            <div className="agendamento-painel-topo">

              <div>
                <span>
                  Última etapa
                </span>

                <h2>
                  Revise seu agendamento
                </h2>

                <p>
                  Confira as informações antes
                  de confirmar o horário.
                </p>
              </div>


              <button
                type="button"
                onClick={
                  voltarEtapa
                }
                disabled={
                  carregandoFluxo
                }
              >
                ← Voltar
              </button>

            </div>


            <div className="agendamento-revisao">

              <article className="agendamento-revisao-destaque">

                <span>
                  Quando
                </span>

                <strong>
                  {formatarDataCompleta(
                    dataSelecionada
                  )}
                </strong>

                <b>
                  {formatarHorario(
                    horarioSelecionado
                      ?.horario
                  )}
                </b>

              </article>


              <article>
                <span>
                  Pet
                </span>

                <strong>
                  {petSelecionado?.nome}
                </strong>

                <small>
                  {[
                    petSelecionado
                      ?.especie,

                    petSelecionado
                      ?.raca,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </small>
              </article>


              <article>
                <span>
                  Tutor
                </span>

                <strong>
                  {tutor?.nome ||
                    "Cliente identificado"}
                </strong>

                <small>
                  Cadastro confirmado
                </small>
              </article>

            </div>


            <div className="agendamento-revisao-servicos">

              <div className="agendamento-revisao-servicos-topo">

                <div>
                  <span>
                    Serviços
                  </span>

                  <strong>
                    O que foi selecionado
                  </strong>
                </div>


                <strong>
                  {formatarMoeda(
                    valorTotal
                  )}
                </strong>

              </div>


              <div className="agendamento-revisao-lista">

                {servicosSelecionados.map(
                  (servico) => (
                    <div
                      key={
                        servico.id
                      }
                    >
                      <span>
                        {servico.nome}
                      </span>

                      <strong>
                        {formatarMoeda(
                          servico.valor
                        )}
                      </strong>
                    </div>
                  )
                )}

              </div>


              {duracaoTotal > 0 && (
                <small className="agendamento-duracao-aviso">
                  Tempo aproximado dos
                  serviços: {duracaoTotal} min.
                  A disponibilidade do
                  agendamento é determinada
                  pelos horários liberados pela
                  Amores Pet.
                </small>
              )}

            </div>


            <label className="agendamento-observacoes">

              <span>
                Alguma observação?
              </span>

              <textarea
                value={
                  observacoes
                }
                onChange={(
                  evento
                ) =>
                  setObservacoes(
                    evento.target.value
                  )
                }
                maxLength={2000}
                placeholder="Conte algo que a equipe deva saber antes do atendimento..."
              />

              <small>
                {observacoes.length}/2000
              </small>

            </label>


            <div className="agendamento-confirmacao-aviso">

              <span>
                !
              </span>

              <p>
                Ao confirmar, este horário será
                reservado para{" "}
                <strong>
                  {petSelecionado?.nome}
                </strong>.
                A disponibilidade será validada
                novamente antes da criação do
                agendamento.
              </p>

            </div>


            <div className="agendamento-formulario-acoes">

              <button
                type="button"
                className="agendamento-acao-secundaria"
                onClick={
                  voltarEtapa
                }
                disabled={
                  carregandoFluxo
                }
              >
                Alterar horário
              </button>


              <button
                type="button"
                className="agendamento-acao-principal"
                onClick={
                  confirmarAgendamento
                }
                disabled={
                  carregandoFluxo
                }
              >
                {carregandoFluxo
                  ? "Confirmando..."
                  : "Confirmar agendamento"}
              </button>

            </div>

          </section>
        )}


        {etapa === "SUCESSO" && (
          <section className="agendamento-sucesso">

            <div className="agendamento-sucesso-selo">
              ✓
            </div>


            <span className="agendamento-sucesso-etiqueta">
              Agendamento confirmado
            </span>


            <h2>
              Esperamos vocês na Amores Pet!
            </h2>


            <p>
              O horário foi reservado com
              sucesso para{" "}
              <strong>
                {petSelecionado?.nome}
              </strong>.
            </p>


            <div className="agendamento-sucesso-resumo">

              <div>
                <span>
                  Data
                </span>

                <strong>
                  {formatarDataCompleta(
                    dataSelecionada
                  )}
                </strong>
              </div>


              <div>
                <span>
                  Horário
                </span>

                <strong>
                  {formatarHorario(
                    horarioSelecionado
                      ?.horario
                  )}
                </strong>
              </div>


              <div>
                <span>
                  Pet
                </span>

                <strong>
                  {petSelecionado?.nome}
                </strong>
              </div>


              <div>
                <span>
                  Valor previsto
                </span>

                <strong>
                  {formatarMoeda(
                    resultadoAgendamento
                      ?.valor_total ??
                    valorTotal
                  )}
                </strong>
              </div>

            </div>


            {resultadoAgendamento
              ?.agendamento?.id && (
              <div className="agendamento-protocolo">
                <span>
                  Agendamento
                </span>

                <strong>
                  #
                  {
                    resultadoAgendamento
                      .agendamento.id
                  }
                </strong>
              </div>
            )}


            <div className="agendamento-sucesso-acoes">

              <button
                type="button"
                onClick={
                  novoAgendamento
                }
              >
                Fazer outro agendamento
              </button>


              <Link to="/">
                Voltar para o site
              </Link>

            </div>

          </section>
        )}

      </main>


      <footer className="agendamento-footer">

        <div>
          <strong>
            Amores Pet
          </strong>

          <span>
            Cuidado, carinho e atenção em
            cada detalhe.
          </span>
        </div>


        <div>
          <Link to="/">
            Início
          </Link>

          <Link to="/galeria">
            Galeria
          </Link>
        </div>

      </footer>

    </div>
  );
}


export default AgendamentoPublico;