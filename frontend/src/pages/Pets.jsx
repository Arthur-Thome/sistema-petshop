import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Pets.css";


function Pets() {
  const navigate = useNavigate();

  const [pets, setPets] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");


  // Carrega os pets cadastrados.
  // A mesma função também é utilizada para realizar pesquisas.
  async function carregarPets(termoBusca = "") {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get("/pets", {
        params: termoBusca
          ? { busca: termoBusca }
          : {},
      });

      setPets(resposta.data);
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar os pets."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarPets();
  }, []);


  function pesquisar(event) {
    event.preventDefault();

    carregarPets(busca.trim());
  }


  function limparPesquisa() {
    setBusca("");
    carregarPets();
  }


  return (
    <div className="pets-page">
      <div className="page-header">
        <div>
          <h1>Pets</h1>
          <p>
            Consulte e gerencie os animais cadastrados.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("/pets/novo")}
        >
          + Novo Pet
        </button>
      </div>


      <div className="pets-search-card">
        <form
          className="pets-search-form"
          onSubmit={pesquisar}
        >
          <input
            type="text"
            value={busca}
            onChange={(event) =>
              setBusca(event.target.value)
            }
            placeholder="Buscar por pet, raça, espécie ou tutor..."
          />

          <button type="submit">
            Pesquisar
          </button>

          {busca && (
            <button
              type="button"
              className="secondary-button"
              onClick={limparPesquisa}
            >
              Limpar
            </button>
          )}
        </form>
      </div>


      {erro && (
        <div className="pets-message error">
          {erro}
        </div>
      )}


      {carregando ? (
        <div className="pets-message">
          Carregando pets...
        </div>
      ) : pets.length === 0 ? (
        <div className="pets-empty">
          <h3>Nenhum pet encontrado</h3>

          <p>
            Cadastre um novo pet ou altere os termos
            utilizados na pesquisa.
          </p>
        </div>
      ) : (
        <div className="pets-table-card">
          <div className="pets-table-wrapper">
            <table className="pets-table">
              <thead>
                <tr>
                  <th>Pet</th>
                  <th>Espécie</th>
                  <th>Raça</th>
                  <th>Tutor</th>
                  <th>Sexo</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {pets.map((pet) => (
                  <tr key={pet.id}>
                    <td>
                      <div className="pet-name-cell">
                        <FotoPet pet={pet} />

                        <strong>{pet.nome}</strong>
                      </div>
                    </td>

                    <td>
                      {formatarEspecie(pet.especie)}
                    </td>

                    <td>
                      {pet.raca || "-"}
                    </td>

                    <td>
                      {pet.tutor_nome}
                    </td>

                    <td>
                      {formatarSexo(pet.sexo)}
                    </td>

                    <td>
                      <span
                        className={
                          pet.ativo
                            ? "status-badge active"
                            : "status-badge inactive"
                        }
                      >
                        {pet.ativo
                          ? "Ativo"
                          : "Inativo"}
                      </span>
                    </td>

                    <td>
                      <button
                        className="table-action-button"
                        onClick={() =>
                          navigate(`/pets/${pet.id}`)
                        }
                      >
                        Visualizar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// Exibe a foto cadastrada ou uma identificação visual
// simples quando o pet ainda não possui imagem.
function FotoPet({ pet }) {
  if (!pet.foto) {
    return (
      <div className="pet-avatar-placeholder">
        {pet.nome?.charAt(0)?.toUpperCase() || "P"}
      </div>
    );
  }

  // A API guarda somente o caminho relativo da imagem.
  // Removemos /api da URL configurada para chegar ao servidor.
  const apiUrl =
    import.meta.env.VITE_API_URL ||
    "http://localhost:3001/api";

  const servidorUrl =
    apiUrl.replace(/\/api\/?$/, "");

  return (
    <img
      className="pet-avatar"
      src={`${servidorUrl}${pet.foto}`}
      alt={`Foto de ${pet.nome}`}
    />
  );
}


function formatarSexo(sexo) {
  if (sexo === "macho") {
    return "Macho";
  }

  if (sexo === "femea") {
    return "Fêmea";
  }

  return "-";
}


function formatarEspecie(especie) {
  if (!especie) {
    return "-";
  }

  return (
    especie.charAt(0).toUpperCase() +
    especie.slice(1)
  );
}


export default Pets;