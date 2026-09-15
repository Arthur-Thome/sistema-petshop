function Dashboard() {
  const usuario = JSON.parse(
    localStorage.getItem("usuario") || "{}"
  );

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
        <Card titulo="Pets cadastrados" valor="-" icone="🐾" />

        <Card titulo="Na creche" valor="-" icone="🏠" />

        <Card titulo="No hotel" valor="-" icone="🏨" />

        <Card titulo="Atendimentos hoje" valor="-" icone="✂" />

        <Card titulo="Estoque baixo" valor="-" icone="📦" />
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