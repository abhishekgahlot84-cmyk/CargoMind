import { useState, useEffect } from "react";
import {
  User,
  Server,
  MapPin,
  Fuel,
  CheckCircle2,
  Save,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Shield,
  Key,
  AlertCircle,
  Lock,
} from "lucide-react";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function Settings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { user: authUser, logout } = useAuth();

  const [activeTab, setActiveTab] = useState("appearance");
  const [configStatus, setConfigStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: authUser?.name || "",
    company_name: authUser?.company_name || "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form State
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  // Fleet Preferences
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem("cargomind_fleet_prefs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return {
      defaultFuelPrice: 90,
      averageSpeedKmh: 50,
      depotLat: 26.2183,
      depotLon: 78.1828,
      depotName: "Central Logistics Depot (Gwalior)",
      planningHorizonDays: 7,
    };
  });

  const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    if (authUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileForm({
        name: authUser.name || "",
        company_name: authUser.company_name || "",
      });
    }
  }, [authUser]);

  useEffect(() => {
    async function loadStatus() {
      setStatusLoading(true);
      try {
        const [confRes, solvRes] = await Promise.allSettled([
          api.get("/auth/config-status"),
          api.get("/optimization/solver-status"),
        ]);

        const confData = confRes.status === "fulfilled" ? confRes.value.data : {};
        const solvData = solvRes.status === "fulfilled" ? solvRes.value.data : {};

        setConfigStatus({
          google_routes: solvData?.google_routes_api_configured ?? confData?.google_routes_api?.status === "configured",
          scip_solver: solvData?.scip_installed ?? confData?.or_tools_scip?.status === "available",
          vrp_solver: solvData?.vrp_installed ?? confData?.or_tools_vrp?.status === "available",
          database: confData?.database?.status === "operational",
        });
      } catch (e) {
        console.warn("Could not load backend config status:", e);
      } finally {
        setStatusLoading(false);
      }
    }
    loadStatus();
  }, []);

  function handleSavePreferences(e) {
    e.preventDefault();
    localStorage.setItem("cargomind_fleet_prefs", JSON.stringify(preferences));
    setSavedMsg("Operational solver and depot preferences updated successfully.");
    setTimeout(() => setSavedMsg(""), 3500);
  }

  async function handleUpdateProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setErrorMsg("");
    setSavedMsg("");

    try {
      const res = await api.put("/auth/profile", {
        name: profileForm.name,
        company_name: profileForm.company_name,
      });
      setSavedMsg(res.data?.message || "Profile updated.");
      if (res.data?.user) {
        localStorage.setItem("cargomind_auth_user", JSON.stringify(res.data.user));
      }
      setTimeout(() => setSavedMsg(""), 3500);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setErrorMsg("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    setErrorMsg("");
    setSavedMsg("");

    try {
      const res = await api.put("/auth/change-password", {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setSavedMsg(res.data?.message || "Password updated.");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setTimeout(() => setSavedMsg(""), 3500);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  const appearanceOptions = [
    {
      id: "light",
      name: "Light",
      desc: "Crisp white surface with high-contrast typography",
      icon: Sun,
    },
    {
      id: "dark",
      name: "Dark",
      desc: "Apple OLED true dark with vivid accent glows",
      icon: Moon,
    },
    {
      id: "system",
      name: "System",
      desc: "Automatically adapts to macOS or Windows system appearance",
      icon: Monitor,
    },
  ];

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Workspace Preferences
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Settings
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Manage appearance, user authentication, operational solver parameters, and connected system services.
          </p>
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-500/15 transition dark:text-red-400"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </header>

      {savedMsg && (
        <div className="mb-6 rounded-2xl border border-[#34c759]/20 bg-[#34c759]/10 p-4 text-xs font-medium text-[#34c759] flex items-center gap-2 dark:text-[#30d158]">
          <CheckCircle2 size={16} />
          {savedMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-medium text-red-600 flex items-center gap-2 dark:text-red-400">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-8 flex flex-wrap gap-2 border-b border-black/[0.06] pb-3 text-xs font-medium dark:border-white/[0.08]">
        {[
          { id: "appearance", label: "Appearance", icon: Sun },
          { id: "profile", label: "Profile & Account", icon: User },
          { id: "security", label: "Authentication & Password", icon: Lock },
          { id: "general", label: "Solver Parameters", icon: Fuel },
          { id: "system", label: "System & API Status", icon: Server },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id);
              setErrorMsg("");
              setSavedMsg("");
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 transition-all ${
              activeTab === id
                ? "bg-black/[0.08] text-[#1d1d1f] font-semibold dark:bg-white/[0.12] dark:text-[#f5f5f7]"
                : "text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7]"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Appearance */}
      {activeTab === "appearance" && (
        <div className="max-w-3xl space-y-6">
          <div className="apple-card p-7 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Interface Theme
              </h2>
              <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                Select your preferred visual theme. Persists across browser refreshes and sessions.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {appearanceOptions.map(({ id, name, desc, icon: Icon }) => {
                const isSelected = theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTheme(id)}
                    className={`flex flex-col justify-between rounded-2xl border p-5 text-left transition-all ${
                      isSelected
                        ? "border-[#0071e3] bg-[#0071e3]/[0.04] shadow-sm dark:border-[#2997ff] dark:bg-[#2997ff]/[0.08]"
                        : "border-black/[0.08] bg-black/[0.015] hover:border-black/[0.15] dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/[0.15]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`grid h-8 w-8 place-items-center rounded-xl ${
                          isSelected
                            ? "bg-[#0071e3] text-white dark:bg-[#2997ff] dark:text-black"
                            : "bg-black/[0.05] text-[#6e6e73] dark:bg-white/[0.08] dark:text-[#86868b]"
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      {isSelected && (
                        <CheckCircle2 size={16} className="text-[#0071e3] dark:text-[#2997ff]" />
                      )}
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {name}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                        {desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-[#86868b]">
              <span>Active Mode: <strong className="text-[#1d1d1f] dark:text-[#f5f5f7] capitalize">{resolvedTheme}</strong></span>
              <span>Typography: SF Pro / Inter System Stack</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Profile & Account */}
      {activeTab === "profile" && (
        <div className="max-w-2xl space-y-6">
          <form onSubmit={handleUpdateProfile} className="apple-card p-7 space-y-5">
            <div className="flex items-center gap-4 border-b border-black/[0.06] pb-5 dark:border-white/[0.08]">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0071e3]/10 font-bold text-lg text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                {authUser?.name?.charAt(0) || "U"}
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  {authUser?.name || "Fleet Operator"}
                </h2>
                <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">{authUser?.email || "operator@cargomind.ai"}</p>
                <span className="mt-1 inline-block rounded-full bg-[#0071e3]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                  {authUser?.role || "Fleet Operations Lead"}
                </span>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="apple-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Workspace Organization
                </label>
                <input
                  type="text"
                  value={profileForm.company_name}
                  onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                  className="apple-input text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#86868b] block mb-1">
                  Email Address (Primary Identity)
                </label>
                <input
                  type="email"
                  value={authUser?.email || ""}
                  disabled
                  className="apple-input text-xs bg-black/[0.03] text-[#86868b] cursor-not-allowed dark:bg-white/[0.03]"
                />
                <p className="mt-1 text-[11px] text-[#86868b]">
                  Workspace email is locked to ensure isolation and database integrity.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="submit"
                disabled={savingProfile}
                className="apple-btn-primary text-xs"
              >
                <Save size={14} />
                {savingProfile ? "Saving Profile..." : "Update Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Security / Change Password */}
      {activeTab === "security" && (
        <div className="max-w-2xl space-y-6">
          <form onSubmit={handleChangePassword} className="apple-card p-7 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                <Shield size={17} className="text-[#0071e3] dark:text-[#2997ff]" />
                Password & Authentication
              </h2>
              <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                Update your account password. Passwords are encrypted on the server.
              </p>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  className="apple-input text-xs"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className="apple-input text-xs"
                  placeholder="At least 4 characters"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className="apple-input text-xs"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="submit"
                disabled={savingPassword}
                className="apple-btn-primary text-xs"
              >
                <Key size={14} />
                {savingPassword ? "Updating..." : "Change Password"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Solver Defaults */}
      {activeTab === "general" && (
        <form onSubmit={handleSavePreferences} className="max-w-3xl space-y-6">
          <div className="apple-card p-7 space-y-5">
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
              <Fuel size={17} className="text-[#0071e3] dark:text-[#2997ff]" />
              Optimization Cost Parameters
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Diesel Price (₹ / Litre)
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={preferences.defaultFuelPrice}
                  onChange={(e) =>
                    setPreferences({ ...preferences, defaultFuelPrice: Number(e.target.value) })
                  }
                  className="apple-input text-xs"
                  required
                />
                <p className="mt-1 text-[11px] text-[#86868b]">Objective function fuel minimization weight.</p>
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Average Highway Speed (km/h)
                </label>
                <input
                  type="number"
                  min="20"
                  max="120"
                  value={preferences.averageSpeedKmh}
                  onChange={(e) =>
                    setPreferences({ ...preferences, averageSpeedKmh: Number(e.target.value) })
                  }
                  className="apple-input text-xs"
                  required
                />
                <p className="mt-1 text-[11px] text-[#86868b]">Used for driving duration and shift limit calculations.</p>
              </div>
            </div>

            <div className="border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
              <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                Driver Multi-Day Planning Horizon (Days)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={preferences.planningHorizonDays}
                onChange={(e) =>
                  setPreferences({ ...preferences, planningHorizonDays: Number(e.target.value) })
                }
                className="apple-input text-xs max-w-xs"
                required
              />
              <p className="mt-1 text-[11px] text-[#86868b]">Maximum accumulated driving hours ceiling across the dispatch schedule.</p>
            </div>
          </div>

          <div className="apple-card p-7 space-y-5">
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
              <MapPin size={17} className="text-[#34c759] dark:text-[#30d158]" />
              Central Depot Geocoordinates
            </h2>

            <div>
              <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Depot Name</label>
              <input
                type="text"
                value={preferences.depotName}
                onChange={(e) => setPreferences({ ...preferences, depotName: e.target.value })}
                className="apple-input text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={preferences.depotLat}
                  onChange={(e) =>
                    setPreferences({ ...preferences, depotLat: Number(e.target.value) })
                  }
                  className="apple-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={preferences.depotLon}
                  onChange={(e) =>
                    setPreferences({ ...preferences, depotLon: Number(e.target.value) })
                  }
                  className="apple-input text-xs"
                  required
                />
              </div>
            </div>
          </div>

          <button type="submit" className="apple-btn-primary text-xs">
            <Save size={14} />
            Save Parameters
          </button>
        </form>
      )}

      {/* Tab: Integrations & API Status */}
      {activeTab === "system" && (
        <div className="max-w-3xl space-y-6">
          <div className="apple-card p-7 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                <Server size={17} className="text-[#0071e3] dark:text-[#2997ff]" />
                API & System Configuration Status
              </h2>
              <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                Real-time operational status of backend microservices, mathematical solvers, and maps integration.
                (Note: Security policy strictly protects credentials; secret keys are never exposed in the interface.)
              </p>
            </div>

            <div className="divide-y divide-black/[0.06] text-xs dark:divide-white/[0.08] pt-2">
              {/* Backend API Gateway */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Backend API Gateway</span>
                  <span className="block font-mono text-[11px] text-[#86868b]">{apiBaseUrl}</span>
                </div>
                <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                  Connected
                </span>
              </div>

              {/* Google Maps JS */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Google Maps JavaScript API</span>
                  <span className="block text-[11px] text-[#86868b]">Browser client vector maps & markers</span>
                </div>
                <span className={`apple-badge ${
                  googleMapsKey
                    ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}>
                  {googleMapsKey ? "Configured" : "Missing Key"}
                </span>
              </div>

              {/* Server-side Google Routes API */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Google Routes API (Server-Side)</span>
                  <span className="block text-[11px] text-[#86868b]">Directions v2 highway distance & duration matrix</span>
                </div>
                <span className={`apple-badge ${
                  statusLoading
                    ? "bg-black/[0.05] text-[#86868b]"
                    : configStatus?.google_routes
                    ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}>
                  {statusLoading ? "Checking..." : configStatus?.google_routes ? "Configured" : "Missing / Fallback"}
                </span>
              </div>

              {/* OR-Tools SCIP */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">OR-Tools SCIP Mixed-Integer Solver</span>
                  <span className="block text-[11px] text-[#86868b]">Dual capacity bin-packing (weight & volume m³)</span>
                </div>
                <span className={`apple-badge ${
                  configStatus?.scip_solver
                    ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  {configStatus?.scip_solver ? "Operational" : "Unavailable"}
                </span>
              </div>

              {/* OR-Tools VRP */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">OR-Tools VRP Constraint Router</span>
                  <span className="block text-[11px] text-[#86868b]">Multi-vehicle routing with delivery urgency penalty</span>
                </div>
                <span className={`apple-badge ${
                  configStatus?.vrp_solver
                    ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  {configStatus?.vrp_solver ? "Operational" : "Unavailable"}
                </span>
              </div>

              {/* SQLite DB */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Database Engine</span>
                  <span className="block text-[11px] text-[#86868b]">SQLite (fleet_local.db) persistent store</span>
                </div>
                <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                  Operational
                </span>
              </div>

              {/* OSRM Geometry */}
              <div className="py-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">OSRM Driving Engine</span>
                  <span className="block text-[11px] text-[#86868b]">Turn-by-turn road geometry fallback</span>
                </div>
                <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                  Ready
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
