import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";
import { classificarFalhaApi } from "../utils/classificarFalhaApi";

function RotaProtegida({ children }) {
  const [carregando, setCarregando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [apiIndisponivel, setApiIndisponivel] = useState(false);

  const verificarAutenticacao = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setAutenticado(false);
      setCarregando(false);
      return true;
    }

    try {
      const resposta = await api.get("/auth/me", { timeout: 8000 });
      localStorage.setItem("usuario", JSON.stringify(resposta.data.usuario));
      setAutenticado(true);
      setApiIndisponivel(false);
      return true;
    } catch (error) {
      if (classificarFalhaApi(error) === "api-indisponivel") {
        // Uma falha transitória não revoga nem apaga a sessão local.
        setApiIndisponivel(true);
        setAutenticado(false);
        return false;
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        setAutenticado(false);
        setApiIndisponivel(false);
        return true;
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(verificarAutenticacao);
  }, [verificarAutenticacao]);

  useEffect(() => {
    if (!apiIndisponivel) return undefined;
    let ativo = true;
    let temporizador;
    const tentarRecuperacao = async () => {
      if (!ativo) return;
      setCarregando(true);
      setApiIndisponivel(false);
      const recuperada = await verificarAutenticacao();
      if (ativo && !recuperada) temporizador = setTimeout(tentarRecuperacao, 5000);
    };
    temporizador = setTimeout(tentarRecuperacao, 5000);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [apiIndisponivel, verificarAutenticacao]);

  if (carregando) {
    return (
      <div role="status" style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" }}>
        Verificando acesso ao Amores Pet...
      </div>
    );
  }

  if (apiIndisponivel) {
    return (
      <main role="alert" className="api-indisponivel">
        <h1>O Amores Pet está temporariamente indisponível</h1>
        <p>Não foi possível confirmar sua sessão com o servidor. Sua sessão foi preservada. Verifique se a homologação está iniciada e tente novamente.</p>
        <button type="button" onClick={() => { setApiIndisponivel(false); setCarregando(true); verificarAutenticacao(); }}>Tentar novamente</button>
      </main>
    );
  }

  if (!autenticado) return <Navigate to="/login" replace />;
  return children;
}

export default RotaProtegida;
