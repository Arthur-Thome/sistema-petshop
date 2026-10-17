import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [apiPronta, setApiPronta] = useState(false);
  const [verificandoApi, setVerificandoApi] = useState(true);
  const ultimoLogFalhaRef = useRef(0);

  const registrarFalhaReadiness = useCallback((codigo, status = null, requestId = null) => {
    const agora = Date.now();
    if (agora - ultimoLogFalhaRef.current < 30000) return;
    ultimoLogFalhaRef.current = agora;
    console.warn(JSON.stringify({
      evento: "api_readiness_failed",
      endpoint: "/health/ready",
      status,
      codigo,
      requestId,
      horario: new Date(agora).toISOString(),
    }));
  }, []);

  const verificarApi = useCallback(async () => {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 5000);
    try {
      const resposta = await fetch("/health/ready", {
        cache: "no-store",
        signal: controlador.signal,
      });
      const estado = await resposta.json().catch(() => null);
      if (!resposta.ok || estado?.status !== "ready") {
        registrarFalhaReadiness(resposta.status === 503 ? "BACKEND_NOT_READY" : "HTTP_ERROR", resposta.status, resposta.headers.get("X-Request-Id"));
        return false;
      }
      setApiPronta(true);
      setErro((atual) => atual === "api" ? "" : atual);
      return true;
    } catch (erro) {
      setApiPronta(false);
      registrarFalhaReadiness(erro?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR");
      return false;
    } finally {
      clearTimeout(timeout);
      setVerificandoApi(false);
    }
  }, [registrarFalhaReadiness]);

  useEffect(() => {
    if (apiPronta) return undefined;
    let ativo = true;
    let temporizador;

    const consultarAteRestabelecer = async () => {
      if (!ativo) return;
      const pronta = await verificarApi();
      if (!pronta && ativo) temporizador = setTimeout(consultarAteRestabelecer, 5000);
    };

    void consultarAteRestabelecer();
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [apiPronta, verificarApi]);

  function tentarNovamente() {
    setErro("");
    setVerificandoApi(true);
    void verificarApi();
  }

  async function realizarLogin(event) {
    event.preventDefault();

    if (!apiPronta) {
      setErro("api");
      return;
    }

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
      if (!error.response || error.response.status >= 500) {
        setApiPronta(false);
        setErro("api");
        return;
      }
      if (error.response?.data?.mensagem) {
        setErro(error.response.data.mensagem);
      } else if (!error.response) {
        setErro("Não foi possível conectar à API. Confirme se o Amores Pet está iniciado e tente novamente.");
      } else if (error.response.status >= 500) {
        setErro("O serviço de autenticação está indisponível. Aguarde um momento e tente novamente.");
      } else if (error.response.status === 404) {
        setErro("A rota de autenticação não foi encontrada. Feche e inicie novamente pelo atalho de homologação.");
      } else {
        setErro("Não foi possível concluir o login. Verifique os dados e tente novamente.");
      }
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

          {verificandoApi && (
            <div className="login-api-status" role="status">Verificando conexão com o servidor...</div>
          )}
          {!verificandoApi && !apiPronta && (
            <div className="login-error" role="alert">
              {erro === "api"
                ? "O Amores Pet está temporariamente indisponível. Tentaremos reconectar automaticamente."
                : "O Amores Pet ainda não está pronto para login. A conexão será verificada novamente."}
              <button className="login-retry" type="button" onClick={tentarNovamente}>
                Tentar novamente
              </button>
            </div>
          )}
          {erro && erro !== "api" && <div className="login-error" role="alert">{erro}</div>}

          <button
            className="login-button"
            type="submit"
            disabled={carregando || verificandoApi || !apiPronta}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          className="forgot-password"
          type="button"
          onClick={() => navigate("/esqueci-senha")}
        >
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
}

export default Login;
