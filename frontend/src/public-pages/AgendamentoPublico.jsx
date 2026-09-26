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
 * Converte uma Date para YYYY-MM-DD utilizando os componentes
 * locais da data.
 *
 * Evitamos toISOString() aqui porque a conversão para UTC pode
 * deslocar o dia dependendo do fuso horário do navegador.
 */
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
  ] = valor
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


function AgendamentoPublico() {
  const hoje =
    useMemo(
      () => new Date(),
      []
    );


  /*
   * ==========================================================
   * ETAPA ATUAL DO FLUXO
   * ==========================================================
   *
   * "INICIO"        = escolha cliente existente/novo.
   * "DISPONIBILIDADE" = escolha de data e horário.
   *
   * Tutor, Pet e Serviço serão conectados no próximo bloco.
   */
  const [
    etapa,
    setEtapa,
  ] = useState("INICIO");


  const [
    tipoCliente,
    setTipoCliente,
  ] = useState(null);


  /*
   * ==========================================================
   * CALENDÁRIO
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
   * O período consultado corresponde exatamente ao mês
   * atualmente exibido no calendário.
   */
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


  /*
   * ==========================================================
   * CONSULTAR DISPONIBILIDADE REAL
   * ==========================================================
   *
   * Esta chamada não envia token.
   *
   * O endpoint público já filtra no backend:
   *
   * - dias abertos;
   * - dias publicados;
   * - horários DISPONÍVEIS.
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


  /*
   * Permite localizar rapidamente a configuração de uma data
   * sem percorrer o array inteiro em cada célula do calendário.
   */
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


          /*
           * Mesmo que o backend receba um período contendo hoje,
           * datas anteriores ao dia atual não podem ser escolhidas
           * pelo cliente.
           */
          const inicioHoje =
            new Date(
              hoje.getFullYear(),
              hoje.getMonth(),
              hoje.getDate()
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

            passado,

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
          ) ||
          null
        );
      },
      [
        agendaPorData,
        dataSelecionada,
      ]
    );


  /*
   * ==========================================================
   * NAVEGAÇÃO
   * ==========================================================
   */

  function iniciarFluxo(tipo) {
    setTipoCliente(tipo);

    /*
     * No Bloco D esta ação passará primeiro pela identificação
     * ou cadastro do Tutor/Pet.
     *
     * Por enquanto seguimos diretamente à disponibilidade para
     * validar a integração entre site público e agenda.
     */
    setEtapa(
      "DISPONIBILIDADE"
    );
  }


  function voltarInicio() {
    setEtapa("INICIO");

    setTipoCliente(null);

    setDataSelecionada(
      null
    );

    setHorarioSelecionado(
      null
    );

    setErroAgenda("");
  }


  function mesAnterior() {
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

    setDataSelecionada(
      null
    );

    setHorarioSelecionado(
      null
    );
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

    setDataSelecionada(
      null
    );

    setHorarioSelecionado(
      null
    );
  }


  function selecionarData(
    dia
  ) {
    if (
      !dia.disponivel
    ) {
      return;
    }


    setDataSelecionada(
      dia.data
    );

    /*
     * Alterar a data invalida o horário selecionado
     * anteriormente.
     */
    setHorarioSelecionado(
      null
    );
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
  }


  /*
   * Não permitimos navegar para meses completamente anteriores
   * ao mês atual.
   */
  const podeVoltarMes =
    anoAtual >
      hoje.getFullYear() ||
    (
      anoAtual ===
        hoje.getFullYear() &&
      mesAtual >
        hoje.getMonth()
    );


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
            Faça seu agendamento online de forma
            rápida. Escolha seu Pet, o serviço
            desejado e um dos horários
            disponibilizados pela Amores Pet.
          </p>


          <div className="agendamento-passos">

            <div
              className={
                etapa === "INICIO"
                  ? "ativo"
                  : "concluido"
              }
            >
              <span>01</span>

              <strong>
                Seus dados
              </strong>
            </div>


            <div>
              <span>02</span>

              <strong>
                Seu Pet
              </strong>
            </div>


            <div>
              <span>03</span>

              <strong>
                Serviço
              </strong>
            </div>


            <div
              className={
                etapa ===
                "DISPONIBILIDADE"
                  ? "ativo"
                  : ""
              }
            >
              <span>04</span>

              <strong>
                Data e horário
              </strong>
            </div>


            <div>
              <span>05</span>

              <strong>
                Confirmar
              </strong>
            </div>

          </div>

        </section>


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
                Você não precisa possuir uma conta
                para realizar um agendamento.
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
                  Localize seus dados e os Pets
                  vinculados ao seu cadastro.
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
                  Cadastre seus dados e seu Pet
                  para continuar o agendamento.
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
                  voltarInicio
                }
              >
                ← Voltar
              </button>

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


                  <div className="agendamento-horarios-grade">

                    {diaSelecionado
                      ?.horarios
                      ?.map(
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
                </>
              )}

            </div>


            {horarioSelecionado && (
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
                  disabled
                >
                  Continuar

                  <small>
                    Tutor e Pet no próximo bloco
                  </small>
                </button>

              </div>
            )}


            <div className="agendamento-agenda-contexto">
              <span>
                {tipoCliente ===
                "EXISTENTE"
                  ? "Cliente já cadastrado"
                  : "Novo cliente"}
              </span>

              <small>
                A identificação será realizada
                antes da confirmação definitiva.
              </small>
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
            Agendamento online
          </span>
        </div>


        <Link to="/">
          Voltar para a página inicial
        </Link>

      </footer>

    </div>
  );
}


export default AgendamentoPublico;