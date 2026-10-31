import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach Authorization Bearer token to all requests if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cargomind_auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cargomind_auth_token");
      localStorage.removeItem("cargomind_auth_user");
      // Only redirect if on a protected route
      const publicPaths = ["/", "/login"];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = "/login?expired=true";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
