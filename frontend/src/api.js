import axios from "axios";

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const BACKEND_URL = isLocal
  ? "http://localhost:4001"
  : import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
});

export default api;