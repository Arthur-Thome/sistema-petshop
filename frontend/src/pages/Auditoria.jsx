import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "../styles/Auditoria.css";


function Auditoria() {

  const navigate =
    useNavigate();


  const [logs, setLogs] =
    useState([]);


  const [opcoes, setOpcoes] =
    useState({
      usuarios: [],
      acoes: [],
      entidades: [],
    });


  const [filtros, setFiltros] =
    useState({
      usuario_id: "",
      acao: "",
      entidade: "",
      data_inicio: "",
      data_fim: "",
    });


  const [paginacao, setPaginacao] =
    useState({
      pagina: 1,
      limite: 20,
      total: 0,
      total_paginas: 1,
    });


  const [carregando, setCarregando] =
    useState(true);


  const [erro, setErro] =
    useState("");


  /*
   * Carrega as opções utilizadas nos filtros.
   *
   * O endpoint é exclusivo do administrador,
   * assim como a própria listagem da auditoria.
   */
  useEffect(() => {

    async function carregarFiltros() {

      try {

        const resposta =
          await api.get(
            "/auditoria/filtros"
          );


        setOpcoes(
          resposta.data
        );

      } catch (error) {

        console.error(
          "Erro ao carregar filtros da auditoria:",
          error
        );

      }

    }


    carregarFiltros();

  }, []);


  /*
   * Carrega a primeira página quando a tela é aberta.
   */
  useEffect(() => {

    carregarLogs(
      1,
      filtros
    );

    // A consulta inicial deve ocorrer somente
    // quando a página for carregada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function carregarLogs(
    pagina = 1,
    filtrosConsulta = filtros
  ) {

    try {

      setCarregando(true);
      setErro("");


      const params = {
        pagina,
        limite: 20,
      };


      /*
       * Enviamos somente filtros preenchidos.
       *
       * Isso mantém a URL da API limpa e evita
       * parâmetros vazios desnecessários.
       */
      Object.entries(
        filtrosConsulta
      ).forEach(
        ([chave, valor]) => {

          if (valor) {
            params[chave] = valor;
          }

        }
      );


      const resposta =
        await api.get(
          "/auditoria",
          {
            params,
          }
        );


      setLogs(
        resposta.data.logs
      );


      setPaginacao(
        resposta.data.paginacao
      );

    } catch (error) {

      console.error(
        "Erro ao carregar auditoria:",
        error
      );


      setErro(
        "Não foi possível carregar os registros de auditoria."
      );

    } finally {

      setCarregando(false);

    }

  }


  function alterarFiltro(event) {

    const {
      name,
      value,
    } = event.target;


    setFiltros(
      (anterior) => ({
        ...anterior,
        [name]: value,
      })
    );

  }


  function pesquisar(event) {

    event.preventDefault();


    /*
     * Uma nova pesquisa sempre começa pela
     * primeira página.
     */
    carregarLogs(
      1,
      filtros
    );

  }


  function limparFiltros() {

    const filtrosLimpos = {
      usuario_id: "",
      acao: "",
      entidade: "",
      data_inicio: "",
      data_fim: "",
    };


    setFiltros(
      filtrosLimpos
    );


    carregarLogs(
      1,
      filtrosLimpos
    );

  }


  function mudarPagina(
    novaPagina
  ) {

    if (
      novaPagina < 1 ||
      novaPagina >
        paginacao.total_paginas
    ) {
      return;
    }


    carregarLogs(
      novaPagina,
      filtros
    );

  }


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


  /*
   * Melhora a leitura das ações na tabela sem
   * alterar o valor original armazenado no banco.
   *
   * Exemplo:
   * ALTERAR_TUTOR -> Alterar Tutor
   */
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


  return (

    <div className="auditoria-page">

      <div className="auditoria-header">

        <div>

          <button
            type="button"
            className="auditoria-voltar"
            onClick={() =>
              navigate(
                "/administracao"
              )
            }
          >
            ← Administração
          </button>


          <h1>
            Logs e Auditoria
          </h1>


          <p>
            Consulte as operações realizadas
            no sistema.
          </p>

        </div>

      </div>


      {/* ==============================
          FILTROS
          ============================== */}

      <form
        className="auditoria-filtros"
        onSubmit={pesquisar}
      >

        <div className="auditoria-filtro">

          <label htmlFor="usuario_id">
            Usuário
          </label>


          <select
            id="usuario_id"
            name="usuario_id"
            value={
              filtros.usuario_id
            }
            onChange={
              alterarFiltro
            }
          >

            <option value="">
              Todos
            </option>


            {opcoes.usuarios.map(
              (usuario) => (

                <option
                  key={usuario.id}
                  value={usuario.id}
                >
                  {usuario.nome}
                  {" - "}
                  {usuario.email}
                </option>

              )
            )}

          </select>

        </div>


        <div className="auditoria-filtro">

          <label htmlFor="acao">
            Ação
          </label>


          <select
            id="acao"
            name="acao"
            value={
              filtros.acao
            }
            onChange={
              alterarFiltro
            }
          >

            <option value="">
              Todas
            </option>


            {opcoes.acoes.map(
              (acao) => (

                <option
                  key={acao}
                  value={acao}
                >
                  {formatarTexto(
                    acao
                  )}
                </option>

              )
            )}

          </select>

        </div>


        <div className="auditoria-filtro">

          <label htmlFor="entidade">
            Entidade
          </label>


          <select
            id="entidade"
            name="entidade"
            value={
              filtros.entidade
            }
            onChange={
              alterarFiltro
            }
          >

            <option value="">
              Todas
            </option>


            {opcoes.entidades.map(
              (entidade) => (

                <option
                  key={entidade}
                  value={entidade}
                >
                  {formatarTexto(
                    entidade
                  )}
                </option>

              )
            )}

          </select>

        </div>


        <div className="auditoria-filtro">

          <label htmlFor="data_inicio">
            Data inicial
          </label>


          <input
            id="data_inicio"
            name="data_inicio"
            type="date"
            value={
              filtros.data_inicio
            }
            onChange={
              alterarFiltro
            }
          />

        </div>


        <div className="auditoria-filtro">

          <label htmlFor="data_fim">
            Data final
          </label>


          <input
            id="data_fim"
            name="data_fim"
            type="date"
            value={
              filtros.data_fim
            }
            onChange={
              alterarFiltro
            }
          />

        </div>


        <div className="auditoria-filtro-acoes">

          <button
            type="submit"
            className="primary-button"
          >
            Pesquisar
          </button>


          <button
            type="button"
            className="secondary-button"
            onClick={
              limparFiltros
            }
          >
            Limpar
          </button>

        </div>

      </form>


      {erro && (

        <div className="auditoria-erro">
          {erro}
        </div>

      )}


      {/* ==============================
          TABELA
          ============================== */}

      <div className="auditoria-tabela-container">

        <div className="auditoria-tabela-topo">

          <strong>
            Histórico
          </strong>


          <span>
            {paginacao.total}{" "}
            registro
            {paginacao.total !== 1
              ? "s"
              : ""}
          </span>

        </div>


        {carregando ? (

          <div className="auditoria-estado">
            Carregando registros...
          </div>

        ) : logs.length === 0 ? (

          <div className="auditoria-estado">
            Nenhum registro encontrado.
          </div>

        ) : (

          <div className="auditoria-tabela-scroll">

            <table className="auditoria-tabela">

              <thead>

                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Registro</th>
                  <th>IP</th>
                  <th></th>
                </tr>

              </thead>


              <tbody>

                {logs.map(
                  (log) => (

                    <tr key={log.id}>

                      <td>
                        {formatarDataHora(
                          log.criado_em
                        )}
                      </td>


                      <td>

                        <div className="auditoria-usuario">

                          <strong>
                            {log.usuario_nome ||
                              "Usuário não disponível"}
                          </strong>


                          {log.usuario_email && (

                            <span>
                              {
                                log.usuario_email
                              }
                            </span>

                          )}

                        </div>

                      </td>


                      <td>
                        <span className="auditoria-acao">
                          {formatarTexto(
                            log.acao
                          )}
                        </span>
                      </td>


                      <td>
                        {formatarTexto(
                          log.entidade
                        )}
                      </td>


                      <td>
                        {log.registro_id ??
                          "-"}
                      </td>


                      <td>
                        {log.ip || "-"}
                      </td>


                      <td>

                        <button
                          type="button"
                          className="auditoria-visualizar"
                          onClick={() =>
                            navigate(
                              `/administracao/auditoria/${log.id}`
                            )
                          }
                        >
                          Visualizar
                        </button>

                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}


        {/* ==============================
            PAGINAÇÃO
            ============================== */}

        {!carregando &&
          paginacao.total > 0 && (

          <div className="auditoria-paginacao">

            <button
              type="button"
              className="secondary-button"
              disabled={
                paginacao.pagina <= 1
              }
              onClick={() =>
                mudarPagina(
                  paginacao.pagina - 1
                )
              }
            >
              Anterior
            </button>


            <span>
              Página{" "}
              <strong>
                {paginacao.pagina}
              </strong>
              {" de "}
              <strong>
                {paginacao.total_paginas}
              </strong>
            </span>


            <button
              type="button"
              className="secondary-button"
              disabled={
                paginacao.pagina >=
                paginacao.total_paginas
              }
              onClick={() =>
                mudarPagina(
                  paginacao.pagina + 1
                )
              }
            >
              Próxima
            </button>

          </div>

        )}

      </div>

    </div>

  );
}


export default Auditoria;