import { useEffect, useState } from "react";
import { resolverBaseApi } from "./resolverBaseApi";

const API_URL = resolverBaseApi(
  import.meta.env.VITE_API_URL,
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
);
const BACKEND_URL = API_URL.replace(/\/api\/?$/, "");

export function useFotoPetEstado(foto) {
  const token = typeof localStorage !== "undefined"
    ? localStorage.getItem("token") || sessionStorage.getItem("amores_pet_token_cliente")
    : null;
  const [imagem, setImagem] = useState({ foto: null, token: null, src: "", loading: false, error: false });

  useEffect(() => {
    let urlTemporaria = "";
    let cancelado = false;
    if (!foto) return undefined;
    const caminho = foto.startsWith("/") ? foto : `/${foto}`;
    if (!caminho.startsWith("/uploads/pets/") || !token) return undefined;
    fetch(`${BACKEND_URL}${caminho}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Foto indisponível");
        return response.blob();
      })
      .then((blob) => {
        if (cancelado) return;
        urlTemporaria = URL.createObjectURL(blob);
        setImagem({ foto, token, src: urlTemporaria, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelado) setImagem({ foto, token, src: "", loading: false, error: true });
      });

    return () => {
      cancelado = true;
      if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
    };
  }, [foto, token]);

  if (!foto) return { src: "", loading: false, error: false };
  const caminho = foto.startsWith("/") ? foto : `/${foto}`;
  if (!caminho.startsWith("/uploads/pets/") || !token) {
    return { src: "", loading: false, error: true };
  }
  return imagem.foto === foto && imagem.token === token
    ? { src: imagem.src, loading: imagem.loading, error: imagem.error }
    : { src: "", loading: true, error: false };
}

export function useFotoPet(foto) {
  return useFotoPetEstado(foto).src;
}
