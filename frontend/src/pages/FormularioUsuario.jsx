import {
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "../styles/FormularioUsuario.css";


function FormularioUsuario() {
  const navigate = useNavigate();

  const [formulario, setFormulario] = useState({
    nome: "",
    email: "",
    perfil: "funcionario",
    senha: "",
    confirmarSenha: "",
  });

  const [mostrarSenha, setMostrarSenha] =
    useState(false);

  const [mostrarConfirmacao, setMostrarConfirmacao] =
    useState(false);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");


  function alterarCampo(event) {
    const {
      name,
      value,
    } = event.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));
  }


  async function enviarFormulario(event) {
    event.preventDefault();

    setErro("");


    if (
      !formulario.nome.trim() ||
      !formulario.email.trim() ||
      !formulario.senha
    ) {
      setErro(
        "Preencha todos os campos obrigatórios."
      );

      return;
    }


    if (formulario.senha.length < 8) {
      setErro(
        "A senha deve possuir pelo menos 8 caracteres."
      );

      return;
    }


    if (
      formulario.senha !==
      formulario.confirmarSenha
    ) {
      setErro(
        "A confirmação da senha não corresponde à senha informada."
      );

      return;
    }


    try {
      setSalvando(true);

      /*
       * A confirmação da senha existe somente no frontend.
       * Enviamos ao backend apenas os campos necessários
       * para criação da conta.
       */
      await api.post(
        "/usuarios",
        {
          nome: formulario.nome.trim(),
          email: formulario.email
            .trim()
            .toLowerCase(),
          perfil: formulario.perfil,
          senha: formulario.senha,
        }
      );

      navigate(
        "/administracao/usuarios",
        {
          replace: true,
        }
      );
    } catch (erro) {
      console.error(
        "Erro ao cadastrar usuário:",
        erro
      );

      setErro(
        erro.response?.data?.mensagem ||
          "Não foi possível criar o usuário."
      );
    } finally {
      setSalvando(false);
    }
  }


  return (
    <div className="formulario-usuario-page">

      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          navigate(
            "/administracao/usuarios"
          )
        }
      >
        ← Voltar
      </button>


      <div className="formulario-usuario-introducao">

        <span className="formulario-usuario-etiqueta">
          ADMINISTRAÇÃO
        </span>

        <h1>
          Criar novo usuário
        </h1>

        <p>
          Cadastre uma nova conta e defina
          quais permissões ela terá no sistema.
        </p>

      </div>


      <form
        className="formulario-usuario-container"
        onSubmit={enviarFormulario}
      >

        <section className="formulario-usuario-secao">

          <div className="formulario-usuario-secao-numero">
            01
          </div>

          <div className="formulario-usuario-secao-conteudo">

            <h2>
              Identificação
            </h2>

            <p>
              Informações utilizadas para
              identificar o usuário.
            </p>


            <div className="formulario-usuario-grid">

              <div className="formulario-usuario-campo">
                <label htmlFor="nome">
                  Nome completo *
                </label>

                <input
                  id="nome"
                  name="nome"
                  type="text"
                  value={formulario.nome}
                  onChange={alterarCampo}
                  autoComplete="name"
                  maxLength={150}
                />
              </div>


              <div className="formulario-usuario-campo">
                <label htmlFor="email">
                  E-mail *
                </label>

                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formulario.email}
                  onChange={alterarCampo}
                  autoComplete="email"
                  maxLength={255}
                />
              </div>

            </div>

          </div>

        </section>


        <section className="formulario-usuario-secao">

          <div className="formulario-usuario-secao-numero">
            02
          </div>

          <div className="formulario-usuario-secao-conteudo">

            <h2>
              Acesso
            </h2>

            <p>
              Escolha o nível de acesso
              concedido à nova conta.
            </p>


            <div className="formulario-usuario-campo">
              <label htmlFor="perfil">
                Perfil *
              </label>

              <select
                id="perfil"
                name="perfil"
                value={formulario.perfil}
                onChange={alterarCampo}
              >
                <option value="funcionario">
                  Funcionário
                </option>

                <option value="gerente">
                  Gerente
                </option>

                <option value="administrador">
                  Administrador
                </option>
              </select>
            </div>


            <div className="formulario-usuario-perfis">

              <div>
                <strong>
                  Funcionário
                </strong>

                <span>
                  Operações do dia a dia.
                </span>
              </div>

              <div>
                <strong>
                  Gerente
                </strong>

                <span>
                  Operações e funções gerenciais.
                </span>
              </div>

              <div>
                <strong>
                  Administrador
                </strong>

                <span>
                  Acesso completo ao sistema.
                </span>
              </div>

            </div>

          </div>

        </section>


        <section className="formulario-usuario-secao">

          <div className="formulario-usuario-secao-numero">
            03
          </div>

          <div className="formulario-usuario-secao-conteudo">

            <h2>
              Senha inicial
            </h2>

            <p>
              Defina a senha que será utilizada
              no primeiro acesso.
            </p>


            <div className="formulario-usuario-grid">

              <div className="formulario-usuario-campo">
                <label htmlFor="senha">
                  Senha *
                </label>

                <div className="formulario-usuario-senha">
                  <input
                    id="senha"
                    name="senha"
                    type={
                      mostrarSenha
                        ? "text"
                        : "password"
                    }
                    value={formulario.senha}
                    onChange={alterarCampo}
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setMostrarSenha(
                        (anterior) => !anterior
                      )
                    }
                  >
                    {mostrarSenha
                      ? "Ocultar"
                      : "Mostrar"}
                  </button>
                </div>
              </div>


              <div className="formulario-usuario-campo">
                <label htmlFor="confirmarSenha">
                  Confirmar senha *
                </label>

                <div className="formulario-usuario-senha">
                  <input
                    id="confirmarSenha"
                    name="confirmarSenha"
                    type={
                      mostrarConfirmacao
                        ? "text"
                        : "password"
                    }
                    value={
                      formulario.confirmarSenha
                    }
                    onChange={alterarCampo}
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setMostrarConfirmacao(
                        (anterior) => !anterior
                      )
                    }
                  >
                    {mostrarConfirmacao
                      ? "Ocultar"
                      : "Mostrar"}
                  </button>
                </div>
              </div>

            </div>

            <span className="formulario-usuario-ajuda">
              Utilize pelo menos 8 caracteres.
            </span>

          </div>

        </section>


        {erro && (
          <div className="formulario-usuario-erro">
            {erro}
          </div>
        )}


        <div className="formulario-usuario-acoes">

          <button
            type="button"
            className="secondary-button"
            disabled={salvando}
            onClick={() =>
              navigate(
                "/administracao/usuarios"
              )
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
              ? "Criando..."
              : "Criar usuário"}
          </button>

        </div>

      </form>

    </div>
  );
}


export default FormularioUsuario;