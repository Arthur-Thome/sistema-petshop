export function resolverEstadoLista({ carregando, erro, quantidade }) {
  if (carregando) return "carregando";
  if (erro) return "erro";
  return quantidade > 0 ? "dados" : "vazio";
}

export function extrairSolicitacoes(data) {
  if (!data || !Array.isArray(data.solicitacoes)) {
    throw new TypeError("Resposta inválida ao carregar solicitações.");
  }
  return data.solicitacoes;
}
