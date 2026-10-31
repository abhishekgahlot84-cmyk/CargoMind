import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Truck,
  LayoutDashboard,
  Users,
  Package,
  Route,
  MapPin,
  Sparkles,
  Warehouse,
  UserCheck,
  Settings as SettingsIcon,
  LogOut,
  ChevronRight,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";

const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Fleet & Trucks", path: "/trucks", icon: Truck },
  { label: "Drivers", path: "/drivers", icon: Users },
  { label: "Hubs & Warehouses", path: "/hubs", icon: Warehouse },
  { label: "Driver Handovers", path: "/handovers", icon: UserCheck },
  { label: "Consignments", path: "/orders", icon: Package },
  { label: "Trip Expeditions", path: "/trips", icon: Route },
  { label: "GPS Tracking", path: "/gps-tracking", icon: MapPin },
  { label: "Optimization Solver", path: "/optimization", icon: Sparkles },
];

export default function Layout() {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/");
  }


  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] dark:bg-[#000000] dark:text-[#f5f5f7] md:flex">
      {/* Sidebar Navigation */}
      <aside className="w-full shrink-0 border-b border-black/[0.08] bg-white/70 backdrop-blur-xl p-5 md:min-h-screen md:w-64 md:border-b-0 md:border-r dark:border-white/[0.08] dark:bg-[#161618]/70 flex flex-col justify-between">
        <div>
          {/* Brand Identity */}
          <div className="mb-7 flex items-center justify-between">
            <NavLink
              to="/dashboard"
              className="flex items-center gap-2.5 rounded-xl transition hover:opacity-85 focus:outline-none"
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#1d1d1f] text-white shadow-sm dark:bg-[#f5f5f7] dark:text-[#1d1d1f]">
                <Truck size={18} />
              </div>

              <div>
                <span className="text-base font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                  CargoMind
                </span>
                <span className="block text-[11px] font-normal text-[#86868b]">
                  Fleet Intelligence
                </span>
              </div>
            </NavLink>

            {/* Compact Theme Control in Sidebar Header */}
            <ThemeToggle variant="compact" />
          </div>

          <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider uppercase text-[#86868b]">
            Platform
          </div>

          {/* Navigation Links */}
          <nav className="grid grid-cols-2 gap-1 md:grid-cols-1">
            {navigation.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={label}
                to={path}
                className={({ isActive }) =>
                  `group flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-black/[0.06] text-[#1d1d1f] font-semibold dark:bg-white/[0.1] dark:text-[#f5f5f7]"
                      : "text-[#6e6e73] hover:bg-black/[0.03] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:bg-white/[0.05] dark:hover:text-[#f5f5f7]"
                  }`
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} className="shrink-0" />
                  <span>{label}</span>
                </div>
                <ChevronRight
                  size={13}
                  className="opacity-0 transition-opacity group-hover:opacity-60 md:block hidden"
                />
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User Footer Profile & Settings */}
        <div className="mt-8 border-t border-black/[0.06] pt-4 dark:border-white/[0.08] space-y-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                isActive
                  ? "bg-black/[0.06] text-[#1d1d1f] font-semibold dark:bg-white/[0.1] dark:text-[#f5f5f7]"
                  : "text-[#6e6e73] hover:bg-black/[0.03] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:bg-white/[0.05] dark:hover:text-[#f5f5f7]"
              }`
            }
          >
            <SettingsIcon size={16} />
            <span>Settings & Preferences</span>
          </NavLink>

          <div className="rounded-xl bg-black/[0.02] p-2.5 dark:bg-white/[0.03] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0071e3]/10 text-xs font-semibold text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                  {authUser?.name?.charAt(0) || "C"}
                </div>
                <div className="min-w-0 truncate">
                  <p className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                    {authUser?.name || "Logistics Lead"}
                  </p>
                  <p className="text-[10px] text-[#86868b] truncate">
                    {authUser?.email || "fleet@cargomind.ai"}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-red-500 hover:bg-red-500/10 transition"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={15} />
              </button>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-black/[0.04] dark:border-white/[0.06] text-[10px]">
              <span className="truncate font-medium text-[#0071e3] dark:text-[#2997ff]">
                {authUser?.company_name || `Workspace #${authUser?.company_id || 1}`}
              </span>
              <span className="font-mono text-[9px] bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-[#86868b]">
                User ID #{authUser?.id || 1}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
