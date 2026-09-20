import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "../styles/Layout.css";

function Layout() {
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
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">🐾</div>

          <div>
            <h2>Pet Shop</h2>
            <span>Sistema de Gestão</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          <NavLink to="/dashboard">
            <span>▦</span>
            Dashboard
          </NavLink>

          <NavLink to="/tutores">
            <span>👤</span>
            Tutores
          </NavLink>

          <NavLink to="/pets">
            <span>🐾</span>
            Pets
          </NavLink>

          <div className="menu-section">
            ATENDIMENTOS
          </div>

          <NavLink to="/creche">
            <span>🏠</span>
            Creche
          </NavLink>

          <NavLink to="/hotel">
            <span>🏨</span>
            Hotel
          </NavLink>

          <NavLink to="/banho-tosa">
            <span>✂</span>
            Banho e Tosa
          </NavLink>

          <div className="menu-section">
            ÁREA ADMINISTRATIVA
          </div>

          <NavLink to="/produtos">
            <span>📦</span>
            Produtos
          </NavLink>

          <NavLink to="/banho-tosa/servicos">
            <span>🧰</span>
            Serviços
          </NavLink>

          {/* Administração fica oculta para outros perfis.
          A autorização real continua sendo responsabilidade do backend. */}
          {usuario.perfil === "administrador" && (
            <>
              <div className="menu-section">
                SISTEMA
              </div>

              <NavLink to="/administracao">
                <span>⚙</span>
                Administração
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-user">
          <div className="user-avatar">
            {usuario.nome?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <div className="user-info">
            <strong>{usuario.nome}</strong>
            <span>{usuario.perfil}</span>
          </div>

          <button
            className="logout-button"
            onClick={sair}
            title="Sair"
          >
            ↪
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;