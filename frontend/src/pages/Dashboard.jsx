import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  Users,
  Package,
  Route,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Sparkles,
  Activity,
  Layers,
  Wrench,
  HeartPulse,
  ArrowRight,
  MapPin,
} from "lucide-react";
import api from "../services/api";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [maintenanceSuggestions, setMaintenanceSuggestions] = useState([]);
  const [wellnessCounts, setWellnessCounts] = useState({ good: 0, fair: 0, needs_rest: 0, total: 0 });
  const [handovers, setHandovers] = useState([]);
  const [complianceTab, setComplianceTab] = useState("wellness");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      setError("");

      try {
        const [sumRes, maintRes, driversRes, handoversRes] = await Promise.allSettled([
          api.get("/dashboard/summary"),
          api.get("/maintenance/suggestions"),
          api.get("/drivers/"),
          api.get("/handovers/"),
        ]);

        if (sumRes.status === "fulfilled") {
          setSummary(sumRes.value.data);
        }

        if (maintRes.status === "fulfilled") {
          setMaintenanceSuggestions(maintRes.value.data?.suggestions || []);
        }

        if (driversRes.status === "fulfilled" && Array.isArray(driversRes.value.data)) {
          const list = driversRes.value.data;
          let g = 0, f = 0, nr = 0;
          list.forEach((d) => {
            const sc = d.wellness_score ?? 100;
            if (sc >= 80) g++;
            else if (sc >= 60) f++;
            else nr++;
          });
          setWellnessCounts({ good: g, fair: f, needs_rest: nr, total: list.length });
        }

        if (handoversRes.status === "fulfilled" && Array.isArray(handoversRes.value.data)) {
          setHandovers(handoversRes.value.data);
        }
      } catch (err) {
        console.error("Dashboard API error:", err);
        setError("Unable to load real-time fleet metrics.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
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

      {/* Maintenance Suggestions Alert Card */}
      {maintenanceSuggestions.length > 0 && (
        <section className="mb-8 apple-card p-5 border border-amber-500/30 bg-amber-500/[0.03] dark:bg-amber-500/[0.05]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                <Wrench size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Fleet Maintenance Alert: {maintenanceSuggestions.length} Vehicle{maintenanceSuggestions.length > 1 ? "s" : ""} Due for Service
                  </h3>
                  <span className="apple-badge bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] py-0">
                    Action Needed
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                  {maintenanceSuggestions[0]?.message || `${maintenanceSuggestions[0]?.registration_number} has completed ${maintenanceSuggestions[0]?.trips_since_service} trips since last service`}
                  {maintenanceSuggestions.length > 1 && ` and ${maintenanceSuggestions.length - 1} other vehicle(s) requiring attention.`}
                </p>
              </div>
            </div>

            <Link
              to="/trucks"
              className="apple-btn-primary text-xs shrink-0 flex items-center gap-1.5"
            >
              <Wrench size={13} />
              <span>Review Vehicles in Fleet</span>
            </Link>
          </div>
        </section>
      )}

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

          {/* Driver Duty, Wellness & Relay Schedule Summary Strip */}
          <div className="mt-6 rounded-2xl border border-black/[0.06] bg-black/[0.015] p-5 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                  <HeartPulse size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Driver Wellness & Shift Compliance
                  </p>
                  <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                    Enforcing 8h max shift, 30m break / 4.5h, 22-03 night fatigue factor, and 8h mandatory rest.
                  </p>
                </div>
              </div>

              {/* Segmented Toggle Control */}
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-xl border border-black/[0.08] bg-black/[0.03] p-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setComplianceTab("wellness")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      complianceTab === "wellness"
                        ? "bg-[#0071e3] text-white shadow-sm dark:bg-[#2997ff] dark:text-black"
                        : "text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7]"
                    }`}
                  >
                    Wellness & Rest
                  </button>
                  <button
                    type="button"
                    onClick={() => setComplianceTab("relay")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      complianceTab === "relay"
                        ? "bg-[#0071e3] text-white shadow-sm dark:bg-[#2997ff] dark:text-black"
                        : "text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#86868b] dark:hover:text-[#f5f5f7]"
                    }`}
                  >
                    Relay Schedule
                  </button>
                </div>
              </div>
            </div>

            {/* TAB 1: Wellness Score Bands */}
            {complianceTab === "wellness" && (
              <div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-xl border border-[#34c759]/20 bg-[#34c759]/5 p-3">
                    <span className="text-[10px] text-[#34c759] dark:text-[#30d158] font-semibold block">Good (≥80)</span>
                    <span className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {loading ? "—" : wellnessCounts.good}
                    </span>
                    <span className="text-[10px] text-[#86868b] block">Fully rested & ready</span>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block">Fair (60-79)</span>
                    <span className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {loading ? "—" : wellnessCounts.fair}
                    </span>
                    <span className="text-[10px] text-[#86868b] block">Moderate fatigue</span>
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold block">Needs Rest (&lt;60)</span>
                    <span className="text-xl font-bold text-red-600 dark:text-red-400">
                      {loading ? "—" : wellnessCounts.needs_rest}
                    </span>
                    <span className="text-[10px] text-[#86868b] block">Blocked from dispatch</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#6e6e73] dark:text-[#86868b]">
                  <span>Circadian safety checks automatically update each driver&apos;s dispatch status.</span>
                  <Link
                    to="/drivers"
                    className="font-semibold text-[#0071e3] hover:underline dark:text-[#2997ff] inline-flex items-center gap-1 shrink-0 ml-2"
                  >
                    View Crew Directory <ArrowUpRight size={13} />
                  </Link>
                </div>
              </div>
            )}

            {/* TAB 2: Relay Schedule */}
            {complianceTab === "relay" && (
              <div className="pt-1">
                {handovers && handovers.length > 0 ? (
                  <div className="space-y-2">
                    {handovers.slice(0, 3).map((h) => (
                      <div
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-[#0071e3] dark:text-[#2997ff]" />
                          <div>
                            <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Trip #{h.trip_id}</span>
                            <span className="text-[#6e6e73] dark:text-[#86868b] ml-1.5">· {h.hub_name || "Corridor Relay Hub"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[#6e6e73] dark:text-[#86868b]">{h.outgoing_driver_name || "Current Driver"}</span>
                          <ArrowRight size={12} className="text-[#86868b]" />
                          <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{h.incoming_driver_name || "Relay Driver"}</span>
                        </div>

                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            h.status === "executed"
                              ? "bg-[#34c759]/15 text-[#34c759] dark:text-[#30d158]"
                              : "bg-[#0071e3]/15 text-[#0071e3] dark:text-[#2997ff]"
                          }`}
                        >
                          {h.status || "Planned"}
                        </span>
                      </div>
                    ))}

                    <div className="mt-3 flex items-center justify-between text-xs text-[#6e6e73] dark:text-[#86868b]">
                      <span>{handovers.length} relay point{handovers.length !== 1 ? "s" : ""} scheduled along active highway corridors.</span>
                      <Link
                        to="/handovers"
                        className="font-semibold text-[#0071e3] hover:underline dark:text-[#2997ff] inline-flex items-center gap-1 shrink-0 ml-2"
                      >
                        Full Relay Operations <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-black/[0.1] bg-black/[0.015] p-4 dark:border-white/[0.1] dark:bg-white/[0.02]">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-left">
                        <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          Highway Long-Haul Relay Operations
                        </p>
                        <p className="text-[11px] text-[#6e6e73] dark:text-[#86868b] mt-0.5">
                          {summary?.active_trips ?? 0} active expedition{summary?.active_trips !== 1 ? "s" : ""} en route. Coordinate mid-journey handovers at designated transit hubs to prevent driver fatigue.
                        </p>
                      </div>

                      <Link
                        to="/handovers"
                        className="apple-btn-primary text-xs inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Sparkles size={13} />
                        Auto-Plan Relays
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
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
