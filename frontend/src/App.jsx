import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import PaginaEmConstrucao from "./pages/PaginaEmConstrucao";
import Tutores from "./pages/Tutores";
import Layout from "./components/Layout";
import RotaProtegida from "./components/RotaProtegida";
import FormularioTutor from "./pages/FormularioTutor";
import DetalhesTutor from "./pages/DetalhesTutor";
import FormularioPet from "./pages/FormularioPet";
import Pets from "./pages/Pets";
import DetalhesPet from "./pages/DetalhesPet";
import Produtos from "./pages/Produtos";
import FormularioProduto from "./pages/FormularioProduto";
import DetalhesProduto from "./pages/DetalhesProduto";
import MovimentarEstoque from "./pages/MovimentarEstoque";
import Creche from "./pages/Creche";
import EntradaCreche from "./pages/EntradaCreche";
import SaidaCreche from "./pages/SaidaCreche";
import HistoricoCreche from "./pages/HistoricoCreche";
import Hotel from "./pages/Hotel";
import NovaReservaHotel from "./pages/NovaReservaHotel";
import CheckinHotel from "./pages/CheckinHotel";
import CheckoutHotel from "./pages/CheckoutHotel";
import CancelarReservaHotel from "./pages/CancelarReservaHotel";
import HistoricoHotel from "./pages/HistoricoHotel";
import DetalhesHotel from "./pages/DetalhesHotel";
import BanhoTosa from "./pages/BanhoTosa";
import NovoAgendamentoBanhoTosa from "./pages/NovoAgendamentoBanhoTosa";
import DetalhesBanhoTosa from "./pages/DetalhesBanhoTosa";
import ServicosBanhoTosa from "./pages/ServicosBanhoTosa";
import FormularioServicoBanhoTosa from "./pages/FormularioServicoBanhoTosa";
import HistoricoBanhoTosa from "./pages/HistoricoBanhoTosa";
import CancelarBanhoTosa from "./pages/CancelarBanhoTosa";
import FinalizarBanhoTosa from "./pages/FinalizarBanhoTosa";
import PagamentoBanhoTosa from "./pages/PagamentoBanhoTosa";
import ComprovanteBanhoTosa from "./pages/ComprovanteBanhoTosa";
import Administracao from "./pages/Administracao";
import RotaAdministrador from "./components/RotaAdministrador";
import Auditoria from "./pages/Auditoria";
import DetalhesAuditoria from "./pages/DetalhesAuditoria";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import Usuarios from "./pages/Usuarios";
import FormularioUsuario from "./pages/FormularioUsuario";
import GerenciarUsuario from "./pages/GerenciarUsuario";
import HistoricoEstoque from "./pages/HistoricoEstoque";
import PagamentosPendentes from "./pages/PagamentosPendentes";
import RotaAdministrativo from "./components/RotaAdministrativo";

/*
 * Site público da Amores Pet.
 *
 * Estas páginas não exigem autenticação porque fazem
 * parte da área acessível aos clientes.
 */
import HomePublica from "./public-pages/HomePublica";
import AgendamentoPublico from "./public-pages/AgendamentoPublico";
import GaleriaPublica from "./public-pages/GaleriaPublica";

/*
 * Administração da Agenda Pública.
 *
 * Diferentemente das páginas protegidas por
 * RotaAdministrativo, esta tela pode ser acessada também
 * pelo Funcionário.
 *
 * A autorização adicional exigida do Funcionário ocorre
 * no momento de alterar a agenda e é validada novamente
 * pelo backend.
 */
import AgendaPublica from "./pages/AgendaPublica";


