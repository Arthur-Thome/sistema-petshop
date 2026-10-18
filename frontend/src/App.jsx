import { lazy, Suspense } from "react";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

const Login = lazy(() => import("./pages/login"));
const Dashboard = lazy(() => import("./pages/dashboard"));
const Tutores = lazy(() => import("./pages/Tutores"));
import Layout from "./components/Layout";
import RotaProtegida from "./components/RotaProtegida";
const FormularioTutor = lazy(() => import("./pages/FormularioTutor"));
const DetalhesTutor = lazy(() => import("./pages/DetalhesTutor"));
const FormularioPet = lazy(() => import("./pages/FormularioPet"));
const Pets = lazy(() => import("./pages/Pets"));
const DetalhesPet = lazy(() => import("./pages/DetalhesPet"));
const Produtos = lazy(() => import("./pages/Produtos"));
const FormularioProduto = lazy(() => import("./pages/FormularioProduto"));
const DetalhesProduto = lazy(() => import("./pages/DetalhesProduto"));
const MovimentarEstoque = lazy(() => import("./pages/MovimentarEstoque"));
const Creche = lazy(() => import("./pages/Creche"));
const EntradaCreche = lazy(() => import("./pages/EntradaCreche"));
const SaidaCreche = lazy(() => import("./pages/SaidaCreche"));
const HistoricoCreche = lazy(() => import("./pages/HistoricoCreche"));
const Hotel = lazy(() => import("./pages/Hotel"));
const NovaReservaHotel = lazy(() => import("./pages/NovaReservaHotel"));
const CheckinHotel = lazy(() => import("./pages/CheckinHotel"));
const CheckoutHotel = lazy(() => import("./pages/CheckoutHotel"));
const CancelarReservaHotel = lazy(() => import("./pages/CancelarReservaHotel"));
const HistoricoHotel = lazy(() => import("./pages/HistoricoHotel"));
const DetalhesHotel = lazy(() => import("./pages/DetalhesHotel"));
const Atendimentos = lazy(() => import("./pages/Atendimentos"));
const SolicitacoesAtendimento = lazy(() => import("./pages/SolicitacoesAtendimento"));
const NovoAgendamentoAtendimento = lazy(() => import("./pages/NovoAgendamentoAtendimento"));
const DetalhesAtendimento = lazy(() => import("./pages/DetalhesAtendimento"));
const ServicosAtendimento = lazy(() => import("./pages/ServicosAtendimento"));
const FormularioServicoAtendimento = lazy(() => import("./pages/FormularioServicoAtendimento"));
const HistoricoAtendimento = lazy(() => import("./pages/HistoricoAtendimento"));
const CancelarAtendimento = lazy(() => import("./pages/CancelarAtendimento"));
const FinalizarAtendimento = lazy(() => import("./pages/FinalizarAtendimento"));
const PagamentoAtendimento = lazy(() => import("./pages/PagamentoAtendimento"));
const ComprovanteAtendimento = lazy(() => import("./pages/ComprovanteAtendimento"));
const Administracao = lazy(() => import("./pages/Administracao"));
import RotaAdministrador from "./components/RotaAdministrador";
const Auditoria = lazy(() => import("./pages/Auditoria"));
const DetalhesAuditoria = lazy(() => import("./pages/DetalhesAuditoria"));
const EsqueciSenha = lazy(() => import("./pages/EsqueciSenha"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const FormularioUsuario = lazy(() => import("./pages/FormularioUsuario"));
const GerenciarUsuario = lazy(() => import("./pages/GerenciarUsuario"));
const HistoricoEstoque = lazy(() => import("./pages/HistoricoEstoque"));
const PagamentosPendentes = lazy(() => import("./pages/PagamentosPendentes"));
import RotaAdministrativo from "./components/RotaAdministrativo";
import RotaGaleria from "./components/RotaGaleria";
import RotaSuperAdministrador from "./components/RotaSuperAdministrador";
const ConteudoSite = lazy(() => import("./pages/ConteudoSite"));
const ExclusoesDefinitivas = lazy(() => import("./pages/ExclusoesDefinitivas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));

/*
 * Site público da Amores Pet.
 *
 * Estas páginas não exigem autenticação porque fazem
 * parte da área acessível aos clientes.
 */
const HomePublica = lazy(() => import("./public-pages/HomePublica"));
const AgendamentoPublico = lazy(() => import("./public-pages/AgendamentoPublico"));
const GaleriaPublica = lazy(() => import("./public-pages/GaleriaPublica"));

/*
 * Administração da Agenda Pública.
 *
 * A administração da agenda e os conteúdos gerais do site
 * são reservados a Administrador e Super Administrador.
 */
const AgendaPublica = lazy(() => import("./pages/AgendaPublica"));

function RedirecionarAtendimentosLegados() {
  const location = useLocation();
  const destino = location.pathname.replace(/^\/banho-tosa(?=\/|$)/, "/atendimentos");
  return <Navigate to={`${destino}${location.search}${location.hash}`} replace />;
}


function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div role="status" className="app-loading">Carregando...</div>}>
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

          <Route
            path="/relatorios"
            element={<Relatorios />}
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

              A área e seus componentes usam o nome Atendimentos.
              Os caminhos antigos continuam como aliases para
              compatibilidade com links e integrações existentes.
          */}

          <Route path="/banho-tosa/*" element={<RedirecionarAtendimentosLegados />} />
          <Route
            path="/atendimentos"
            element={<Atendimentos />}
          />

          <Route
            path="/atendimentos/solicitacoes"
            element={<SolicitacoesAtendimento />}
          />

          <Route
            path="/atendimentos/novo"
            element={
              <NovoAgendamentoAtendimento />
            }
          />

          <Route
            path="/atendimentos/:id"
            element={<DetalhesAtendimento />}
          />

          <Route
            path="/atendimentos/servicos"
            element={<RotaAdministrador><ServicosAtendimento /></RotaAdministrador>}
          />

          <Route
            path="/atendimentos/servicos/novo"
            element={
              <RotaAdministrador><FormularioServicoAtendimento /></RotaAdministrador>
            }
          />

          <Route
            path="/atendimentos/servicos/:id/editar"
            element={
              <RotaAdministrador><FormularioServicoAtendimento /></RotaAdministrador>
            }
          />

          <Route
            path="/atendimentos/historico"
            element={<HistoricoAtendimento />}
          />

          <Route
            path="/atendimentos/:id/cancelar"
            element={<CancelarAtendimento />}
          />

          <Route
            path="/atendimentos/:id/finalizar"
            element={<FinalizarAtendimento />}
          />

          <Route
            path="/atendimentos/:id/pagamento"
            element={<PagamentoAtendimento />}
          />

          <Route
            path="/atendimentos/:id/comprovante"
            element={<ComprovanteAtendimento />}
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
            element={<RotaAdministrador><AgendaPublica /></RotaAdministrador>}
          />

          <Route
            path="/sistema/conteudo-site"
            element={<RotaGaleria><ConteudoSite /></RotaGaleria>}
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

          <Route path="/administracao/exclusoes-definitivas" element={
            <RotaSuperAdministrador><ExclusoesDefinitivas /></RotaSuperAdministrador>
          } />

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
      </Suspense>
    </BrowserRouter>
  );
}


export default App;
