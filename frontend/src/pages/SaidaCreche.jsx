import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/SaidaCreche.css";


function SaidaCreche() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [registro, setRegistro] =
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
   * A API atual possui uma rota que retorna todas as
   * permanências abertas. Procuramos nela o registro
   * selecionado para evitar criar um endpoint somente
   * para esta tela.
   */
  useEffect(() => {
    async function carregarRegistro() {
      try {
        setCarregando(true);
        setErro("");

        const resposta =
          await api.get("/creche/ativos");

        const registros =
          resposta.data.registros || [];

        const encontrado =
          registros.find(
            (item) =>
              Number(item.id) ===
              Number(id)
          );

        if (!encontrado) {
          setErro(
            "Esta permanência não está mais ativa ou não foi encontrada."
          );

          return;
        }

        setRegistro(encontrado);
      } catch (error) {
        console.error(
          "Erro ao carregar permanência da creche:",
          error
        );

        setErro(
          error.response?.data?.mensagem ||
          "Não foi possível carregar os dados da permanência."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarRegistro();
  }, [id]);


  function formatarDataHora(data) {
    if (!data) {
      return "-";
    }

    return new Date(data).toLocaleString(
      "pt-BR"
    );
  }


  async function confirmarSaida(event) {
    event.preventDefault();

    if (!registro) {
      return;
    }

    try {
      setSalvando(true);
      setErro("");

      await api.patch(
        `/creche/${registro.id}/saida`,
        {
          observacoes:
            observacoes.trim() || null,
        }
      );

      /*
       * Após finalizar, retornamos para a lista.
       * O pet desaparecerá porque não possui mais
       * uma permanência com status NA_CRECHE.
       */
      navigate("/creche");
    } catch (error) {
      console.error(
        "Erro ao registrar saída:",
        error
      );

      setErro(
        error.response?.data?.mensagem ||
        "Não foi possível registrar a saída."
      );
    } finally {
      setSalvando(false);
    }
  }


  if (carregando) {
    return (
      <div className="saida-creche-page">
        <div className="saida-creche-mensagem">
          Carregando...
        </div>
      </div>
    );
  }


  return (
    <div className="saida-creche-page">

      <div className="saida-creche-header">

        <div>
          <h1>
            Registrar Saída
          </h1>

          <p>
            Finalize a permanência do pet
            na creche.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={salvando}
          onClick={() =>
            navigate("/creche")
          }
        >
          Voltar
        </button>

      </div>


      {erro && (
        <div className="saida-creche-erro">
          {erro}
        </div>
      )}


      {registro && (

        <form
          className="saida-creche-form"
          onSubmit={confirmarSaida}
        >

          <div className="saida-creche-bloco">

            <div className="saida-creche-pet">

              <div>
                <span>Pet</span>

                <strong>
                  {registro.pet_nome}
                </strong>
              </div>

              <div>
                <span>Tutor</span>

                <strong>
                  {registro.tutor_nome}
                </strong>
              </div>

              <div>
                <span>Raça</span>

                <strong>
                  {registro.raca || "-"}
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
                  Entrada registrada por
                </span>

                <strong>
                  {
                    registro.usuario_entrada_nome
                  }
                </strong>
              </div>

            </div>


            {registro.observacoes_entrada && (

              <div className="saida-observacao-entrada">

                <span>
                  Observações da entrada
                </span>

                <p>
                  {
                    registro.observacoes_entrada
                  }
                </p>

              </div>

            )}

          </div>


          <div className="saida-creche-bloco">

            <h2>
              Informações da saída
            </h2>

            <label className="saida-observacoes">

              <span>
                Observações de saída
              </span>

              <textarea
                rows="5"
                value={observacoes}
                onChange={(event) =>
                  setObservacoes(
                    event.target.value
                  )
                }
                placeholder="Ex.: Pet entregue ao tutor sem intercorrências."
              />

            </label>


            <div className="saida-creche-aviso">

              Ao confirmar, a permanência de{" "}
              <strong>
                {registro.pet_nome}
              </strong>{" "}
              será finalizada e ficará disponível
              no histórico da Creche.

            </div>


            <div className="saida-creche-acoes">

              <button
                type="button"
                className="secondary-button"
                disabled={salvando}
                onClick={() =>
                  navigate("/creche")
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={salvando}
              >
                {salvando
                  ? "Registrando..."
                  : "Confirmar Saída"}
              </button>

            </div>

          </div>

        </form>

      )}

    </div>
  );
}


export default SaidaCreche;