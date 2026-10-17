export function preverSaidaEstoque(saldoAtual, quantidadeSolicitada) {
  const saldoDisponivel = Number(saldoAtual);
  const quantidade = Number(quantidadeSolicitada);

  if (
    !Number.isFinite(saldoDisponivel) ||
    saldoDisponivel < 0 ||
    !Number.isInteger(quantidade) ||
    quantidade <= 0
  ) {
    return {
      status: "quantidade-invalida",
      saldoDisponivel,
      quantidadeSolicitada: quantidade,
      saldoPrevisto: null,
    };
  }

  if (quantidade > saldoDisponivel) {
    return {
      status: "estoque-insuficiente",
      saldoDisponivel,
      quantidadeSolicitada: quantidade,
      saldoPrevisto: null,
    };
  }

  return {
    status: "valida",
    saldoDisponivel,
    quantidadeSolicitada: quantidade,
    saldoPrevisto: saldoDisponivel - quantidade,
  };
}
