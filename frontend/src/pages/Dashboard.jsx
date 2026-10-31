import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  Users,
  Package,
  Route,
  Search,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Activity,
  Layers,
} from "lucide-react";
import api from "../services/api";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/summary")
      .then((response) => {
        setSummary(response.data);
        setError("");
      })
      .catch((err) => {
        console.error("Dashboard API error:", err);
        setError("Unable to load real-time fleet metrics.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const stats = [
    {
      label: "Total Fleet Capacity",
      value: summary?.total_trucks ?? 0,
      sub: "Active heavy & medium vehicles",
      icon: Truck,
      color: "text-[#0071e3] bg-[#0071e3]/10 dark:text-[#2997ff] dark:bg-[#2997ff]/15",
      link: "/trucks",
    },
    {
      label: "Available Drivers",
      value: summary?.available_drivers ?? 0,
      sub: "Rest compliant & ready",
      icon: Users,
      color: "text-[#34c759] bg-[#34c759]/10 dark:text-[#30d158] dark:bg-[#30d158]/15",
      link: "/drivers",
    },
    {
      label: "Pending Consignments",
      value: summary?.pending_orders ?? 0,
      sub: "Awaiting load allocation",
      icon: Package,
      color: "text-[#ff9500] bg-[#ff9500]/10 dark:text-[#ff9f0a] dark:bg-[#ff9f0a]/15",
      link: "/orders",
    },
    {
      label: "Active Expeditions",
      value: summary?.active_trips ?? 0,
      sub: "En route across transit hubs",
      icon: Route,
      color: "text-[#af52de] bg-[#af52de]/10 dark:text-[#bf5af2] dark:bg-[#bf5af2]/15",
      link: "/trips",
    },
  ];

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Editorial Header */}
      <header className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-black/[0.03] px-3 py-1 text-xs font-semibold tracking-wide text-[#0071e3] backdrop-blur-md dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-[#2997ff]">
            <Activity size={12} className="animate-pulse" />
            OPERATIONAL COMMAND CENTER
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1d1d1f] sm:text-4xl dark:text-[#f5f5f7]">
            Fleet Overview
          </h1>

          <p className="mt-1.5 text-sm text-[#6e6e73] dark:text-[#86868b]">
            Continuous monitoring, OR-Tools optimization, and automated dispatch control.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/optimization"
            className="apple-btn-primary"
          >
            <Sparkles size={15} />
            Run Solver
          </Link>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <span className="font-semibold">Notice:</span> {error}
        </div>
      )}

      {/* Primary KPI Metrics */}
      <section className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon, color, link }) => (
          <Link
            key={label}
            to={link}
            className="group apple-card p-6 apple-card-hover"
          >
            <div className="flex items-center justify-between">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
                <Icon size={20} />
              </div>
              <ArrowUpRight
                size={16}
                className="text-[#86868b] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#1d1d1f] dark:group-hover:text-[#f5f5f7]"
              />
            </div>

            <p className="mt-5 text-xs font-medium tracking-tight text-[#6e6e73] dark:text-[#86868b]">
              {label}
            </p>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
              {loading ? "—" : value}
            </h2>

            <p className="mt-2 text-xs text-[#86868b] dark:text-[#6e6e73]">
              {sub}
            </p>
          </Link>
        ))}
      </section>

      {/* Operational Panels Grid */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fleet Transit Activity */}
        <article className="apple-card p-7 lg:col-span-2">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                Transit Operations
              </h2>
              <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
                Real-time lifecycle breakdown across current shipments
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-black/[0.02] px-3 py-1 text-xs font-medium text-[#6e6e73] dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-[#86868b]">
              <Layers size={13} />
              Live DB Telemetry
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-5 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
                <Truck size={15} className="text-[#0071e3] dark:text-[#2997ff]" />
                En Route
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                {loading ? "—" : summary?.active_trips ?? 0}
              </p>
              <p className="mt-1 text-xs text-[#86868b]">Active highway runs</p>
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-5 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
                <CheckCircle2 size={15} className="text-[#34c759] dark:text-[#30d158]" />
                Delivered
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                {loading ? "—" : summary?.completed_orders ?? 0}
              </p>
              <p className="mt-1 text-xs text-[#86868b]">Completed orders</p>
            </div>

            <div className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-5 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
                <Clock3 size={15} className="text-[#ff9500] dark:text-[#ff9f0a]" />
                Unassigned
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                {loading ? "—" : summary?.pending_orders ?? 0}
              </p>
              <p className="mt-1 text-xs text-[#86868b]">Pending allocation</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-black/[0.015] p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Driver Duty & Compliance Engine
                </p>
                <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                  Automated checks enforcing maximum driving hours and mandatory 11h rest periods.
                </p>
              </div>
            </div>

            <Link
              to="/handovers"
              className="apple-btn-secondary text-xs shrink-0"
            >
              View Relay Schedule
            </Link>
          </div>
        </article>

        {/* Smart Optimization Card */}
        <Link
          to="/optimization"
          role="button"
          tabIndex={0}
          aria-label="Smart Optimization: Launch OR-Tools SCIP and VRP solver"
          className="group apple-card p-7 flex flex-col justify-between apple-card-hover focus:outline-none focus:ring-2 focus:ring-[#0071e3] transition cursor-pointer"
        >
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-[#0071e3]/10 px-3 py-1.5 text-xs font-semibold text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
              <Sparkles size={14} className="group-hover:rotate-12 transition-transform duration-300" />
              Smart Optimization
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                Smart Optimization Engine
              </h2>
              <ArrowUpRight
                size={18}
                className="text-[#86868b] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#0071e3] dark:group-hover:text-[#2997ff]"
              />
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
              Execute dual-constraint integer programming (SCIP) and multi-stop vehicle routing (VRP) across pending consignments and available fleet trucks.
            </p>

            <div className="mt-6 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-black/[0.02] px-3.5 py-2.5 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
                <span className="text-[#6e6e73] dark:text-[#86868b]">SCIP Load Allocation</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#34c759] dark:text-[#30d158]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34c759] dark:bg-[#30d158]" />
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-black/[0.02] px-3.5 py-2.5 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
                <span className="text-[#6e6e73] dark:text-[#86868b]">VRP Multi-Stop Router</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#34c759] dark:text-[#30d158]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34c759] dark:bg-[#30d158]" />
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-black/[0.02] px-3.5 py-2.5 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
                <span className="text-[#6e6e73] dark:text-[#86868b]">Turn-by-Turn Geometry</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#34c759] dark:text-[#30d158]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#34c759] dark:bg-[#30d158]" />
                  Ready
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs font-semibold text-[#0071e3] dark:text-[#2997ff]">
            <span>Launch Optimization Workspace</span>
            <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </Link>
      </section>

      {/* Refined Minimalist Footer */}
      <footer className="mt-14 border-t border-black/[0.06] pt-6 text-center text-xs text-[#86868b] dark:border-white/[0.08]">
        CargoMind Fleet Intelligence · Engineered for precision logistics & autonomous fleet routing
      </footer>
    </div>
  );
}
