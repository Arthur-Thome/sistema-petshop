export const TAMANHO_MAXIMO_FOTO_PET = 5 * 1024 * 1024;

const TIPOS_FOTO_PET = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validarArquivoFotoPet(arquivo) {
  if (!arquivo || !TIPOS_FOTO_PET.has(arquivo.type)) {
    return {
      valido: false,
      mensagem: "Selecione uma imagem JPG, PNG ou WEBP.",
    };
  }

  if (arquivo.size > TAMANHO_MAXIMO_FOTO_PET) {
    return {
      valido: false,
      mensagem: "A imagem deve ter no máximo 5 MB.",
    };
  }

  return { valido: true, mensagem: "" };
}

export function limitarPosicaoFoto(posicao, {
  larguraOriginal,
  alturaOriginal,
  tamanhoArea,
  zoom,
}) {
  if (
    !larguraOriginal || !alturaOriginal || !tamanhoArea
    || !Number.isFinite(zoom) || zoom <= 0
  ) {
    return { x: 0, y: 0 };
  }

  const escala = Math.max(
    tamanhoArea / larguraOriginal,
    tamanhoArea / alturaOriginal,
  ) * zoom;
  const larguraExibida = larguraOriginal * escala;
  const alturaExibida = alturaOriginal * escala;
  const limiteX = Math.max(0, (larguraExibida - tamanhoArea) / 2);
  const limiteY = Math.max(0, (alturaExibida - tamanhoArea) / 2);

  return {
    x: Math.min(limiteX, Math.max(-limiteX, Number(posicao.x) || 0)),
    y: Math.min(limiteY, Math.max(-limiteY, Number(posicao.y) || 0)),
  };
}

export function calcularRecorteFoto({
  larguraOriginal,
  alturaOriginal,
  tamanhoArea,
  zoom,
  posicao,
}) {
  if (
    !larguraOriginal || !alturaOriginal || !tamanhoArea
    || !Number.isFinite(zoom) || zoom <= 0
  ) {
    throw new RangeError("Dimensões inválidas para recortar a foto.");
  }

  const escala = Math.max(
    tamanhoArea / larguraOriginal,
    tamanhoArea / alturaOriginal,
  ) * zoom;
  const posicaoLimitada = limitarPosicaoFoto(posicao, {
    larguraOriginal,
    alturaOriginal,
    tamanhoArea,
    zoom,
  });
  const esquerda = (tamanhoArea - larguraOriginal * escala) / 2 + posicaoLimitada.x;
  const topo = (tamanhoArea - alturaOriginal * escala) / 2 + posicaoLimitada.y;
  const tamanhoOrigem = tamanhoArea / escala;

  return {
    x: Math.min(larguraOriginal - tamanhoOrigem, Math.max(0, -esquerda / escala)),
    y: Math.min(alturaOriginal - tamanhoOrigem, Math.max(0, -topo / escala)),
    tamanho: tamanhoOrigem,
    escala,
    posicao: posicaoLimitada,
  };
}
