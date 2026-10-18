import { Navigate } from "react-router-dom";

function RotaGaleria({ children }) {
  const usuario = (() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch { return null; }
  })();
  return ["administrador", "super_administrador", "gerente", "funcionario"].includes(usuario?.perfil)
    ? children
    : <Navigate to="/dashboard" replace />;
}

export default RotaGaleria;
