import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/DetalhesAuditoria.css";


function DetalhesAuditoria() {

  const navigate = useNavigate();

  const { id } = useParams();


  const [log, setLog] =
    useState(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");


  /*
   * Busca somente o registro selecionado.
   *
   * O backend continua sendo responsável por garantir
   * que apenas administradores possam consultar
   * informações completas da auditoria.
   */
  useEffect(() => {

    async function carregarLog() {

      try {

        setCarregando(true);
        setErro("");


        const resposta =
          await api.get(
            `/auditoria/${id}`
          );


        setLog(
          resposta.data
        );

      } catch (error) {

        console.error(
          "Erro ao carregar registro de auditoria:",
          error
        );


        if (
          error.response?.status === 404
        ) {

          setErro(
            "Registro de auditoria não encontrado."
          );

        } else {

          setErro(
            "Não foi possível carregar o registro de auditoria."
          );

        }

      } finally {

        setCarregando(false);

      }

    }


    carregarLog();

  }, [id]);


  function formatarDataHora(
    data
  ) {

    if (!data) {
      return "-";
    }


    return new Date(
      data
    ).toLocaleString(
      "pt-BR"
    );

  }


  function formatarTexto(
    texto
  ) {

    if (!texto) {
      return "-";
    }


    return texto
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(
        /\b\w/g,
        (letra) =>
          letra.toUpperCase()
      );

  }


  /*
   * Exibe valores JSON de maneira legível.
   *
   * Não alteramos o conteúdo armazenado no log:
   * esta função serve somente para apresentação.
   */
  function formatarValor(
    valor
  ) {

    if (
      valor === null ||
      valor === undefined
    ) {
      return null;
    }


    if (
      typeof valor === "object"
    ) {
      return JSON.stringify(
        valor,
        null,
        2
      );
    }


    return String(valor);

  }


  if (carregando) {

    return (

      <div className="detalhes-auditoria-page">

        <div className="detalhes-auditoria-estado">
          Carregando registro...
        </div>

      </div>

    );

  }


  if (erro) {

    return (

      <div className="detalhes-auditoria-page">

        <button
          type="button"
          className="detalhes-auditoria-voltar"
          onClick={() =>
            navigate(
              "/administracao/auditoria"
            )
          }
        >
          ← Voltar para auditoria
        </button>


        <div className="detalhes-auditoria-erro">
          {erro}
        </div>

      </div>

    );

  }


  if (!log) {
    return null;
  }


  const valorAnterior =
    formatarValor(
      log.valor_anterior
    );


  const valorNovo =
    formatarValor(
      log.valor_novo
    );


  return (

    <div className="detalhes-auditoria-page">

      <div className="detalhes-auditoria-header">

        <button
          type="button"
          className="detalhes-auditoria-voltar"
          onClick={() =>
            navigate(
              "/administracao/auditoria"
            )
          }
        >
          ← Logs e Auditoria
        </button>


        <h1>
          Detalhes da Auditoria
        </h1>


        <p>
          Registro #{log.id}
        </p>

      </div>


      {/* ==============================
          INFORMAÇÕES DA OPERAÇÃO
          ============================== */}

      <div className="detalhes-auditoria-card">

        <div className="detalhes-auditoria-card-header">

          <h2>
            Informações da operação
          </h2>

        </div>


        <div className="detalhes-auditoria-grid">

          <div className="detalhes-auditoria-campo">

            <span>
              Data e hora
            </span>

            <strong>
              {formatarDataHora(
                log.criado_em
              )}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              Ação
            </span>

            <strong>
              {formatarTexto(
                log.acao
              )}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              Entidade
            </span>

            <strong>
              {formatarTexto(
                log.entidade
              )}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              ID do registro
            </span>

            <strong>
              {log.registro_id ?? "-"}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              Endereço IP
            </span>

            <strong>
              {log.ip || "-"}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              ID do log
            </span>

            <strong>
              {log.id}
            </strong>

          </div>

        </div>

      </div>


      {/* ==============================
          USUÁRIO
          ============================== */}

      <div className="detalhes-auditoria-card">

        <div className="detalhes-auditoria-card-header">

          <h2>
            Usuário responsável
          </h2>

        </div>


        <div className="detalhes-auditoria-grid">

          <div className="detalhes-auditoria-campo">

            <span>
              Nome
            </span>

            <strong>
              {log.usuario_nome ||
                "Usuário não disponível"}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              E-mail
            </span>

            <strong>
              {log.usuario_email ||
                "-"}
            </strong>

          </div>


          <div className="detalhes-auditoria-campo">

            <span>
              ID do usuário
            </span>

            <strong>
              {log.usuario_id ??
                "-"}
            </strong>

          </div>

        </div>

      </div>


      {/* ==============================
          ALTERAÇÕES
          ============================== */}

      <div className="detalhes-auditoria-card">

        <div className="detalhes-auditoria-card-header">

          <h2>
            Alterações registradas
          </h2>

          <p>
            Estado dos dados antes e depois
            da operação.
          </p>

        </div>


        {!valorAnterior &&
        !valorNovo ? (

          <div className="detalhes-auditoria-sem-alteracoes">

            Esta operação não possui
            valores anteriores ou novos
            registrados.

          </div>

        ) : (

          <div className="detalhes-auditoria-comparacao">

            <div className="detalhes-auditoria-valor">

              <div className="detalhes-auditoria-valor-titulo">
                Antes
              </div>


              {valorAnterior ? (

                <pre>
                  {valorAnterior}
                </pre>

              ) : (

                <div className="detalhes-auditoria-vazio">
                  Nenhum valor anterior.
                </div>

              )}

            </div>


            <div className="detalhes-auditoria-valor">

              <div className="detalhes-auditoria-valor-titulo">
                Depois
              </div>


              {valorNovo ? (

                <pre>
                  {valorNovo}
                </pre>

              ) : (

                <div className="detalhes-auditoria-vazio">
                  Nenhum valor novo.
                </div>

              )}

            </div>

          </div>

        )}

      </div>

    </div>

  );

}


export default DetalhesAuditoria;