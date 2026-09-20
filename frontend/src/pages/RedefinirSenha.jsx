import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import api from "../services/api";

import "../styles/Login.css";


function RedefinirSenha() {
  const navigate = useNavigate();

  const [searchParams] =
    useSearchParams();

  const [token, setToken] =
    useState("");

  const [novaSenha, setNovaSenha] =
    useState("");

  const [confirmarSenha, setConfirmarSenha] =
    useState("");

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  const [carregando, setCarregando] =
    useState(false);

  const [senhaAlterada, setSenhaAlterada] =
    useState(false);


  /*
   * O token vem no link recebido por e-mail.
   *
   * Ele permanece somente no estado desta página e será
   * enviado ao backend quando a nova senha for confirmada.
   */
  useEffect(() => {
    const tokenUrl =
      searchParams.get("token");

    if (tokenUrl) {
      setToken(tokenUrl);
    }
  }, [searchParams]);


  async function redefinirSenha(event) {
    event.preventDefault();

    setErro("");
    setMensagem("");


    if (!token) {
      setErro(
        "O link de redefinição é inválido ou está incompleto."
      );

      return;
    }


    if (novaSenha.length < 8) {
      setErro(
        "A nova senha deve possuir pelo menos 8 caracteres."
      );

      return;
    }


    if (novaSenha !== confirmarSenha) {
      setErro(
        "As senhas informadas não são iguais."
      );

      return;
    }


    setCarregando(true);

    try {
      const resposta = await api.post(
        "/auth/redefinir-senha",
        {
          token,
          nova_senha: novaSenha,
        }
      );


      setMensagem(
        resposta.data.mensagem
      );

      /*
       * Depois da alteração não permitimos um novo envio
       * pela mesma tela, pois o token já foi consumido.
       */
      setSenhaAlterada(true);

      setNovaSenha("");
      setConfirmarSenha("");

    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível redefinir a senha."
      );
    } finally {
      setCarregando(false);
    }
  }


  return (
    <div className="login-page">
      <div className="login-container">

        <div className="login-header">
          <div className="login-icon">
            🐾
          </div>

          <h1>
            Redefinir senha
          </h1>

          <p>
            Cadastre uma nova senha
            para acessar o sistema.
          </p>
        </div>


        {!senhaAlterada ? (

          <form onSubmit={redefinirSenha}>

            <div className="form-group">
              <label htmlFor="novaSenha">
                Nova senha
              </label>

              <input
                id="novaSenha"
                type="password"
                placeholder="Digite a nova senha"
                value={novaSenha}
                onChange={(event) =>
                  setNovaSenha(
                    event.target.value
                  )
                }
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>


            <div className="form-group">
              <label htmlFor="confirmarSenha">
                Confirmar nova senha
              </label>

              <input
                id="confirmarSenha"
                type="password"
                placeholder="Digite novamente"
                value={confirmarSenha}
                onChange={(event) =>
                  setConfirmarSenha(
                    event.target.value
                  )
                }
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>


            {erro && (
              <div className="login-error">
                {erro}
              </div>
            )}


            {!token && (
              <div className="login-error">
                Link de redefinição inválido.
                Solicite uma nova recuperação de senha.
              </div>
            )}


            <button
              className="login-button"
              type="submit"
              disabled={
                carregando ||
                !token
              }
            >
              {carregando
                ? "Alterando..."
                : "Redefinir senha"}
            </button>

          </form>

        ) : (

          <>
            <div className="login-success">
              {mensagem}
            </div>

            <button
              className="login-button"
              type="button"
              onClick={() =>
                navigate(
                  "/login",
                  { replace: true }
                )
              }
            >
              Ir para o login
            </button>
          </>

        )}


        {!senhaAlterada && (
          <button
            className="forgot-password"
            type="button"
            onClick={() =>
              navigate("/login")
            }
          >
            ← Voltar para o login
          </button>
        )}

      </div>
    </div>
  );
}


export default RedefinirSenha;