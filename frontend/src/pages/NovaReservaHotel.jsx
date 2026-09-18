import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "../styles/NovaReservaHotel.css";

function NovaReservaHotel() {
  const navigate = useNavigate();

  const [pets, setPets] = useState([]);
  const [busca, setBusca] = useState("");
  const [petSelecionado, setPetSelecionado] =
    useState(null);

  const [entradaPrevista, setEntradaPrevista] =
    useState("");
  const [saidaPrevista, setSaidaPrevista] =
    useState("");
  const [observacoes, setObservacoes] =
    useState("");

  const [carregandoPets, setCarregandoPets] =
    useState(true);
  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] = useState("");

  /*
   * Carregamos os pets cadastrados para permitir
   * a seleção sem que o funcionário precise conhecer
   * ou digitar manualmente o ID do animal.
   */
  useEffect(() => {
    async function carregarPets() {
      try {
        setCarregandoPets(true);
        setErro("");

        const resposta =
          await api.get("/pets");

        /*
         * A API de pets pode retornar diretamente um
         * array ou uma propriedade "pets", dependendo
         * da estrutura já utilizada no projeto.
         */
        const dados = Array.isArray(
          resposta.data
        )
          ? resposta.data
          : resposta.data.pets ||
            resposta.data.registros ||
            [];

        /*
         * Pets inativos não devem receber novas
         * reservas de Hotel.
         */
        setPets(
          dados.filter(
            (pet) => pet.ativo !== false
          )
        );
      } catch (error) {
        console.error(
          "Erro ao carregar pets:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
            "Não foi possível carregar os pets."
        );
      } finally {
        setCarregandoPets(false);
      }
    }

    carregarPets();
  }, []);

  const petsFiltrados = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase();

    if (!termo) {
      return pets;
    }

    return pets.filter((pet) => {
      const nome =
        pet.nome?.toLowerCase() || "";

      const tutor =
        (
          pet.tutor_nome ||
          pet.nome_tutor ||
          ""
        ).toLowerCase();

      return (
        nome.includes(termo) ||
        tutor.includes(termo)
      );
    });
  }, [pets, busca]);

  /*
   * O navegador trabalha melhor com datetime-local
   * utilizando o formato YYYY-MM-DDTHH:mm.
   */
  function obterDataHoraMinima() {
    const agora = new Date();

    agora.setSeconds(0, 0);

    /*
     * Ajustamos o fuso antes de gerar a string porque
     * toISOString utiliza UTC.
     */
    const deslocamento =
      agora.getTimezoneOffset() * 60000;

    return new Date(
      agora.getTime() - deslocamento
    )
      .toISOString()
      .slice(0, 16);
  }

  const dataHoraMinima =
    obterDataHoraMinima();

  async function salvarReserva(event) {
    event.preventDefault();

    setErro("");

    if (!petSelecionado) {
      setErro(
        "Selecione o pet da reserva."
      );
      return;
    }

    if (
      !entradaPrevista ||
      !saidaPrevista
    ) {
      setErro(
        "Informe a entrada e a saída previstas."
      );
      return;
    }

    const entrada =
      new Date(entradaPrevista);

    const saida =
      new Date(saidaPrevista);

    if (saida <= entrada) {
      setErro(
        "A saída prevista deve ser posterior à entrada prevista."
      );
      return;
    }

    try {
      setSalvando(true);

      await api.post(
        "/hotel/reservas",
        {
          pet_id: petSelecionado.id,
          entrada_prevista:
            entradaPrevista,
          saida_prevista:
            saidaPrevista,
          observacoes:
            observacoes.trim() ||
            null,
        }
      );

      /*
       * Após salvar voltamos para a tela principal,
       * que recarregará as reservas ativas.
       */
      navigate("/hotel");
    } catch (error) {
      console.error(
        "Erro ao criar reserva:",
        error
      );

      /*
       * Aqui também aparecerá a mensagem de conflito
       * de período enviada pelo próprio backend.
       */
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível criar a reserva."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="nova-reserva-hotel">
      <div className="nova-reserva-cabecalho">
        <div>
          <h1>Nova Reserva</h1>

          <p>
            Cadastre uma nova hospedagem
            para o pet.
          </p>
        </div>

        <button
          type="button"
          className="botao-secundario"
          onClick={() =>
            navigate("/hotel")
          }
        >
          Voltar
        </button>
      </div>

      {erro && (
        <div className="nova-reserva-erro">
          {erro}
        </div>
      )}

      <form
        className="nova-reserva-formulario"
        onSubmit={salvarReserva}
      >
        <section className="nova-reserva-secao">
          <h2>1. Selecione o pet</h2>

          <input
            className="nova-reserva-busca"
            type="text"
            placeholder="Buscar pet ou tutor..."
            value={busca}
            onChange={(event) =>
              setBusca(
                event.target.value
              )
            }
          />

          {carregandoPets ? (
            <p>Carregando pets...</p>
          ) : petsFiltrados.length === 0 ? (
            <div className="nova-reserva-vazio">
              Nenhum pet encontrado.
            </div>
          ) : (
            <div className="nova-reserva-pets">
              {petsFiltrados.map(
                (pet) => {
                  const selecionado =
                    petSelecionado?.id ===
                    pet.id;

                  return (
                    <button
                      key={pet.id}
                      type="button"
                      className={
                        selecionado
                          ? "nova-reserva-pet selecionado"
                          : "nova-reserva-pet"
                      }
                      onClick={() =>
                        setPetSelecionado(
                          pet
                        )
                      }
                    >
                      <strong>
                        {pet.nome}
                      </strong>

                      <span>
                        {pet.especie ||
                          "Espécie não informada"}
                        {pet.raca
                          ? ` • ${pet.raca}`
                          : ""}
                      </span>

                      {(pet.tutor_nome ||
                        pet.nome_tutor) && (
                        <span>
                          Tutor:{" "}
                          {pet.tutor_nome ||
                            pet.nome_tutor}
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          )}

          {petSelecionado && (
            <div className="nova-reserva-selecionado">
              Pet selecionado:{" "}
              <strong>
                {petSelecionado.nome}
              </strong>
            </div>
          )}
        </section>

        <section className="nova-reserva-secao">
          <h2>2. Período da hospedagem</h2>

          <div className="nova-reserva-campos">
            <div className="nova-reserva-campo">
              <label htmlFor="entrada">
                Entrada prevista
              </label>

              <input
                id="entrada"
                type="datetime-local"
                value={entradaPrevista}
                min={dataHoraMinima}
                onChange={(event) => {
                  const valor =
                    event.target.value;

                  setEntradaPrevista(
                    valor
                  );

                  /*
                   * Se a entrada ultrapassar a saída
                   * anteriormente escolhida, limpamos
                   * a saída para evitar um período
                   * visualmente inconsistente.
                   */
                  if (
                    saidaPrevista &&
                    new Date(
                      saidaPrevista
                    ) <=
                      new Date(valor)
                  ) {
                    setSaidaPrevista("");
                  }
                }}
                required
              />
            </div>

            <div className="nova-reserva-campo">
              <label htmlFor="saida">
                Saída prevista
              </label>

              <input
                id="saida"
                type="datetime-local"
                value={saidaPrevista}
                min={
                  entradaPrevista ||
                  dataHoraMinima
                }
                onChange={(event) =>
                  setSaidaPrevista(
                    event.target.value
                  )
                }
                required
              />
            </div>
          </div>
        </section>

        <section className="nova-reserva-secao">
          <h2>3. Observações</h2>

          <textarea
            rows="5"
            placeholder="Informações importantes para a hospedagem..."
            value={observacoes}
            onChange={(event) =>
              setObservacoes(
                event.target.value
              )
            }
          />
        </section>

        <div className="nova-reserva-acoes">
          <button
            type="button"
            className="botao-secundario"
            onClick={() =>
              navigate("/hotel")
            }
            disabled={salvando}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="botao-principal"
            disabled={salvando}
          >
            {salvando
              ? "Salvando..."
              : "Criar Reserva"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NovaReservaHotel;