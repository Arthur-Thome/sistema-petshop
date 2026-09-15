import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";

function RotaProtegida({ children }) {
  const [carregando, setCarregando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);

  // Não confiamos apenas na existência do token no navegador.
  // /auth/me confirma no backend se a sessão continua válida
  z// e se o usuário permanece ativo.
  useEffect(() => {
    async function verificarAutenticacao() {
      const token = localStorage.getItem("token");

      if (!token) {
        setAutenticado(false);
        setCarregando(false);
        return;
      }

      try {
        const resposta = await api.get("/auth/me");

        localStorage.setItem(
          "usuario",
          JSON.stringify(resposta.data.usuario)
        );

        setAutenticado(true);
      } catch (erro) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");

        setAutenticado(false);
      } finally {
        setCarregando(false);
      }
    }

    verificarAutenticacao();
  }, []);

  if (carregando) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        Verificando acesso...
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default RotaProtegida;