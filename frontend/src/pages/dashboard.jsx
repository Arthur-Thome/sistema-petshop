import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();

  const usuario = JSON.parse(
    localStorage.getItem("usuario") || "{}"
  );

  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");

    navigate("/login", { replace: true });
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Dashboard</h1>

      <p>
        Bem-vindo, <strong>{usuario.nome}</strong>.
      </p>

      <p>
        Perfil: <strong>{usuario.perfil}</strong>
      </p>

      <button onClick={sair}>
        Sair
      </button>
    </div>
  );
}

export default Dashboard;