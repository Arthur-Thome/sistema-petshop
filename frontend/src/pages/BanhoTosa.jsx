import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function BanhoTosa() {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] =
    useSearchParams();

  const [atendimentos, setAtendimentos] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * O filtro vindo pela URL permite que atalhos externos,
   * como o Dashboard, abram esta mesma página mostrando
   * somente os atendimentos relevantes.
   */
  const filtro =
    searchParams.get("filtro");


  /*
   * Carrega somente os atendimentos que ainda
   * estão ativos: AGENDADO ou EM_ATENDIMENTO.
   */
  async function carregarAtendimentos() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          "/banho-tosa/ativos"
        );


      const dados =
        Array.isArray(resposta.data)
          ? resposta.data
          : resposta.data.atendimentos || [];


      setAtendimentos(dados);

    } catch (error) {
      console.error(
        "Erro ao carregar Banho e Tosa:",
        error
      );


      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar os atendimentos."
      );

    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarAtendimentos();
  }, []);


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }


    return new Date(data).toLocaleString(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
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


  function classeStatus(status) {
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
   * Compara ano, mês e dia no horário local do navegador.
   *
   * Evitamos comparar somente a parte YYYY-MM-DD de uma
   * string ISO porque isso poderia gerar diferença de data
   * devido ao fuso horário.
   */
  function ehHoje(data) {
    if (!data) {
      return false;
    }


    const dataAtendimento =
      new Date(data);

    if (
      Number.isNaN(
        dataAtendimento.getTime()
      )
    ) {
      return false;
    }


    const hoje =
      new Date();


    return (
      dataAtendimento.getFullYear() ===
        hoje.getFullYear() &&

      dataAtendimento.getMonth() ===
        hoje.getMonth() &&

      dataAtendimento.getDate() ===
        hoje.getDate()
    );
  }


  /*
   * Retorna os nomes dos vários serviços
   * vinculados ao mesmo atendimento.
   */
  function formatarServicos(servicos) {
    if (
      !Array.isArray(servicos) ||
      servicos.length === 0
    ) {
      return "Nenhum serviço";
    }


    return servicos
      .map((servico) => servico.nome)
      .join(" + ");
  }


  /*
   * Primeiro aplicamos o filtro funcional vindo pela URL.
   * Depois aplicamos a pesquisa digitada pelo usuário.
   *
   * Assim "/banho-tosa?filtro=hoje" continua permitindo
   * pesquisar somente dentro dos atendimentos de hoje.
   */
  const atendimentosFiltrados =
    atendimentos.filter(
      (atendimento) => {

        if (
          filtro === "hoje" &&
          !ehHoje(
            atendimento.agendado_para
          )
        ) {
          return false;
        }


        const termo =
          busca
            .trim()
            .toLowerCase();


        if (!termo) {
          return true;
        }


        const encontrouServico =
          Array.isArray(
            atendimento.servicos
          ) &&
          atendimento.servicos.some(
            (servico) =>
              servico.nome
                ?.toLowerCase()
                .includes(termo)
          );


        return (
          atendimento.pet_nome
            ?.toLowerCase()
            .includes(termo) ||

          atendimento.tutor_nome
            ?.toLowerCase()
            .includes(termo) ||

          encontrouServico
        );
      }
    );


  /*
   * Os resumos acompanham o filtro atual da página.
   * Ao entrar pelo Dashboard com filtro=hoje, os números
   * passam a representar somente os registros de hoje.
   */
  const atendimentosDoContexto =
    filtro === "hoje"
      ? atendimentos.filter(
          (atendimento) =>
            ehHoje(
              atendimento.agendado_para
            )
        )
      : atendimentos;


  const totalAgendados =
    atendimentosDoContexto.filter(
      (atendimento) =>
        atendimento.status ===
        "AGENDADO"
    ).length;


  const totalEmAtendimento =
    atendimentosDoContexto.filter(
      (atendimento) =>
        atendimento.status ===
        "EM_ATENDIMENTO"
    ).length;


  function limparFiltroHoje() {
    /*
     * Removemos apenas o filtro da URL.
     * A busca digitada permanece intacta.
     */
    setSearchParams({});
  }


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>
          <h1>
            {filtro === "hoje"
              ? "Banho e Tosa de Hoje"
              : "Banho e Tosa"}
          </h1>

          <p>
            {filtro === "hoje"
              ? "Atendimentos ativos agendados para hoje."
              : "Acompanhe os agendamentos e atendimentos em andamento."}
          </p>
        </div>


        <div className="banho-tosa-header-acoes">

          {filtro === "hoje" && (
            <button
              type="button"
              className="secondary-button"
              onClick={limparFiltroHoje}
            >
              Ver Todos
            </button>
          )}


          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                "/banho-tosa/historico"
              )
            }
          >
            Histórico
          </button>


          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate(
                "/banho-tosa/novo"
              )
            }
          >
            + Novo Agendamento
          </button>

        </div>

      </div>


      {filtro === "hoje" && (
        <div className="banho-tosa-filtro-ativo">
          <div>
            <strong>
              Exibindo somente hoje
            </strong>

            <span>
              Os resultados abaixo estão
              filtrados pela data do
              agendamento.
            </span>
          </div>

          <button
            type="button"
            onClick={limparFiltroHoje}
          >
            ×
          </button>
        </div>
      )}


      <div className="banho-tosa-resumos">

        <div className="banho-tosa-resumo">

          <span>
            Agendados
          </span>

          <strong>
            {carregando
              ? "..."
              : totalAgendados}
          </strong>

        </div>


        <div className="banho-tosa-resumo">

          <span>
            Em atendimento
          </span>

          <strong>
            {carregando
              ? "..."
              : totalEmAtendimento}
          </strong>

        </div>

      </div>


      <div className="banho-tosa-busca">

        <input
          type="text"
          placeholder="Buscar por pet, tutor ou serviço..."
          value={busca}
          onChange={(event) =>
            setBusca(
              event.target.value
            )
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

      ) : atendimentosFiltrados.length === 0 ? (

        <div className="banho-tosa-vazio">

          <h3>
            Nenhum atendimento encontrado
          </h3>

          <p>
            {busca
              ? "Nenhum atendimento corresponde à pesquisa."
              : filtro === "hoje"
                ? "Não existem atendimentos ativos agendados para hoje."
                : "Não existem agendamentos ou atendimentos em andamento."}
          </p>

        </div>

      ) : (

        <div className="banho-tosa-grid">

          {atendimentosFiltrados.map(
            (atendimento) => (

              <div
                className="banho-tosa-card"
                key={atendimento.id}
              >

                <div className="banho-tosa-card-topo">

                  <div>
                    <h3>
                      {atendimento.pet_nome}
                    </h3>

                    <span>
                      Tutor:{" "}
                      {atendimento.tutor_nome}
                    </span>
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


                <div className="banho-tosa-card-info">

                  <div>
                    <span>
                      Serviços
                    </span>

                    <strong>
                      {formatarServicos(
                        atendimento.servicos
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>
                      Agendado para
                    </span>

                    <strong>
                      {formatarDataHora(
                        atendimento.agendado_para
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>
                      Duração estimada
                    </span>

                    <strong>
                      {Number(
                        atendimento
                          .duracao_total_minutos
                      ) > 0
                        ? `${atendimento.duracao_total_minutos} minutos`
                        : "Não informada"}
                    </strong>
                  </div>


                  <div>
                    <span>
                      Valor total
                    </span>

                    <strong>
                      {formatarValor(
                        atendimento.valor_total
                      )}
                    </strong>
                  </div>

                </div>


                {atendimento
                  .observacoes_agendamento && (

                  <div className="banho-tosa-observacao">

                    <span>
                      Observações
                    </span>

                    <p>
                      {
                        atendimento
                          .observacoes_agendamento
                      }
                    </p>

                  </div>

                )}


                <div className="banho-tosa-card-acoes">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      navigate(
                        `/banho-tosa/${atendimento.id}`
                      )
                    }
                  >
                    Ver Atendimento
                  </button>

                </div>

              </div>

            )
          )}

        </div>

      )}

    </div>
  );
}


export default BanhoTosa;