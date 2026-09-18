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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

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

          <Route
            path="pets"
            element={<Pets />}
          />

          <Route
            path="pets/novo"
            element={<FormularioPet />}
          />

          <Route
            path="pets/:id"
            element={<DetalhesPet />}
          />

          <Route
            path="pets/:id/editar"
            element={<FormularioPet />}
          />

          <Route
            path="/creche"
            element={<Creche />}
          />

          <Route
            path="creche/entrada"
            element={<EntradaCreche />}
          />

          <Route
            path="creche/:id/saida"
            element={<SaidaCreche />}
          />

          <Route
            path="creche/historico"
            element={<HistoricoCreche />}
          />

          <Route
            path="/hotel"
            element={<Hotel />}
          />

          <Route
            path="hotel/nova-reserva"
            element={<NovaReservaHotel />}
          />

          <Route
            path="hotel/:id/checkin"
            element={<CheckinHotel />}
          />

          <Route
            path="hotel/:id/checkout"
            element={<CheckoutHotel />}
          />

          <Route
            path="hotel/:id/cancelar"
            element={<CancelarReservaHotel />}
          />

          <Route
            path="hotel/historico"
            element={<HistoricoHotel />}
          />

          <Route
            path="hotel/:id"
            element={<DetalhesHotel />}
          />

          <Route
            path="/banho-tosa"
            element={
              <PaginaEmConstrucao titulo="Banho e Tosa" />
            }
          />

          <Route
            path="produtos"
            element={<Produtos />}
          />

          <Route
            path="produtos/novo"
            element={<FormularioProduto />}
          />

          <Route
            path="produtos/:id"
            element={<DetalhesProduto />}
          />

          <Route
            path="produtos/:id/movimentar"
            element={<MovimentarEstoque />}
          />

          <Route
            path="produtos/:id/editar"
            element={<FormularioProduto />}
          />

          <Route
            path="/administracao"
            element={
              <PaginaEmConstrucao titulo="Administração" />
            }
          />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;