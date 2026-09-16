import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/EntradaCreche.css";


function EntradaCreche() {
  const navigate = useNavigate();

  const [pets, setPets] = useState([]);
  const [petsNaCreche, setPetsNaCreche] =
    useState([]);

  const [busca, setBusca] = useState("");
  const [petSelecionado, setPetSelecionado] =
    useState(null);

  const [observacoes, setObservacoes] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  /*
   * Carregamos os pets cadastrados e também quem já
   * está na Creche. Assim conseguimos impedir uma
   * seleção inválida antes mesmo do envio ao backend.
   *
   * O backend e o PostgreSQL continuam sendo as
   * proteções definitivas contra duplicidade.
   */
  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true);
        setErro("");

        const [
          respostaPets,
          respostaCreche,
        ] = await Promise.all([
          api.get("/pets"),
          api.get("/creche/ativos"),
        ]);

        setPets(
          respostaPets.data.pets ||
          respostaPets.data.registros ||
          respostaPets.data ||
          []
        );

        setPetsNaCreche(
          respostaCreche.data.registros || []
        );
      } catch (error) {
        console.error(
          "Erro ao carregar dados para entrada:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar os pets."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarDados();
  }, []);


  const idsNaCreche =
    new Set(
      petsNaCreche.map(
        (registro) =>
          Number(registro.pet_id)
      )
    );


  /*
   * Exibimos somente pets ativos.
   *
   * A busca aceita nome do pet, tutor e raça
   * para facilitar a identificação.
   */
  const petsFiltrados =
    pets.filter((pet) => {
      if (!pet.ativo) {
        return false;
      }

      const termo =
        busca.trim().toLowerCase();

      if (!termo) {
        return true;
      }

      return (
        pet.nome
          ?.toLowerCase()
          .includes(termo) ||

        pet.tutor_nome
          ?.toLowerCase()
          .includes(termo) ||

        pet.raca
          ?.toLowerCase()
          .includes(termo)
      );
    });


  function selecionarPet(pet) {
    if (idsNaCreche.has(Number(pet.id))) {
      return;
    }

    setPetSelecionado(pet);
    setErro("");
  }


  async function registrarEntrada(event) {
    event.preventDefault();

    if (!petSelecionado) {
      setErro(
        "Selecione o pet que está entrando na creche."
      );

      return;
    }

    if (
      idsNaCreche.has(
        Number(petSelecionado.id)
      )
    ) {
      setErro(
        "Este pet já está na creche."
      );

      return;
    }

    try {
      setSalvando(true);
      setErro("");

      await api.post(
        "/creche/entrada",
        {
          pet_id: petSelecionado.id,
          observacoes:
            observacoes.trim() || null,
        }
      );

      /*
       * Após a entrada retornamos para a tela
       * operacional, que carregará a lista atualizada.
       */
      navigate("/creche");
    } catch (error) {
      console.error(
        "Erro ao registrar entrada:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível registrar a entrada."
      );
    } finally {
      setSalvando(false);
    }
  }


  return (
    <div className="entrada-creche-page">

      <div className="entrada-creche-header">

        <div>
          <h1>
            Registrar Entrada
          </h1>

          <p>
            Selecione o pet que está entrando
            na creche.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/creche")
          }
        >
          Voltar
        </button>

      </div>


      {erro && (
        <div className="entrada-creche-erro">
          {erro}
        </div>
      )}


      <form
        onSubmit={registrarEntrada}
        className="entrada-creche-form"
      >

        <div className="entrada-creche-bloco">

          <h2>Selecionar Pet</h2>

          <div className="entrada-creche-busca">
            <input
              type="text"
              placeholder="Buscar por pet, tutor ou raça..."
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
            />
          </div>


          {carregando ? (

            <p>Carregando pets...</p>

          ) : petsFiltrados.length === 0 ? (

            <div className="entrada-creche-vazio">
              Nenhum pet encontrado.
            </div>

          ) : (

            <div className="entrada-pets-lista">

              {petsFiltrados.map(
                (pet) => {
                  const jaEstaNaCreche =
                    idsNaCreche.has(
                      Number(pet.id)
                    );

                  const selecionado =
                    petSelecionado?.id ===
                    pet.id;

                  return (
                    <button
                      type="button"
                      key={pet.id}
                      disabled={
                        jaEstaNaCreche
                      }
                      className={
                        [
                          "entrada-pet-card",

                          selecionado
                            ? "selecionado"
                            : "",

                          jaEstaNaCreche
                            ? "indisponivel"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      onClick={() =>
                        selecionarPet(pet)
                      }
                    >

                      <div>
                        <strong>
                          {pet.nome}
                        </strong>

                        <span>
                          {pet.especie}

                          {pet.raca
                            ? ` • ${pet.raca}`
                            : ""}
                        </span>
                      </div>


                      <div className="entrada-pet-tutor">
                        <span>
                          Tutor
                        </span>

                        <strong>
                          {pet.tutor_nome ||
                            "Não informado"}
                        </strong>
                      </div>


                      {jaEstaNaCreche && (
                        <span className="entrada-pet-status">
                          Já está na creche
                        </span>
                      )}

                    </button>
                  );
                }
              )}

            </div>

          )}

        </div>


        {petSelecionado && (

          <div className="entrada-creche-bloco">

            <h2>
              Entrada de {petSelecionado.nome}
            </h2>

            <div className="entrada-pet-selecionado">

              <div>
                <span>Pet</span>

                <strong>
                  {petSelecionado.nome}
                </strong>
              </div>

              <div>
                <span>Tutor</span>

                <strong>
                  {petSelecionado.tutor_nome ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>Raça</span>

                <strong>
                  {petSelecionado.raca ||
                    "-"}
                </strong>
              </div>

            </div>


            <label className="entrada-observacoes">

              <span>
                Observações de entrada
              </span>

              <textarea
                rows="5"
                value={observacoes}
                onChange={(event) =>
                  setObservacoes(
                    event.target.value
                  )
                }
                placeholder="Informações importantes para a permanência do pet..."
              />

            </label>


            <div className="entrada-creche-acoes">

              <button
                type="button"
                className="secondary-button"
                disabled={salvando}
                onClick={() =>
                  setPetSelecionado(null)
                }
              >
                Trocar Pet
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={salvando}
              >
                {salvando
                  ? "Registrando..."
                  : "Confirmar Entrada"}
              </button>

            </div>

          </div>

        )}

      </form>

    </div>
  );
}


export default EntradaCreche;