function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ===================================================
            SITE PÚBLICO
            =================================================== */}

        <Route
          path="/"
          element={<HomePublica />}
        />

        <Route
          path="/agendar"
          element={<AgendamentoPublico />}
        />

        <Route
          path="/galeria"
          element={<GaleriaPublica />}
        />


        {/* ===================================================
            AUTENTICAÇÃO
            =================================================== */}

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/esqueci-senha"
          element={<EsqueciSenha />}
        />

        <Route
          path="/redefinir-senha"
          element={<RedefinirSenha />}
        />


        {/* ===================================================
            ÁREA INTERNA PROTEGIDA
            =================================================== */}

        <Route
          element={
            <RotaProtegida>
              <Layout />
            </RotaProtegida>
          }
        >

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />


          {/* =================================================
              TUTORES
              ================================================= */}

          <Route
            path="/tutores"
            element={<Tutores />}
          />

          <Route
            path="/tutores/novo"
            element={<FormularioTutor />}
          />

          <Route
            path="/tutores/:id"
            element={<DetalhesTutor />}
          />

          <Route
            path="/tutores/:id/editar"
            element={<FormularioTutor />}
          />


          {/* =================================================
              PETS
              ================================================= */}

          <Route
            path="/pets"
            element={<Pets />}
          />

          <Route
            path="/pets/novo"
            element={<FormularioPet />}
          />

          <Route
            path="/pets/:id"
            element={<DetalhesPet />}
          />

          <Route
            path="/pets/:id/editar"
            element={<FormularioPet />}
          />


          {/* =================================================
              CRECHE
              ================================================= */}

          <Route
            path="/creche"
            element={<Creche />}
          />

          <Route
            path="/creche/entrada"
            element={<EntradaCreche />}
          />

          <Route
            path="/creche/:id/saida"
            element={<SaidaCreche />}
          />

          <Route
            path="/creche/historico"
            element={<HistoricoCreche />}
          />


          {/* =================================================
              HOTEL
              ================================================= */}

          <Route
            path="/hotel"
            element={<Hotel />}
          />

          <Route
            path="/hotel/nova-reserva"
            element={<NovaReservaHotel />}
          />

          <Route
            path="/hotel/:id/checkin"
            element={<CheckinHotel />}
          />

          <Route
            path="/hotel/:id/checkout"
            element={<CheckoutHotel />}
          />

          <Route
            path="/hotel/:id/cancelar"
            element={<CancelarReservaHotel />}
          />

          <Route
            path="/hotel/historico"
            element={<HistoricoHotel />}
          />

          <Route
            path="/hotel/:id"
            element={<DetalhesHotel />}
          />


          {/* =================================================
              ATENDIMENTOS
              =================================================

              "Atendimentos" é o novo endereço público do
              antigo módulo Banho e Tosa.

              Os nomes internos dos componentes permanecem
              temporariamente como BanhoTosa enquanto a
              migração é realizada de forma gradual.
          */}

          <Route
            path="/atendimentos"
            element={<BanhoTosa />}
          />

          <Route
            path="/atendimentos/novo"
            element={
              <NovoAgendamentoBanhoTosa />
            }
          />

          <Route
            path="/atendimentos/:id"
            element={<DetalhesBanhoTosa />}
          />

          <Route
            path="/atendimentos/servicos"
            element={<ServicosBanhoTosa />}
          />

          <Route
            path="/atendimentos/servicos/novo"
            element={
              <FormularioServicoBanhoTosa />
            }
          />

          <Route
            path="/atendimentos/servicos/:id/editar"
            element={
              <FormularioServicoBanhoTosa />
            }
          />

          <Route
            path="/atendimentos/historico"
            element={<HistoricoBanhoTosa />}
          />

          <Route
            path="/atendimentos/:id/cancelar"
            element={<CancelarBanhoTosa />}
          />

          <Route
            path="/atendimentos/:id/finalizar"
            element={<FinalizarBanhoTosa />}
          />

          <Route
            path="/atendimentos/:id/pagamento"
            element={<PagamentoBanhoTosa />}
          />

          <Route
            path="/atendimentos/:id/comprovante"
            element={<ComprovanteBanhoTosa />}
          />


          {/* =================================================
              PRODUTOS
              ================================================= */}

          <Route
            path="/produtos"
            element={<Produtos />}
          />

          <Route
            path="/produtos/novo"
            element={<FormularioProduto />}
          />

          <Route
            path="/produtos/:id"
            element={<DetalhesProduto />}
          />

          <Route
            path="/produtos/:id/movimentar"
            element={<MovimentarEstoque />}
          />

          <Route
            path="/produtos/:id/editar"
            element={<FormularioProduto />}
          />


          {/* =================================================
              AGENDA PÚBLICA
              =================================================

              Os três perfis internos podem consultar esta
              página.

              Administrador e Gerente podem realizar
              alterações diretamente.

              Funcionário precisa fornecer a senha válida
              de um Administrador ou Gerente ativo no
              momento da alteração.

              A regra de segurança definitiva permanece
              no backend.
          */}

          <Route
            path="/agenda-publica"
            element={<AgendaPublica />}
          />


          {/* =================================================
              ADMINISTRATIVO OPERACIONAL
              =================================================

              Administrador e Gerente possuem acesso.
          */}

          <Route
            path="/administrativo/estoque"
            element={
              <RotaAdministrativo>
                <HistoricoEstoque />
              </RotaAdministrativo>
            }
          />

          <Route
            path="/administrativo/pagamentos-pendentes"
            element={
              <RotaAdministrativo>
                <PagamentosPendentes />
              </RotaAdministrativo>
            }
          />


          {/* =================================================
              ADMINISTRAÇÃO DO SISTEMA
              =================================================

              Usuários, segurança e auditoria permanecem
              exclusivos do Administrador.
          */}

          <Route
            path="/administracao"
            element={
              <RotaAdministrador>
                <Administracao />
              </RotaAdministrador>
            }
          />

          <Route
            path="/administracao/auditoria"
            element={
              <RotaAdministrador>
                <Auditoria />
              </RotaAdministrador>
            }
          />

          <Route
            path="/administracao/auditoria/:id"
            element={
              <RotaAdministrador>
                <DetalhesAuditoria />
              </RotaAdministrador>
            }
          />

          <Route
            path="/administracao/usuarios"
            element={
              <RotaAdministrador>
                <Usuarios />
              </RotaAdministrador>
            }
          />

          <Route
            path="/administracao/usuarios/novo"
            element={
              <RotaAdministrador>
                <FormularioUsuario />
              </RotaAdministrador>
            }
          />

          <Route
            path="/administracao/usuarios/:id"
            element={
              <RotaAdministrador>
                <GerenciarUsuario />
              </RotaAdministrador>
            }
          />

        </Route>


        {/* ===================================================
            ENDEREÇO NÃO ENCONTRADO
            =================================================== */}

        <Route
          path="*"
          element={
            <Navigate
              to="/dashboard"
              replace
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}


export default App;