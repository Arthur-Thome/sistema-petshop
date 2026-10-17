import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularRecorteFoto,
  limitarPosicaoFoto,
  TAMANHO_MAXIMO_FOTO_PET,
  validarArquivoFotoPet,
} from "../src/utils/fotoPetEditor.js";

test("aceita JPG, PNG e WEBP até 5 MB e rejeita tipo/tamanho inválidos", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validarArquivoFotoPet({ type, size: TAMANHO_MAXIMO_FOTO_PET }).valido, true);
  }
  assert.equal(validarArquivoFotoPet({ type: "image/gif", size: 10 }).valido, false);
  assert.equal(validarArquivoFotoPet({ type: "image/png", size: TAMANHO_MAXIMO_FOTO_PET + 1 }).valido, false);
});

test("calcula recorte quadrado central e acompanha zoom", () => {
  const central = calcularRecorteFoto({
    larguraOriginal: 1200,
    alturaOriginal: 800,
    tamanhoArea: 400,
    zoom: 1,
    posicao: { x: 0, y: 0 },
  });
  assert.deepEqual({ x: central.x, y: central.y, tamanho: central.tamanho }, { x: 200, y: 0, tamanho: 800 });

  const zoomed = calcularRecorteFoto({
    larguraOriginal: 1200,
    alturaOriginal: 800,
    tamanhoArea: 400,
    zoom: 2,
    posicao: { x: 0, y: 0 },
  });
  assert.deepEqual({ x: zoomed.x, y: zoomed.y, tamanho: zoomed.tamanho }, { x: 400, y: 200, tamanho: 400 });
});

test("limita o arraste aos limites da imagem e centralização volta a zero", () => {
  const arrastada = limitarPosicaoFoto(
    { x: 5000, y: -5000 },
    { larguraOriginal: 1200, alturaOriginal: 800, tamanhoArea: 400, zoom: 1 },
  );
  assert.deepEqual(arrastada, { x: 100, y: -0 });
  assert.deepEqual(
    limitarPosicaoFoto({ x: 0, y: 0 }, { larguraOriginal: 1200, alturaOriginal: 800, tamanhoArea: 400, zoom: 1 }),
    { x: 0, y: 0 },
  );
});
