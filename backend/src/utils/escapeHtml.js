/*
 * Escapa caracteres especiais antes de inserir textos
 * dinâmicos em conteúdo HTML.
 *
 * Isso evita que dados cadastrados por usuários sejam
 * interpretados como tags ou atributos HTML.
 */
function escapeHtml(valor) {
  if (typeof valor !== "string") {
    return "";
  }

  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  escapeHtml,
};