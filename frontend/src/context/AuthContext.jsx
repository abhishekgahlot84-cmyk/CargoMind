/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("cargomind_auth_token"));
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("cargomind_auth_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [oauthNotice, setOauthNotice] = useState(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (token) {
      localStorage.setItem("cargomind_auth_token", token);
      // Immediately refresh active user profile & workspace from backend to avoid stale cache
      api
        .get("/auth/me")
        .then((res) => {
          if (res.data?.id) {
            setUser(res.data);
            localStorage.setItem("cargomind_auth_user", JSON.stringify(res.data));
          }
        })
        .catch((err) => {
          console.warn("Could not sync /auth/me:", err);
        });
    } else {
      localStorage.removeItem("cargomind_auth_token");
      localStorage.removeItem("cargomind_auth_user");
    }
  }, [token]);

  const loginWithCredentials = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { access_token, user: loggedUser } = res.data;
    setToken(access_token);
    setUser(loggedUser);
    localStorage.setItem("cargomind_auth_token", access_token);
    localStorage.setItem("cargomind_auth_user", JSON.stringify(loggedUser));
    return loggedUser;
  };

  const registerWithCredentials = async (name, email, password) => {
    const res = await api.post("/auth/register", { name, email, password });
    const { access_token, user: loggedUser } = res.data;
    setToken(access_token);
    setUser(loggedUser);
    localStorage.setItem("cargomind_auth_token", access_token);
    localStorage.setItem("cargomind_auth_user", JSON.stringify(loggedUser));
    return loggedUser;
  };

  const loginWithGoogleCredential = async (credential) => {
    const res = await api.post("/auth/google", { credential });
    const { access_token, user: loggedUser } = res.data;
    setToken(access_token);
    setUser(loggedUser);
    localStorage.setItem("cargomind_auth_token", access_token);
    localStorage.setItem("cargomind_auth_user", JSON.stringify(loggedUser));
    return loggedUser;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("cargomind_auth_token");
    localStorage.removeItem("cargomind_auth_user");
  };

  const triggerGoogleSignIn = useCallback(() => {
    if (!googleClientId) {
      setOauthNotice({
        title: "Google OAuth Configuration Required",
        message:
          "Google OAuth is not configured in this environment (missing VITE_GOOGLE_CLIENT_ID). Please provide a Google Client ID in your .env or sign in with work email credentials.",
      });
      return;
    }

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (response?.credential) {
              try {
                await loginWithGoogleCredential(response.credential);
                window.location.href = "/dashboard";
              } catch (err) {
                setOauthNotice({
                  title: "Authentication Failed",
                  message: err.response?.data?.detail || "Google verification failed on the backend.",
                });
              }
            }
          },
        });
        window.google.accounts.id.prompt();
      } catch (err) {
        setOauthNotice({
          title: "Google Sign-In Error",
          message: err.message || "Failed to initialize Google Sign-In prompt.",
        });
      }
    } else {
      setOauthNotice({
        title: "Google Service Unavailable",
        message: "Google Identity Services script is loading or blocked by your browser. Please use standard email login.",
      });
    }
  }, [googleClientId]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token),
        googleClientId,
        loginWithCredentials,
        registerWithCredentials,
        loginWithGoogleCredential,
        logout,
        triggerGoogleSignIn,
        oauthNotice,
        clearOauthNotice: () => setOauthNotice(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
