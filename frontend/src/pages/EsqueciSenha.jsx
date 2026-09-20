import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";

import "../styles/Login.css";


function EsqueciSenha() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);


  async function solicitarRecuperacao(event) {
    event.preventDefault();

    setMensagem("");
    setErro("");
    setCarregando(true);

    try {
      const resposta = await api.post(
        "/auth/esqueci-senha",
        {
          email,
        }
      );

      /*
       * O backend retorna a mesma mensagem independentemente
       * de o e-mail existir ou não. Isso evita exposição de
       * contas cadastradas no sistema.
       */
      setMensagem(
        resposta.data.mensagem
      );

      setEmail("");
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível solicitar a recuperação de senha."
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
            Recuperar senha
          </h1>

          <p>
            Informe seu e-mail para receber
            as instruções de redefinição.
          </p>
        </div>


        <form onSubmit={solicitarRecuperacao}>

          <div className="form-group">
            <label htmlFor="email">
              E-mail
            </label>

            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              required
            />
          </div>


          {erro && (
            <div className="login-error">
              {erro}
            </div>
          )}


          {mensagem && (
            <div className="login-success">
              {mensagem}
            </div>
          )}


          <button
            className="login-button"
            type="submit"
            disabled={carregando}
          >
            {carregando
              ? "Enviando..."
              : "Enviar instruções"}
          </button>

        </form>


        <button
          className="forgot-password"
          type="button"
          onClick={() =>
            navigate("/login")
          }
        >
          ← Voltar para o login
        </button>

      </div>
    </div>
  );
}


export default EsqueciSenha;