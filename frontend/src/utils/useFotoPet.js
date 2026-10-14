import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const BACKEND_URL = API_URL.replace(/\/api\/?$/, "");

export function useFotoPet(foto) {
  const [imagem, setImagem] = useState({ foto: null, src: "" });
  const token = localStorage.getItem("token") || sessionStorage.getItem("amores_pet_token_cliente");

  useEffect(() => {
    let urlTemporaria = "";
    let cancelado = false;
    if (!foto) return undefined;
    const caminho = foto.startsWith("/") ? foto : `/${foto}`;
    if (!caminho.startsWith("/uploads/pets/")) return undefined;
    if (!token) return undefined;

    fetch(`${BACKEND_URL}${caminho}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error("Foto indisponível");
        return response.blob();
      })
      .then((blob) => {
        if (cancelado) return;
        urlTemporaria = URL.createObjectURL(blob);
        setImagem({ foto, token, src: urlTemporaria });
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
    };
  }, [foto, token]);

  if (!foto) return "";
  return imagem.foto === foto && imagem.token === token ? imagem.src : "";
}
