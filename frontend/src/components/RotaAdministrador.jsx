import {
  Navigate,
} from "react-router-dom";


/*
 * Proteção adicional para páginas exclusivas
 * da Administração.
 *
 * Esta verificação melhora a navegação no frontend,
 * mas não substitui a autorização do backend.
 *
 * Os endpoints administrativos também precisam
 * continuar exigindo perfil "administrador".
 */
function RotaAdministrador({
  children,
}) {

  const usuario =
    JSON.parse(
      localStorage.getItem(
        "usuario"
      ) || "{}"
    );


  if (
    !["administrador", "super_administrador"].includes(usuario.perfil)
  ) {

    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );

  }


  return children;
}


export default RotaAdministrador;
