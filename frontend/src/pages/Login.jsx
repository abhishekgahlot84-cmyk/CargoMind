import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Truck,
  ArrowRight,
  Shield,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  User as UserIcon,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const {
    loginWithCredentials,
    registerWithCredentials,
    loginWithGoogleCredential,
    triggerGoogleSignIn,
    googleClientId,
    isAuthenticated,
  } = useAuth();

  const [isSignUp, setIsSignUp] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "signup";
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleBtnRendered, setGoogleBtnRendered] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("expired") ? "Your session expired. Please sign in again." : "";
  });

  const redirectPath = new URLSearchParams(location.search).get("redirect") || "/dashboard";

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectPath]);

  const handleGoogleCredentialResponse = useCallback(async (response) => {
    if (!response?.credential) {
      setError("Google authentication was cancelled or returned no credentials.");
      return;
    }

    try {
      setGoogleLoading(true);
      setError("");
      await loginWithGoogleCredential(response.credential);
      navigate(redirectPath, { replace: true });
    } catch (err) {
      console.error("Google auth error:", err);
      if (err.isConfigError) {
        setError(err.message);
      } else if (err.response) {
        setError(
          err.response.data?.detail || "Google verification failed on backend."
        );
      } else if (err.code === "ERR_NETWORK" || err.message?.includes("Network Error")) {
        setError(
          "Unable to connect to the CargoMind backend server for Google verification. Please verify network and CORS settings."
        );
      } else {
        setError(err.message || "Google verification failed. Could not communicate with server.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogleCredential, navigate, redirectPath]);

  useEffect(() => {
    if (googleClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
        });
        const container = document.getElementById("google-signin-btn");
        if (container) {
          container.innerHTML = "";
          const containerWidth = Math.min(Math.max(container.offsetWidth || 340, 240), 400);
          window.google.accounts.id.renderButton(container, {
            theme: resolvedTheme === "dark" ? "filled_black" : "outline",
            size: "large",
            width: containerWidth,
            text: isSignUp ? "signup_with" : "signin_with",
            shape: "pill",
          });
          setGoogleBtnRendered(true);
        }
      } catch (err) {
        console.error("GIS initialization error:", err);
        setGoogleBtnRendered(false);
      }
    }
  }, [googleClientId, handleGoogleCredentialResponse, resolvedTheme, isSignUp]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    if (isSignUp && !name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      if (isSignUp) {
        await registerWithCredentials(name, email, password);
      } else {
        await loginWithCredentials(email, password);
      }
      navigate(redirectPath, { replace: true });
    } catch (err) {
      console.error("Auth error:", err);
      if (err.isConfigError) {
        setError(err.message);
      } else if (err.response) {
        if (err.response.status === 401) {
          setError(
            err.response.data?.detail || "Invalid email or password. Please verify your credentials and try again."
          );
        } else if (err.response.status === 400) {
          setError(
            err.response.data?.detail || "Bad request. Please verify your submitted information."
          );
        } else {
          setError(
            err.response.data?.detail || `Server error (${err.response.status}). Please try again later.`
          );
        }
      } else if (err.code === "ERR_NETWORK" || err.message?.includes("Network Error")) {
        setError(
          "Unable to connect to the CargoMind backend server. Please verify your network connection and CORS settings."
        );
      } else {
        setError(
          err.message || "Authentication failed. Could not communicate with the backend server."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin() {
    setIsSignUp(false);
    setEmail("admin@cargomind.ai");
    setPassword("admin");
    setTimeout(() => {
      document.getElementById("auth-form-submit")?.click();
    }, 100);
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col justify-between py-6 px-4 sm:px-6 font-sans selection:bg-[#0071e3] selection:text-white dark:bg-[#000000] dark:text-[#f5f5f7] relative overflow-x-hidden">
      {/* Ambient Gradient Mesh Background Glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[380px] bg-gradient-to-tr from-[#0071e3]/20 via-[#6366f1]/15 to-[#af52de]/10 blur-[100px] rounded-full dark:from-[#2997ff]/15 dark:via-[#6366f1]/15 dark:to-[#af52de]/15" />

      {/* Header - Stays neatly padded inside the viewport */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between pt-2 pb-4 shrink-0 relative z-10">
        <Link to="/" className="flex items-center gap-2.5 group focus:outline-none">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#1d1d1f] text-white shadow-sm dark:bg-[#f5f5f7] dark:text-[#1d1d1f] transition-transform group-hover:scale-105">
            <Truck size={17} />
          </div>
          <span className="font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7] text-base">
            CargoMind
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle variant="segmented" />
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7] transition"
          >
            <ArrowLeft size={13} />
            <span>Back to site</span>
          </Link>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="w-full max-w-md mx-auto my-auto py-2 flex items-center justify-center relative z-10">
        <div className="apple-card w-full p-6 sm:p-8 shadow-2xl bg-white dark:bg-[#161618] border border-black/[0.08] dark:border-white/[0.1] rounded-3xl">
          {/* Sign In vs Sign Up Tab Switcher */}
          <div className="flex p-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setError("");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${!isSignUp
                  ? "bg-white text-[#1d1d1f] shadow-sm dark:bg-[#2c2c2e] dark:text-[#f5f5f7]"
                  : "text-[#6e6e73] dark:text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setError("");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${isSignUp
                  ? "bg-white text-[#1d1d1f] shadow-sm dark:bg-[#2c2c2e] dark:text-[#f5f5f7]"
                  : "text-[#6e6e73] dark:text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
                }`}
            >
              Sign Up
            </button>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
              {isSignUp ? "Create your account" : "Sign in to CargoMind"}
            </h1>
            <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
              {isSignUp
                ? "Join the fleet optimization and dispatch intelligence workspace."
                : "Access fleet dispatch, live telemetry, and mathematical solver."}
            </p>
          </div>

          {infoMessage && (
            <div className="mb-4 rounded-xl border border-[#0071e3]/20 bg-[#0071e3]/10 p-3 text-xs text-[#0071e3] flex items-center gap-2 dark:text-[#2997ff]">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 flex items-start gap-2 dark:text-red-400">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Google Sign-In / Sign-Up */}
          <div className="space-y-3">
            <div id="google-signin-btn" className="w-full flex justify-center min-h-[44px]"></div>

            {/* Fallback button if Google GIS button is not rendered yet */}
            {!googleBtnRendered && (
              <button
                type="button"
                onClick={triggerGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-2.5 rounded-full border border-black/10 bg-white/60 py-2.5 px-4 text-xs font-semibold text-[#1d1d1f] shadow-sm hover:bg-white hover:border-black/20 dark:border-white/15 dark:bg-[#1c1c1e]/60 dark:text-[#f5f5f7] dark:hover:bg-[#2c2c2e] transition cursor-pointer"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{isSignUp ? "Sign up with Google" : "Sign in with Google"}</span>
              </button>
            )}

            <div className="relative my-5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/[0.08] dark:border-white/[0.08]"></div>
              </div>
              <span className="relative z-10 bg-white dark:bg-[#161618] px-3 text-[10px] uppercase tracking-wider text-[#86868b] font-medium">
                {isSignUp ? "or register with email" : "or continue with email"}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1.5">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none z-10" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Abhishek Gahlot"
                    required={isSignUp}
                    className="apple-input apple-input-with-icon h-11 pr-4 text-xs sm:text-sm"
                    style={{ paddingLeft: "2.75rem" }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1.5">
                Work Email
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none z-10" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cargomind.ai"
                  required
                  className="apple-input apple-input-with-icon h-11 pr-4 text-xs sm:text-sm"
                  style={{ paddingLeft: "2.75rem" }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none z-10" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="apple-input apple-input-with-icon h-11 pr-4 text-xs sm:text-sm"
                  style={{ paddingLeft: "2.75rem" }}
                />
              </div>
            </div>

            <button
              id="auth-form-submit"
              type="submit"
              disabled={loading || googleLoading}
              className="apple-btn-primary w-full h-11 text-xs font-semibold cursor-pointer shadow-md mt-2"
            >
              {loading ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? "Create Account" : "Sign In"}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Demo Login Shortcut or Sign in/up toggle */}
          <div className="mt-5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] text-center space-y-2">
            {!isSignUp ? (
              <>
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="text-xs text-[#0071e3] hover:underline font-medium transition dark:text-[#2997ff] cursor-pointer block mx-auto"
                >
                  Fill Demo Credentials (admin@cargomind.ai)
                </button>
                <p className="text-xs text-[#86868b]">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(true); setError(""); }}
                    className="text-[#0071e3] dark:text-[#2997ff] font-medium hover:underline cursor-pointer"
                  >
                    Sign Up
                  </button>
                </p>
              </>
            ) : (
              <p className="text-xs text-[#86868b]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setIsSignUp(false); setError(""); }}
                  className="text-[#0071e3] dark:text-[#2997ff] font-medium hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-[#86868b] shrink-0 pt-2 pb-2 relative z-10">
        CargoMind · Fleet Intelligence & Mathematical Optimization
      </footer>
    </div>
  );
}
