import { useEffect, useState } from "react";
import api from "../services/api";

function Dashboard() {
  const usuario = JSON.parse(
    localStorage.getItem("usuario") || "{}"
  );

  const [resumo, setResumo] = useState({
    pets_cadastrados: 0,
    na_creche: null,
    no_hotel: null,
    atendimentos_hoje: null,
    estoque_baixo: null,
  });

  const [carregando, setCarregando] =
    useState(true);

  const [erroDashboard, setErroDashboard] =
  useState(false);



/*
 * O Dashboard utiliza um endpoint de resumo para não
 * precisar baixar todos os registros apenas para contar.
 */
useEffect(() => {
  async function carregarDashboard() {
    try {
      setErroDashboard(false);
      setCarregando(true);

      const resposta =
        await api.get(
          "/dashboard/resumo"
        );

      setResumo(resposta.data);
    } catch (error) {
      setErroDashboard(true);
      console.error(
        "Erro ao carregar Dashboard:",
        error
      );
    } finally {
      setCarregando(false);
    }
  }

  carregarDashboard();
}, []);

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            margin: 0,
            color: "#1f2937",
            fontSize: "28px",
          }}
        >
          Dashboard
        </h1>

        <p
          style={{
            marginTop: "8px",
            color: "#6b7280",
          }}
        >
          Bem-vindo, {usuario.nome}.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
        }}
      >
        <Card
          titulo="Pets cadastrados"
          valor={
            carregando
              ? "..."
              : resumo.pets_cadastrados
          }
          icone="🐾"
        />

        <Card
          titulo="Na creche"
          valor={
            carregando
              ? "..."
              : resumo.na_creche ?? "-"
          }
          icone="🏠"
        />

        <Card
          titulo="No hotel"
          valor={
            carregando
              ? "..."
              : resumo.no_hotel ?? "-"
          }
          icone="🏨"
        />

        <Card
          titulo="Atendimentos hoje"
          valor={
            carregando
              ? "..."
              : resumo.atendimentos_hoje ?? "-"
          }
          icone="✂"
        />

        <Card
          titulo="Estoque baixo"
          valor={
            carregando
              ? "..."
              : resumo.estoque_baixo ?? "-"
          }
          icone="📦"
        />
      </div>
    </div>
  );
}

function Card({ titulo, valor, icone }) {
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "22px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontSize: "28px",
          marginBottom: "15px",
        }}
      >
        {icone}
      </div>

      <div
        style={{
          fontSize: "28px",
          fontWeight: "bold",
          color: "#1f2937",
        }}
      >
        {valor}
      </div>

      <div
        style={{
          marginTop: "5px",
          color: "#6b7280",
          fontSize: "13px",
        }}
      >
        {titulo}
      </div>
    </div>
  );
}

export default Dashboard;