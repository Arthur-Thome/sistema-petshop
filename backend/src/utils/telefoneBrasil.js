const DDD_BRASILEIROS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28", "31", "32", "33", "34", "35",
  "37", "38", "41", "42", "43", "44", "45", "46", "47", "48",
  "49", "51", "53", "54", "55", "61", "62", "63", "64", "65",
  "66", "67", "68", "69", "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89", "91",
  "92", "93", "94", "95", "96", "97", "98", "99",
]);

const UFS_BRASIL = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
);

function somenteDigitosTelefone(valor) {
  return typeof valor === "string" ? valor.replace(/\D/g, "") : "";
}

/** Valida estrutura brasileira sem exigir que números existentes sejam migrados. */
function validarTelefoneBrasil(valor) {
  const digitos = somenteDigitosTelefone(valor);

  if (digitos.length !== 10 && digitos.length !== 11) return false;
  if (!DDD_BRASILEIROS.has(digitos.slice(0, 2))) return false;
  if (/^(\d)\1+$/.test(digitos)) return false;

  // Telefone fixo possui assinante iniciado por 2–5. Celular atual usa 9.
  // Prefixos móveis antigos de oito dígitos (6–9) continuam aceitos.
  const assinante = digitos.slice(2);
  if (digitos.length === 11) return assinante[0] === "9" && !/^9{9}$/.test(assinante);
  return /^[2-9]/.test(assinante) && !/^([2-9])\1{7}$/.test(assinante);
}

function validarEmailOpcional(email) {
  if (typeof email !== "string" || !email.trim()) return true;
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  DDD_BRASILEIROS,
  UFS_BRASIL,
  somenteDigitosTelefone,
  validarTelefoneBrasil,
  validarEmailOpcional,
};
