import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Tutores.css";


function Tutores() {
  const navigate = useNavigate();

  const [tutores, setTutores] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");


  async function carregarTutores(termo = "") {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get("/tutores", {
        params: termo
          ? { busca: termo.trim() }
          : {},
      });

      setTutores(resposta.data);
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível carregar os tutores."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarTutores();
  }, []);


  function pesquisar(event) {
    event.preventDefault();

    carregarTutores(busca);
  }


  function limparPesquisa() {
    setBusca("");
    carregarTutores();
  }


  /*
   * Nome e botão Visualizar utilizam a mesma navegação.
   * Isso reduz cliques durante consultas rápidas.
   */
  function abrirTutor(tutorId) {
    navigate(`/tutores/${tutorId}`);
  }


  return (
    <div className="tutores-page">

      <div className="page-header">

        <div>
          <h1>Tutores</h1>

          <p>
            Gerencie os responsáveis pelos pets cadastrados.
          </p>
        </div>


        <button
          className="primary-button"
          onClick={() =>
            navigate("/tutores/novo")
          }
        >
          + Novo Tutor
        </button>

      </div>


      <div className="content-card">

        <form
          className="search-area"
          onSubmit={pesquisar}
        >

          <input
            type="text"
            placeholder="Buscar por nome, CPF, telefone ou e-mail..."
            value={busca}
            onChange={(event) =>
              setBusca(event.target.value)
            }
          />


          <button type="submit">
            Buscar
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


        {erro && (
          <div className="page-error">
            {erro}
          </div>
        )}


        {carregando ? (

          <div className="table-message">
            Carregando tutores...
          </div>

        ) : tutores.length === 0 ? (

          <div className="table-message">
            Nenhum tutor encontrado.
          </div>

        ) : (

          <div className="table-responsive">

            <table className="data-table">

              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>


              <tbody>

                {tutores.map((tutor) => (

                  <tr key={tutor.id}>

                    <td>
                      <button
                        type="button"
                        className="tutor-name-button"
                        onClick={() =>
                          abrirTutor(tutor.id)
                        }
                        title={`Abrir ficha de ${tutor.nome}`}
                      >
                        {tutor.nome}
                      </button>
                    </td>


                    <td>
                      {tutor.cpf || "-"}
                    </td>


                    <td>
                      {tutor.telefone}
                    </td>


                    <td>
                      {tutor.email || "-"}
                    </td>


                    <td>
                      {tutor.cidade || "-"}
                    </td>


                    <td>
                      <span
                        className={
                          tutor.ativo
                            ? "status status-active"
                            : "status status-inactive"
                        }
                      >
                        {tutor.ativo
                          ? "Ativo"
                          : "Inativo"}
                      </span>
                    </td>


                    <td>
                      <button
                        className="action-button"
                        onClick={() =>
                          abrirTutor(tutor.id)
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

        )}

      </div>

    </div>
  );
}


export default Tutores;