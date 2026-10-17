export default function FotoPetExibicao({ nome, src, temFoto, carregando = false }) {
  if (src) {
    return <img className="solicitacao-pet-foto" src={src} alt={`Fotografia de ${nome}`} />;
  }

  const mensagem = !temFoto
    ? "Sem fotografia cadastrada"
    : carregando
      ? "Carregando fotografia…"
      : "Fotografia indisponível";

  return <div className="solicitacao-pet-foto-vazia" role="status">{mensagem}</div>;
}
