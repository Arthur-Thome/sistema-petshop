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
            element={
              <PaginaEmConstrucao titulo="Creche" />
            }
          />

          <Route
            path="/hotel"
            element={
              <PaginaEmConstrucao titulo="Hotel" />
            }
          />

          <Route
            path="/banho-tosa"
            element={
              <PaginaEmConstrucao titulo="Banho e Tosa" />
            }
          />

          <Route
            path="/produtos"
            element={
              <PaginaEmConstrucao titulo="Produtos" />
            }
          />

          <Route
            path="/estoque"
            element={
              <PaginaEmConstrucao titulo="Estoque" />
            }
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