import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/BanhoTosa.css";


function NovoAgendamentoBanhoTosa() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();


  /*
   * Quando o atendimento é iniciado pela ficha de um Pet,
   * recebemos /atendimentos/novo?pet=123.
   *
   * O ID é validado contra a lista carregada da API antes
   * de ser utilizado no formulário.
   */
  const petOrigemId =
    searchParams.get("pet");


  const [pets, setPets] =
    useState([]);

  const [servicos, setServicos] =
    useState([]);


  const [formData, setFormData] =
    useState({
      pet_id: "",
      servicos: [],
      agendado_para: "",
      observacoes_agendamento: "",
    });


  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega pets e serviços ativos.
   *
   * Se um Pet foi informado pela URL, ele somente será
   * pré-selecionado se realmente existir e estiver ativo.
   */
  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true);
        setErro("");


        const [
          respostaPets,
          respostaServicos,
        ] = await Promise.all([
          api.get("/pets"),
          api.get("/servicos"),
        ]);


        const listaPets =
          Array.isArray(
            respostaPets.data
          )
            ? respostaPets.data
            : respostaPets.data.pets ||
              [];


        const listaServicos =
          Array.isArray(
            respostaServicos.data
          )
            ? respostaServicos.data
            : respostaServicos.data
                .servicos || [];


        const petsAtivos =
          listaPets.filter(
            (pet) => pet.ativo
          );


        const servicosAtivos =
          listaServicos.filter(
            (servico) =>
              servico.ativo
          );


        setPets(petsAtivos);

        setServicos(
          servicosAtivos
        );


        /*
         * Nunca confiamos apenas no parâmetro da URL.
         *
         * O Pet precisa existir na lista ativa devolvida
         * pelo backend para ser selecionado.
         */
        if (petOrigemId) {
          const petOrigem =
            petsAtivos.find(
              (pet) =>
                Number(pet.id) ===
                Number(petOrigemId)
            );


          if (petOrigem) {
            setFormData(
              (dadosAnteriores) => ({
                ...dadosAnteriores,

                pet_id:
                  String(
                    petOrigem.id
                  ),
              })
            );

          } else {
            setErro(
              "O pet informado não foi encontrado ou está inativo."
            );
          }
        }

      } catch (error) {
        console.error(
          "Erro ao carregar dados do agendamento:",
          error
        );


        setErro(
          error.response?.data
            ?.mensagem ||
            "Não foi possível carregar os dados do agendamento."
        );

      } finally {
        setCarregando(false);
      }
    }


    carregarDados();

  }, [petOrigemId]);


  /*
   * Se o atendimento começou pela ficha de um Pet,
   * Voltar e Cancelar retornam para essa ficha.
   *
   * No fluxo normal retornamos para Atendimentos.
   */
  function voltar() {
    const petOrigem =
      pets.find(
        (pet) =>
          Number(pet.id) ===
          Number(petOrigemId)
      );


    if (
      petOrigemId &&
      petOrigem
    ) {
      navigate(
        `/pets/${petOrigem.id}`
      );

      return;
    }


    navigate("/atendimentos");
  }


  function alterarCampo(event) {
    const {
      name,
      value,
    } = event.target;


    setFormData(
      (dadosAnteriores) => ({
        ...dadosAnteriores,
        [name]: value,
      })
    );
  }


  /*
   * Adiciona ou remove um serviço da seleção.
   *
   * Guardamos somente IDs. O backend continua responsável
   * pela validação e pelos preços oficiais.
   */
  function alterarServico(
    servicoId
  ) {
    setFormData(
      (dadosAnteriores) => {

        const selecionado =
          dadosAnteriores
            .servicos
            .includes(
              servicoId
            );


        const novosServicos =
          selecionado
            ? dadosAnteriores
                .servicos
                .filter(
                  (id) =>
                    id !== servicoId
                )
            : [
                ...dadosAnteriores
                  .servicos,

                servicoId,
              ];


        return {
          ...dadosAnteriores,

          servicos:
            novosServicos,
        };
      }
    );
  }


  const servicosSelecionados =
    useMemo(() => {
      return servicos.filter(
        (servico) =>
          formData
            .servicos
            .includes(
              servico.id
            )
      );
    }, [
      servicos,
      formData.servicos,
    ]);


  /*
   * Os totais abaixo são somente uma prévia visual.
   * O backend continua calculando os valores oficiais.
   */
  const valorTotal =
    useMemo(() => {
      return servicosSelecionados
        .reduce(
          (total, servico) =>
            total +
            Number(
              servico.valor || 0
            ),
          0
        );
    }, [
      servicosSelecionados,
    ]);


  const duracaoTotal =
    useMemo(() => {
      return servicosSelecionados
        .reduce(
          (total, servico) =>
            total +
            Number(
              servico
                .duracao_minutos ||
                0
            ),
          0
        );
    }, [
      servicosSelecionados,
    ]);


  const petSelecionado =
    useMemo(() => {
      return pets.find(
        (pet) =>
          Number(pet.id) ===
          Number(formData.pet_id)
      );
    }, [
      pets,
      formData.pet_id,
    ]);


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


  async function salvar(event) {
    event.preventDefault();


    if (!formData.pet_id) {
      setErro(
        "Selecione um pet."
      );

      return;
    }


    if (
      formData.servicos.length ===
      0
    ) {
      setErro(
        "Selecione pelo menos um serviço."
      );

      return;
    }


    if (
      !formData.agendado_para
    ) {
      setErro(
        "Informe a data e o horário do agendamento."
      );

      return;
    }


    try {
      setSalvando(true);

      setErro("");


      const resposta =
        await api.post(
          "/atendimentos/agendamentos",
          {
            pet_id:
              Number(
                formData.pet_id
              ),

            servicos:
              formData.servicos,

            agendado_para:
              formData
                .agendado_para,

            observacoes_agendamento:
              formData
                .observacoes_agendamento,
          }
        );


      const atendimento =
        resposta.data.atendimento;


      navigate(
        `/atendimentos/${atendimento.id}`
      );

    } catch (error) {
      console.error(
        "Erro ao criar agendamento:",
        error
      );


      setErro(
        error.response?.data
          ?.mensagem ||
          "Não foi possível criar o agendamento."
      );

    } finally {
      setSalvando(false);
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


  return (
    <div className="banho-tosa-page">

      <div className="banho-tosa-header">

        <div>

          <h1>
            Novo Agendamento
          </h1>


          <p>
            {petSelecionado &&
            petOrigemId
              ? `Novo atendimento para ${petSelecionado.nome}.`
              : "Selecione o pet e os serviços que serão realizados."}
          </p>

        </div>


        <div className="banho-tosa-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={voltar}
            disabled={salvando}
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


      <div className="banho-tosa-form-card">

        <form onSubmit={salvar}>

          <div className="banho-tosa-form-campo">

            <label htmlFor="pet_id">
              Pet *
            </label>


            <select
              id="pet_id"
              name="pet_id"
              value={
                formData.pet_id
              }
              onChange={
                alterarCampo
              }
              required
            >

              <option value="">
                Selecione um pet
              </option>


              {pets.map((pet) => (

                <option
                  key={pet.id}
                  value={pet.id}
                >
                  {pet.nome}

                  {pet.tutor_nome
                    ? ` — ${pet.tutor_nome}`
                    : ""}
                </option>

              ))}

            </select>

          </div>


          {petSelecionado &&
            petOrigemId && (

            <div className="banho-tosa-mensagem">
              Pet selecionado pela ficha:{" "}
              <strong>
                {petSelecionado.nome}
              </strong>
            </div>

          )}


          <div className="banho-tosa-form-campo">

            <label>
              Serviços *
            </label>


            {servicos.length ===
            0 ? (

              <div className="banho-tosa-sem-servicos">

                <p>
                  Nenhum serviço ativo cadastrado.
                </p>


                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigate(
                      "/atendimentos/servicos"
                    )
                  }
                >
                  Cadastrar Serviço
                </button>

              </div>

            ) : (

              <div className="banho-tosa-servicos-lista">

                {servicos.map(
                  (servico) => {

                    const selecionado =
                      formData
                        .servicos
                        .includes(
                          servico.id
                        );


                    return (
                      <label
                        className={
                          selecionado
                            ? "banho-tosa-servico-item selecionado"
                            : "banho-tosa-servico-item"
                        }
                        key={
                          servico.id
                        }
                      >

                        <input
                          type="checkbox"
                          checked={
                            selecionado
                          }
                          onChange={() =>
                            alterarServico(
                              servico.id
                            )
                          }
                        />


                        <div className="banho-tosa-servico-conteudo">

                          <div className="banho-tosa-servico-topo">

                            <strong>
                              {
                                servico.nome
                              }
                            </strong>


                            <strong>
                              {formatarValor(
                                servico.valor
                              )}
                            </strong>

                          </div>


                          {servico.descricao && (

                            <p>
                              {
                                servico.descricao
                              }
                            </p>

                          )}


                          <span>
                            {servico.duracao_minutos
                              ? `Duração aproximada: ${servico.duracao_minutos} minutos`
                              : "Duração não informada"}
                          </span>

                        </div>

                      </label>
                    );
                  }
                )}

              </div>

            )}

          </div>


          {servicosSelecionados
            .length > 0 && (

            <div className="banho-tosa-resumo-agendamento">

              <h3>
                Resumo do atendimento
              </h3>


              <div className="banho-tosa-resumo-servicos">

                {servicosSelecionados.map(
                  (servico) => (

                    <div
                      key={
                        servico.id
                      }
                      className="banho-tosa-resumo-linha"
                    >

                      <span>
                        {servico.nome}
                      </span>


                      <strong>
                        {formatarValor(
                          servico.valor
                        )}
                      </strong>

                    </div>

                  )
                )}

              </div>


              <div className="banho-tosa-resumo-duracao">

                <span>
                  Duração estimada
                </span>


                <strong>
                  {duracaoTotal > 0
                    ? `${duracaoTotal} minutos`
                    : "-"}
                </strong>

              </div>


              <div className="banho-tosa-resumo-total">

                <span>
                  Total
                </span>


                <strong>
                  {formatarValor(
                    valorTotal
                  )}
                </strong>

              </div>

            </div>

          )}


          <div className="banho-tosa-form-campo">

            <label htmlFor="agendado_para">
              Data e horário *
            </label>


            <input
              id="agendado_para"
              name="agendado_para"
              type="datetime-local"
              value={
                formData
                  .agendado_para
              }
              onChange={
                alterarCampo
              }
              required
            />

          </div>


          <div className="banho-tosa-form-campo">

            <label htmlFor="observacoes_agendamento">
              Observações
            </label>


            <textarea
              id="observacoes_agendamento"
              name="observacoes_agendamento"
              value={
                formData
                  .observacoes_agendamento
              }
              onChange={
                alterarCampo
              }
              rows="5"
              placeholder="Informações importantes para o atendimento..."
            />

          </div>


          <div className="banho-tosa-form-acoes">

            <button
              type="button"
              className="secondary-button"
              onClick={voltar}
              disabled={salvando}
            >
              Cancelar
            </button>


            <button
              type="submit"
              className="primary-button"
              disabled={
                salvando ||
                servicos.length === 0
              }
            >
              {salvando
                ? "Agendando..."
                : "Confirmar Agendamento"}
            </button>

          </div>

        </form>

      </div>

    </div>
  );
}


export default NovoAgendamentoBanhoTosa;