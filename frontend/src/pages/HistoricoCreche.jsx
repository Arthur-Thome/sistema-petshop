import {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/HistoricoCreche.css";


function HistoricoCreche() {
  const navigate = useNavigate();

  const [registros, setRegistros] =
    useState([]);

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  async function carregarHistorico(
    termo = ""
  ) {
    try {
      setCarregando(true);
      setErro("");

      const resposta =
        await api.get(
          "/creche/historico",
          {
            params: {
              busca: termo,
            },
          }
        );

      setRegistros(
        resposta.data.registros || []
      );
    } catch (error) {
      console.error(
        "Erro ao carregar histórico:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível carregar o histórico."
      );
    } finally {
      setCarregando(false);
    }
  }


  useEffect(() => {
    carregarHistorico();
  }, []);


  function pesquisar(event) {
    event.preventDefault();

    carregarHistorico(
      busca.trim()
    );
  }


  function limparPesquisa() {
    setBusca("");
    carregarHistorico("");
  }


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }


  return (
    <div className="historico-creche-page">

      <div className="historico-creche-header">

        <div>
          <h1>
            Histórico da Creche
          </h1>

          <p>
            Consulte entradas e saídas
            registradas.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/creche")
          }
        >
          Voltar para Creche
        </button>

      </div>


      <form
        className="historico-creche-busca"
        onSubmit={pesquisar}
      >

        <input
          type="text"
          value={busca}
          onChange={(event) =>
            setBusca(event.target.value)
          }
          placeholder="Buscar por pet ou tutor..."
        />

        <button
          type="submit"
          className="primary-button"
        >
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


      {erro && (
        <div className="historico-creche-erro">
          {erro}
        </div>
      )}


      {carregando ? (

        <div className="historico-creche-vazio">
          Carregando...
        </div>

      ) : registros.length === 0 ? (

        <div className="historico-creche-vazio">
          Nenhum registro encontrado.
        </div>

      ) : (

        <div className="historico-creche-tabela-container">

          <table className="historico-creche-tabela">

            <thead>
              <tr>
                <th>Pet</th>
                <th>Tutor</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Status</th>
                <th>Entrada por</th>
                <th>Saída por</th>
              </tr>
            </thead>

            <tbody>

              {registros.map(
                (registro) => (

                  <tr key={registro.id}>

                    <td>
                      <strong>
                        {registro.pet_nome}
                      </strong>

                      {registro.raca && (
                        <small>
                          {registro.raca}
                        </small>
                      )}
                    </td>

                    <td>
                      {registro.tutor_nome}
                    </td>

                    <td>
                      {formatarDataHora(
                        registro.entrada_em
                      )}
                    </td>

                    <td>
                      {formatarDataHora(
                        registro.saida_em
                      )}
                    </td>

                    <td>
                      <span
                        className={
                          registro.status ===
                          "NA_CRECHE"
                            ? "historico-status ativo"
                            : "historico-status finalizado"
                        }
                      >
                        {registro.status ===
                        "NA_CRECHE"
                          ? "Na creche"
                          : "Finalizado"}
                      </span>
                    </td>

                    <td>
                      {
                        registro.usuario_entrada_nome
                      }
                    </td>

                    <td>
                      {
                        registro.usuario_saida_nome ||
                        "-"
                      }
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>

      )}

    </div>
  );
}


export default HistoricoCreche;