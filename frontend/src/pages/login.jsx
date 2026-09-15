import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function realizarLogin(event) {
    event.preventDefault();

    setErro("");
    setCarregando(true);

    try {
      const resposta = await api.post("/auth/login", {
        email,
        senha,
      });

      localStorage.setItem("token", resposta.data.token);

      localStorage.setItem(
        "usuario",
        JSON.stringify(resposta.data.usuario)
      );

      navigate("/dashboard", { replace: true });
    } catch (error) {
      setErro(
        error.response?.data?.mensagem ||
          "Não foi possível realizar o login."
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-icon">🐾</div>

          <h1>Sistema Pet Shop</h1>

          <p>Entre com seu usuário para continuar</p>
        </div>

        <form onSubmit={realizarLogin}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>

            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="senha">Senha</label>

            <input
              id="senha"
              type="password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {erro && <div className="login-error">{erro}</div>}

          <button
            className="login-button"
            type="submit"
            disabled={carregando}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          className="forgot-password"
          type="button"
          onClick={() => alert("Recuperação de senha será implementada posteriormente.")}
        >
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
}

export default Login;