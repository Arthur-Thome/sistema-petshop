export function classificarFalhaApi(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return "sessao-invalida";
  return "api-indisponivel";
}
