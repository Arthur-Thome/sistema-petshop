import { Navigate } from "react-router-dom";

function RotaSuperAdministrador({ children }) {
  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null; }
  })();
  return usuario?.perfil === "super_administrador" ? children : <Navigate to="/dashboard" replace />;
}

export default RotaSuperAdministrador;
