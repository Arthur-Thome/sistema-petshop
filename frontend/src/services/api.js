import axios from "axios";

// Instância central do Axios.
// A URL da API vem do .env para permitir ambientes diferentes
// sem alterar o código-fonte.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Inclui automaticamente o JWT nas requisições autenticadas.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;