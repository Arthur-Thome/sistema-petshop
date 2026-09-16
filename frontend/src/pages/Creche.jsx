import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Creche.css";


function Creche() {
  const navigate = useNavigate();

  const [registros, setRegistros] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * Carrega somente as permanências abertas.
   *
   * O histórico completo será exibido em uma
   * tela separada para manter a operação diária
   * da Creche simples.
   */
  async function carregarPetsNaCreche() {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get("/creche/ativos");

      setRegistros(
        resposta.data.registros || []
      );
    } catch (error) {
      console.error(
        "Erro ao carregar pets da creche:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar a Creche."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarPetsNaCreche();
  }, []);


  /*
   * A busca é feita localmente porque esta tela
   * contém somente os pets atualmente presentes.
   */
  const registrosFiltrados =
    registros.filter((registro) => {
      const termo =
        busca.trim().toLowerCase();

      if (!termo) {
        return true;
      }

      return (
        registro.pet_nome
          ?.toLowerCase()
          .includes(termo) ||

        registro.tutor_nome
          ?.toLowerCase()
          .includes(termo)
      );
    });


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }


  return (
    <div className="creche-page">

      <div className="creche-header">
        <div>
          <h1>Creche</h1>

          <p>
            Controle de entrada e saída dos pets.
          </p>
        </div>

        <div className="creche-header-acoes">

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate("/creche/historico")
            }
          >
            Histórico
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              navigate("/creche/entrada")
            }
          >
            + Registrar Entrada
          </button>

        </div>
      </div>


      <div className="creche-resumo">
        <span>Pets na creche agora</span>

        <strong>
          {carregando
            ? "..."
            : registros.length}
        </strong>
      </div>


      <div className="creche-busca">
        <input
          type="text"
          placeholder="Buscar por pet ou tutor..."
          value={busca}
          onChange={(event) =>
            setBusca(event.target.value)
          }
        />
      </div>


      {erro && (
        <div className="creche-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="creche-mensagem">
          Carregando...
        </div>

      ) : registrosFiltrados.length === 0 ? (

        <div className="creche-vazia">
          <h3>
            Nenhum pet encontrado
          </h3>

          <p>
            {busca
              ? "Nenhum pet corresponde à pesquisa."
              : "Não há pets na creche neste momento."}
          </p>
        </div>

      ) : (

        <div className="creche-grid">

          {registrosFiltrados.map(
            (registro) => (

              <div
                className="creche-card"
                key={registro.id}
              >

                <div className="creche-card-topo">

                  <div>
                    <h3>
                      {registro.pet_nome}
                    </h3>

                    <span>
                      {registro.especie}

                      {registro.raca
                        ? ` • ${registro.raca}`
                        : ""}
                    </span>
                  </div>

                  <span className="creche-status">
                    Na creche
                  </span>

                </div>


                <div className="creche-card-info">

                  <div>
                    <span>Tutor</span>

                    <strong>
                      {registro.tutor_nome}
                    </strong>
                  </div>


                  <div>
                    <span>Telefone</span>

                    <strong>
                      {registro.tutor_telefone ||
                        "-"}
                    </strong>
                  </div>


                  <div>
                    <span>Entrada</span>

                    <strong>
                      {formatarDataHora(
                        registro.entrada_em
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>
                      Registrado por
                    </span>

                    <strong>
                      {registro.usuario_entrada_nome}
                    </strong>
                  </div>

                </div>


                {registro.observacoes_entrada && (
                  <div className="creche-observacao">
                    <span>
                      Observações
                    </span>

                    <p>
                      {
                        registro.observacoes_entrada
                      }
                    </p>
                  </div>
                )}


                <div className="creche-card-acoes">

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      navigate(
                        `/pets/${registro.pet_id}`
                      )
                    }
                  >
                    Ver Pet
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      navigate(
                        `/creche/${registro.id}/saida`
                      )
                    }
                  >
                    Registrar Saída
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


export default Creche;