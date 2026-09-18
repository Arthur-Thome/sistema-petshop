import {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import api from "../services/api";
import "../styles/HistoricoHotel.css";

function HistoricoHotel() {
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
   * Diferentemente da tela principal, o histórico
   * pesquisa no backend. Isso permite que essa tela
   * continue funcionando bem conforme a quantidade
   * de hospedagens aumentar.
   */
  async function carregarHistorico(
    termo = ""
  ) {
    try {
      setCarregando(true);
      setErro("");

      const resposta = await api.get(
        "/hotel/historico",
        {
          params: {
            busca: termo.trim(),
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
          "Não foi possível carregar o histórico do Hotel."
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

    carregarHistorico(busca);
  }

  function limparPesquisa() {
    setBusca("");
    carregarHistorico("");
  }

  function formatarData(data) {
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

  function nomeStatus(status) {
    const nomes = {
      AGENDADO: "Agendado",
      HOSPEDADO: "Hospedado",
      FINALIZADO: "Finalizado",
      CANCELADO: "Cancelado",
    };

    return nomes[status] || status;
  }

  return (
    <div className="historico-hotel">
      <div className="historico-hotel-cabecalho">
        <div>
          <h1>
            Histórico do Hotel
          </h1>

          <p>
            Consulte reservas, hospedagens,
            finalizações e cancelamentos.
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

      <form
        className="historico-hotel-pesquisa"
        onSubmit={pesquisar}
      >
        <input
          type="text"
          placeholder="Buscar por pet ou tutor..."
          value={busca}
          onChange={(event) =>
            setBusca(
              event.target.value
            )
          }
        />

        <button
          type="submit"
          className="botao-principal"
        >
          Pesquisar
        </button>

        {busca && (
          <button
            type="button"
            className="botao-secundario"
            onClick={limparPesquisa}
          >
            Limpar
          </button>
        )}
      </form>

      {erro && (
        <div className="historico-hotel-erro">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="historico-hotel-vazio">
          Carregando histórico...
        </div>
      ) : registros.length === 0 ? (
        <div className="historico-hotel-vazio">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="historico-hotel-tabela-container">
          <table className="historico-hotel-tabela">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Tutor</th>
                <th>
                  Entrada prevista
                </th>
                <th>
                  Saída prevista
                </th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
                <th>Ações</th>
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
                    </td>

                    <td>
                      {registro.tutor_nome}
                    </td>

                    <td>
                      {formatarData(
                        registro.entrada_prevista
                      )}
                    </td>

                    <td>
                      {formatarData(
                        registro.saida_prevista
                      )}
                    </td>

                    <td>
                      {formatarData(
                        registro.checkin_em
                      )}
                    </td>

                    <td>
                      {formatarData(
                        registro.checkout_em
                      )}
                    </td>

                    <td>
                      <span
                        className={`historico-status ${registro.status.toLowerCase()}`}
                      >
                        {nomeStatus(
                          registro.status
                        )}
                      </span>
                    </td>
                    

                    <td>
                      <button
                        type="button"
                        className="botao-principal"
                        onClick={() =>
                          navigate(
                            `/hotel/${registro.id}`
                          )
                        }
                      >
                        Detalhes
                      </button>
                      <button
                        type="button"
                        className="botao-secundario"
                        onClick={() =>
                          navigate(
                            `/pets/${registro.pet_id}`
                          )
                        }
                      >
                        Ver Pet
                      </button>
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

export default HistoricoHotel;