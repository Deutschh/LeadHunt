import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001/api", // O /api já fica embutido aqui
});

export default api;