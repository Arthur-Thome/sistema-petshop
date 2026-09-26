import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

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
   * A autorização real também é aplicada no backend.
   */
  const podeAcessarAdministrativo =
    usuario.perfil === "administrador" ||
    usuario.perfil === "gerente";


  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");

    navigate("/login", {
      replace: true,
    });
  }


  return (
    <div className="app-layout">
      <aside className="sidebar">

        {/* =================================================
            IDENTIDADE DO SISTEMA
            ================================================= */}

        <div className="sidebar-header">
          <div className="sidebar-logo">
            🐾
          </div>

          <div>
            <h2>Pet Shop</h2>

            <span>
              Sistema de Gestão
            </span>
          </div>
        </div>


        {/* =================================================
            MENU
            ================================================= */}

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


          {/* =================================================
              ATENDIMENTOS
              ================================================= */}

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

          {/*
           * O antigo módulo "Banho e Tosa" passa a ser
           * apresentado como "Atendimentos".
           *
           * Dessa forma o módulo poderá receber diferentes
           * tipos de serviços sem ficar limitado ao nome
           * utilizado originalmente.
           */}
          <NavLink to="/atendimentos">
            <span>✂</span>
            Atendimentos
          </NavLink>


          {/* =================================================
              GESTÃO
              ================================================= */}

          <div className="menu-section">
            GESTÃO
          </div>

          <NavLink to="/produtos">
            <span>📦</span>
            Produtos
          </NavLink>

          <NavLink to="/atendimentos/servicos">
            <span>🧰</span>
            Serviços
          </NavLink>


          {/* =================================================
              SITE PÚBLICO
              =================================================

              A Agenda Pública pode ser consultada por
              Administrador, Gerente e Funcionário.

              Funcionários também podem preparar alterações,
              mas o backend exige autorização de um
              Administrador ou Gerente ativo para efetivá-las.
          */}

          <div className="menu-section">
            SITE PÚBLICO
          </div>

          <NavLink to="/agenda-publica">
            <span>📅</span>
            Agenda Pública
          </NavLink>


          {/* =================================================
              ADMINISTRATIVO
              =================================================

              O Administrativo operacional é exibido somente
              para Administrador e Gerente.

              Funcionários continuam utilizando Produtos para
              consulta, mas não recebem acesso ao histórico
              administrativo de movimentações.
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


          {/* =================================================
              SISTEMA
              =================================================

              Sistema -> Administração permanece separado.

              Esta área contém usuários, segurança e auditoria
              completa e continua exclusiva do Administrador.
          */}

          {usuario.perfil ===
            "administrador" && (
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


        {/* =================================================
            USUÁRIO LOGADO
            ================================================= */}

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


      {/* ===================================================
          CONTEÚDO DA ROTA ATUAL
          =================================================== */}

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}


export default Layout;