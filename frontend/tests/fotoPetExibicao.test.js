import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("detalhes da solicitacao exibem foto sintetica e estado vazio acessivel", async () => {
  const vite = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });

  try {
    const { default: FotoPetExibicao } = await vite.ssrLoadModule("/src/components/FotoPetExibicao.jsx");
    const imagemSintetica = `data:image/png;base64,${Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ).toString("base64")}`;

    const markupComFoto = renderToStaticMarkup(React.createElement(FotoPetExibicao, {
      nome: "Pet Sintetico HML",
      src: imagemSintetica,
      temFoto: true,
    }));
    assert.match(markupComFoto, /<img[^>]+alt="Fotografia de Pet Sintetico HML"/);
    assert.ok(markupComFoto.includes(imagemSintetica));

    const markupVazio = renderToStaticMarkup(React.createElement(FotoPetExibicao, {
      nome: "Pet sem foto",
      src: "",
      temFoto: false,
    }));
    assert.match(markupVazio, /role="status"/);
    assert.match(markupVazio, /Sem fotografia cadastrada/);
  } finally {
    await vite.close();
  }
});
