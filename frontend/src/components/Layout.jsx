import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "../styles/Layout.css";

function Layout() {
  const navigate = useNavigate();

  const usuario = JSON.parse(
    localStorage.getItem("usuario") || "{}"
  );

  /*
   * Administrador e Gerente podem acessar recursos
   * administrativos relacionados à operação.
   *
   * Esta verificação controla somente a exibição do menu.
   * A autorização real também será aplicada no backend.
   */
  const podeAcessarAdministrativo =
    usuario.perfil === "administrador" ||
    usuario.perfil === "gerente";

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
            GESTÃO
          </div>

          <NavLink to="/produtos">
            <span>📦</span>
            Produtos
          </NavLink>

          <NavLink to="/banho-tosa/servicos">
            <span>🧰</span>
            Serviços
          </NavLink>

          {/*
           * O Administrativo operacional é exibido somente
           * para Administrador e Gerente.
           *
           * Funcionários continuam utilizando Produtos para
           * consulta, mas não recebem acesso ao histórico
           * administrativo de movimentações.
           */}
          {podeAcessarAdministrativo && (
            <>
              <div className="menu-section">
                ADMINISTRATIVO
              </div>

              <NavLink to="/administrativo/estoque">
                <span>📋</span>
                Histórico de Estoque
              </NavLink>

              <NavLink to="/administrativo/pagamentos-pendentes">
                <span>💳</span>
                Pagamentos Pendentes
              </NavLink>

            </>
          )}

          {/*
           * Sistema -> Administração permanece separado.
           *
           * Esta área contém usuários, segurança e auditoria
           * completa e continua exclusiva do Administrador.
           */}
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
            {usuario.nome
              ?.charAt(0)
              ?.toUpperCase() || "U"}
          </div>

          <div className="user-info">
            <strong>
              {usuario.nome}
            </strong>

            <span>
              {usuario.perfil}
            </span>
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