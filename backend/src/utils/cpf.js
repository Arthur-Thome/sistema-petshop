// Remove qualquer formatação e mantém somente os números do CPF.
function somenteNumerosCPF(cpf) {
  if (!cpf) {
    return "";

  }

  return String(cpf).replace(/\D/g, "");
}


// Valida os dígitos verificadores de um CPF.
// Essa validação verifica a estrutura matemática do número;
// ela não consulta a situação cadastral do CPF em órgãos externos.
function validarCPF(cpf) {
  const numeros = somenteNumerosCPF(cpf);

  if (numeros.length !== 11) {
    return false;
  }

  // CPFs compostos pelo mesmo número não são válidos.
  if (/^(\d)\1{10}$/.test(numeros)) {
    return false;
  }

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += Number(numeros[i]) * (10 - i);
  }

  let primeiroDigito = (soma * 10) % 11;

  if (primeiroDigito === 10) {
    primeiroDigito = 0;
  }

  if (primeiroDigito !== Number(numeros[9])) {
    return false;
  }

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += Number(numeros[i]) * (11 - i);
  }

  let segundoDigito = (soma * 10) % 11;

  if (segundoDigito === 10) {
    segundoDigito = 0;
  }

  return segundoDigito === Number(numeros[10]);
}


// Padroniza o CPF no formato que será armazenado no banco.
// Exemplo: 12345678909 -> 123.456.789-09
function formatarCPF(cpf) {
  const numeros = somenteNumerosCPF(cpf);

  if (numeros.length !== 11) {
    return cpf;
  }

  return numeros.replace(
    /(\d{3})(\d{3})(\d{3})(\d{2})/,
    "$1.$2.$3-$4"
  );
}


module.exports = {
  somenteNumerosCPF,
  validarCPF,
  formatarCPF,
};