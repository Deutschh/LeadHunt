import axios from "axios";

// Pega a URL da Vercel (Render) ou usa o localhost se estiver em casa
const baseURL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : "http://localhost:3001/api";

const api = axios.create({
  baseURL: baseURL,
});

export default api;