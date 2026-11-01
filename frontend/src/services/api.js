import axios from "axios";

/**
 * Resolve the API base URL:
 * - If VITE_API_BASE_URL is provided, use it.
 * - In local development (import.meta.env.DEV), fall back to "http://127.0.0.1:8000".
 * - In production (import.meta.env.PROD), do NOT silently fall back to localhost.
 */
function getApiBaseURL() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // Local development default fallback
  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8000";
  }

  // Production: return empty string so requests do not silently hit localhost:8000
  console.error(
    "[CargoMind Configuration Error] VITE_API_BASE_URL is missing in this production deployment. " +
    "Please configure VITE_API_BASE_URL in your Vercel Project Settings (e.g. https://cargomind-ijgp.onrender.com) and redeploy."
  );
  return "";
}

const api = axios.create({
  baseURL: getApiBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
});

// Guard against missing production API URL and attach Bearer token
api.interceptors.request.use((config) => {
  // If in production and VITE_API_BASE_URL is missing, fail clearly with a descriptive error
  if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
    const configError = new Error(
      "Backend API URL (VITE_API_BASE_URL) is not configured in this production deployment. " +
      "Please set VITE_API_BASE_URL in Vercel project environment variables and redeploy."
    );
    configError.isConfigError = true;
    return Promise.reject(configError);
  }

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
