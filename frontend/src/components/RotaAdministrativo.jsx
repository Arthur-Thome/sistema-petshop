import {
  Navigate,
} from "react-router-dom";


function RotaAdministrativo({
  children,
}) {
  const usuarioSalvo =
    localStorage.getItem("usuario");

  let usuario = null;

  try {
    usuario =
      usuarioSalvo
        ? JSON.parse(usuarioSalvo)
        : null;
  } catch {
    usuario = null;
  }


  /*
   * Esta proteção melhora a navegação do frontend,
   * impedindo que Funcionários abram diretamente uma
   * página administrativa pela URL.
   *
   * A segurança real permanece no backend, que também
   * exige os perfis Administrador ou Gerente.
   */
  const autorizado =
    [
      "administrador",
      "gerente",
    ].includes(usuario?.perfil);


  if (!autorizado) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }


  return children;
}


export default RotaAdministrativo;