/*
 * Centraliza as regras de validação de senha.
 *
 * Manter essa regra em um único arquivo evita que cadastro,
 * recuperação e redefinição administrativa utilizem critérios
 * diferentes no futuro.
 *
 * O limite máximo é verificado em bytes UTF-8, e não apenas
 * pela quantidade de caracteres.
 */
function validarSenha(senha) {
  if (typeof senha !== "string") {
    return {
      valida: false,
      mensagem: "A senha é obrigatória.",
    };
  }

  if (senha.length < 8) {
    return {
      valida: false,
      mensagem:
        "A senha deve possuir pelo menos 8 caracteres.",
    };
  }

  const tamanhoEmBytes =
    Buffer.byteLength(senha, "utf8");

  if (tamanhoEmBytes > 72) {
    return {
      valida: false,
      mensagem:
        "A senha deve possuir no máximo 72 bytes.",
    };
  }

  return {
    valida: true,
    mensagem: null,
  };
}

module.exports = {
  validarSenha,
};