import { useState, useEffect } from "react";
import {
  Package,
  Route,
  Truck,
  Play,
  AlertCircle,
  LoaderCircle,
  CheckCircle2,
  Users,
  Fuel,
  Clock,
  ArrowRight,
  Milestone,
  RefreshCw,
  Wrench,
  AlertTriangle,
  Code,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import api from "../services/api";

export default function Optimization() {
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [fuelPrice, setFuelPrice] = useState(90);

  const [activeAction, setActiveAction] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [repairMsg, setRepairMsg] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [seedVal, setSeedVal] = useState(42);
  const [resettingDemo, setResettingDemo] = useState(false);

  async function loadResources() {
    try {
      const [trucksRes, driversRes] = await Promise.all([
        api.get("/trucks/").catch(() => ({ data: [] })),
        api.get("/drivers/").catch(() => ({ data: [] })),
      ]);
      const tList = Array.isArray(trucksRes.data) ? trucksRes.data : [];
      const dList = Array.isArray(driversRes.data) ? driversRes.data : [];
      setTrucks(tList);
      setDrivers(dList);

      if (tList.length > 0 && !truckId) setTruckId(tList[0].id);
      if (dList.length > 0 && !driverId) setDriverId(dList[0].id);
    } catch (e) {
      console.error("Failed to load trucks or drivers for optimization", e);
    }
  }

  useEffect(() => {
    loadResources();
  }, []);

  async function handleRepairStatuses() {
    setRepairing(true);
    setRepairMsg("");
    try {
      const res = await api.post("/optimization/repair-statuses?reset_planned=false");
      const fixedTrucks = res.data?.trucks_fixed_count || 0;
      const fixedDrivers = res.data?.drivers_fixed_count || 0;
      setRepairMsg(
        `Status sync complete: ${fixedTrucks} trucks and ${fixedDrivers} drivers updated to available.`
      );
      await loadResources();
    } catch (e) {
      setRepairMsg("Status repair failed. Please check backend.");
    } finally {
      setRepairing(false);
    }
  }

  async function handleResetDemoFleet() {
    setResettingDemo(true);
    setRepairMsg("");
    try {
      const res = await api.post(`/optimization/reset-demo?random_seed=${seedVal}&create_backup=true`);
      const data = res.data || {};
      setRepairMsg(
        `Demo fleet reset successfully! Seeded ${data.hubs_seeded || 12} Indian logistics hubs, ${data.trucks_seeded || 16} trucks (${data.available_trucks || 11} available), ${data.drivers_seeded || 20} drivers, ${data.pending_consignments || 25} pending consignments. (Backup saved to: ${data.backup_file || 'backend/backups/'})`
      );
      setShowResetModal(false);
      await loadResources();
    } catch (e) {
      const detail = e.response?.data?.detail || e.message;
      setRepairMsg(`Demo reset failed: ${detail}`);
    } finally {
      setResettingDemo(false);
    }
  }

  async function runOptimization(action) {
    setActiveAction(action);
    setResult(null);
    setError("");

    try {
      let response;

      if (action === "load") {
        response = await api.get("/optimization/load-allocation", {
          params: { fuel_price: Number(fuelPrice) },
        });
      } else if (action === "route") {
        if (!truckId || !driverId) {
          throw new Error("Please select both a truck and a driver.");
        }
        response = await api.post("/optimization/route", null, {
          params: {
            truck_id: Number(truckId),
            driver_id: Number(driverId),
            fuel_price: Number(fuelPrice),
          },
        });
      } else {
        response = await api.post("/optimization/fleet-route", null, {
          params: {
            fuel_price: Number(fuelPrice),
          },
        });
      }

      setResult({
        action,
        data: response.data,
      });

      loadResources();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : JSON.stringify(detail ?? err.message, null, 2)
      );
    } finally {
      setActiveAction("");
    }
  }

  const actions = [
    {
      id: "load",
      title: "Load Allocation (OR-Tools SCIP)",
      description:
        "Execute mixed-integer programming solver to optimally pack pending consignments into eligible trucks without exceeding weight or volume capacities.",
      icon: Package,
      color: "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]",
      button: "Run Load Allocation",
    },
    {
      id: "route",
      title: "Single-Truck Route Optimization",
      description:
        "Calculate an optimized road-following route sequence with turn-by-turn OSRM geometry for the selected vehicle.",
      icon: Route,
      color: "bg-[#af52de]/10 text-[#af52de] dark:bg-[#bf5af2]/15 dark:text-[#bf5af2]",
      button: "Calculate Single Route",
    },
    {
      id: "fleet",
      title: "Fleet Route Optimization (OR-Tools VRP)",
      description:
        "Run multi-vehicle routing solver across all available trucks and pending consignments with delivery urgency and stop sequencing.",
      icon: Truck,
      color: "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]",
      button: "Optimize Fleet Routes",
    },
  ];

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Mathematical Optimization
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Optimization Solvers
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            OR-Tools SCIP dual-capacity packing and VRP constraint multi-vehicle routing with road geometry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleRepairStatuses()}
            disabled={repairing}
            className="apple-btn-secondary text-xs"
            title="Sync stuck truck and driver statuses"
          >
            <Wrench size={13} className={repairing ? "animate-spin" : ""} />
            Sync Statuses
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            disabled={repairing || resettingDemo}
            className="apple-btn-primary text-xs"
            title="Safe reset and seed Indian logistics demo fleet"
          >
            <RotateCcw size={13} className={resettingDemo ? "animate-spin" : ""} />
            Reset Demo Fleet
          </button>
        </div>
      </header>

      {repairMsg && (
        <div className="mb-6 rounded-2xl border border-[#0071e3]/20 bg-[#0071e3]/10 p-4 text-xs font-medium text-[#0071e3] flex items-center gap-2 dark:text-[#2997ff]">
          <CheckCircle2 size={15} />
          {repairMsg}
        </div>
      )}

      {/* Parameter Controls */}
      <section className="apple-card p-7 mb-8">
        <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
          Solver Parameters
        </h2>
        <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
          Configure vehicles, drivers, and fuel pricing for the solver runs.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
              Select Vehicle (for Single Route)
            </label>
            <select
              value={truckId}
              onChange={(e) => setTruckId(e.target.value)}
              className="apple-input text-xs"
            >
              {trucks.length === 0 ? (
                <option value="">No trucks available</option>
              ) : (
                trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.registration_number || `Truck #${t.id}`} (Cap: {t.capacity} kg) • {t.status}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
              Select Driver (for Single Route)
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="apple-input text-xs"
            >
              {drivers.length === 0 ? (
                <option value="">No drivers available</option>
              ) : (
                drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || `Driver #${d.id}`} ({d.license_category || "Standard"}) • {d.status}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
              Diesel Price (₹ / Litre)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="apple-input text-xs"
            />
          </div>
        </div>
      </section>

      {/* Solver Action Cards with strict card height and aligned bottom buttons */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3 items-stretch">
        {actions.map(({ id, title, description, icon: Icon, color, button }) => (
          <article
            key={id}
            className="apple-card p-7 flex flex-col justify-between h-full min-h-[310px] apple-card-hover"
          >
            <div className="flex-1 flex flex-col">
              <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${color}`}>
                <Icon size={20} />
              </div>

              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] min-h-[48px] flex items-center">
                {title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                {description}
              </p>
            </div>

            <div className="mt-auto pt-6 w-full">
              <button
                disabled={Boolean(activeAction)}
                onClick={() => runOptimization(id)}
                className="apple-btn-primary w-full text-xs font-semibold"
              >
                {activeAction === id ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {activeAction === id ? "Solving MIP Model..." : button}
              </button>
            </div>
          </article>
        ))}
      </section>

      {/* Error Banner */}
      {error && (
        <section className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            Optimization Solver Error
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-red-600 dark:text-red-400">
            {error}
          </pre>
        </section>
      )}

      {/* Results Presentation */}
      {result && (
        <section className="mt-8 apple-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
                <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Solver Results — {result.action === "load" ? "Load Allocation" : result.action === "fleet" ? "Fleet Route Optimization" : "Single Route"}
                </h2>
                {result.data?.solver_backend && (
                  <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                    {result.data.solver_backend}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#86868b]">
                Status: <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data?.solver_status || result.data?.status || "Optimal"}</strong>
                {result.data?.objective_value != null && (
                  <span className="ml-2 text-[#0071e3] dark:text-[#2997ff] font-semibold">
                    • Objective Cost: ₹{result.data.objective_value}
                  </span>
                )}
                {result.data?.persisted && (
                  <span className="ml-2 text-[#34c759] dark:text-[#30d158] font-semibold">
                    • Persisted to DB
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="apple-btn-secondary text-xs"
              >
                <Code size={13} />
                {showRawJson ? "Hide JSON" : "Raw JSON"}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {result.data?.message && (
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-4 text-xs font-medium text-[#1d1d1f] dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-[#f5f5f7]">
                {result.data.message}
              </div>
            )}

            {/* Diagnostic Filter Statistics when no_trucks or diagnostics returned */}
            {result.data?.diagnostics && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={15} />
                  Fleet Availability Filter Diagnostics
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <div className="bg-white/60 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/15">
                    <span className="text-[#86868b] block text-[10px] uppercase font-semibold">Total in DB</span>
                    <strong className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data.diagnostics.total_trucks_in_db ?? 0}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/15">
                    <span className="text-[#86868b] block text-[10px] uppercase font-semibold">Org Matching</span>
                    <strong className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data.diagnostics.company_matching_count ?? 0}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/15">
                    <span className="text-[#86868b] block text-[10px] uppercase font-semibold">Valid Capacity</span>
                    <strong className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data.diagnostics.valid_capacity_count ?? 0}</strong>
                  </div>
                  <div className="bg-white/60 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/15">
                    <span className="text-[#86868b] block text-[10px] uppercase font-semibold">Active Trips</span>
                    <strong className="text-base font-bold text-amber-600 dark:text-amber-400">
                      {Array.isArray(result.data.diagnostics.active_trip_truck_ids) ? result.data.diagnostics.active_trip_truck_ids.length : 0}
                    </strong>
                  </div>
                  <div className="bg-white/60 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/15">
                    <span className="text-[#86868b] block text-[10px] uppercase font-semibold">Available</span>
                    <strong className="text-base font-bold text-[#34c759] dark:text-[#30d158]">{result.data.diagnostics.available_trucks_count ?? 0}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Load Allocation View */}
            {Array.isArray(result.data?.assignments) && result.data.assignments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-3">
                  Vehicle Load Allocations ({result.data.assignments.length})
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {result.data.assignments.map((asgn, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-5 space-y-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
                    >
                      <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 dark:border-white/[0.08]">
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-[#0071e3] dark:text-[#2997ff]" />
                          <span className="font-semibold text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                            {asgn.truck_registration || `Truck #${asgn.truck_id}`}
                          </span>
                        </div>
                        <span className="text-xs text-[#86868b]">
                          Driver: {asgn.driver_name || `#${asgn.driver_id}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#86868b]">Payload Weight:</span>{" "}
                          <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{asgn.total_weight_kg ?? asgn.total_weight ?? 0} / {asgn.truck_capacity} kg</strong>
                          <span className="ml-1 text-[#86868b]">({asgn.utilization_percentage}%)</span>
                        </div>
                        <div>
                          <span className="text-[#86868b]">Est. Fuel Cost:</span>{" "}
                          <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">₹{asgn.total_fuel_cost ?? asgn.fuel_cost ?? 0}</strong>
                        </div>
                        {asgn.total_volume_m3 > 0 && (
                          <div>
                            <span className="text-[#86868b]">Volume Payload:</span>{" "}
                            <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{asgn.total_volume_m3} / {asgn.volume_capacity} m³</strong>
                          </div>
                        )}
                        <div>
                          <span className="text-[#86868b]">Drive Time:</span>{" "}
                          <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{asgn.total_driving_hours} hrs</strong>
                        </div>
                      </div>

                      {Array.isArray(asgn.orders) && asgn.orders.length > 0 && (
                        <div className="border-t border-black/[0.06] pt-2 space-y-1.5 dark:border-white/[0.08]">
                          <span className="text-[11px] font-semibold text-[#86868b] uppercase">
                            Allocated Orders ({asgn.orders.length}):
                          </span>
                          {asgn.orders.map((ord, oIdx) => (
                            <div
                              key={oIdx}
                              className="text-xs text-[#1d1d1f] bg-white dark:bg-[#161618] p-2.5 rounded-xl border border-black/[0.06] dark:border-white/[0.08] flex justify-between items-center"
                            >
                              <div>
                                <span className="font-semibold dark:text-[#f5f5f7]">Order #{ord.order_id}</span>:{" "}
                                <span className="text-[#6e6e73] dark:text-[#86868b]">{ord.pickup_location || "Origin"} → {ord.delivery_location || "Dest"}</span>
                                {ord.cargo_category && (
                                  <span className="apple-badge ml-2 bg-black/[0.04] text-[#6e6e73] dark:bg-white/[0.08] dark:text-[#86868b]">
                                    {ord.cargo_category}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="font-semibold dark:text-[#f5f5f7]">{ord.weight} kg</span>
                                <span className="block text-[10px] text-[#86868b]">{ord.distance_km} km</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fleet Route VRP View */}
            {Array.isArray(result.data?.routes) && result.data.routes.length > 0 && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-3 dark:border-white/[0.08]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                    <Truck size={15} className="text-[#34c759] dark:text-[#30d158]" />
                    Fleet Vehicle Routes ({result.data.routes.length} Active Vehicles)
                  </h3>
                  <div className="flex gap-4 text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
                    <span>Total Distance: <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data.total_distance_km} km</strong></span>
                    <span>Total Payload: <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{result.data.total_weight_kg} kg</strong></span>
                    <span>Total Est. Fuel: <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">₹{result.data.total_fuel_cost}</strong></span>
                  </div>
                </div>

                <div className="space-y-4">
                  {result.data.routes.map((route, rIdx) => (
                    <div
                      key={rIdx}
                      className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-5 space-y-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] pb-2 dark:border-white/[0.08]">
                        <div className="flex items-center gap-2 font-semibold text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                          <Truck size={16} className="text-[#34c759] dark:text-[#30d158]" />
                          <span>Vehicle: {route.truck_registration || `Truck #${route.truck_id}`}</span>
                          <span className="text-xs font-normal text-[#86868b]">
                            • Driver: {route.driver_name || `#${route.driver_id}`}
                          </span>
                        </div>
                        <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                          {route.total_distance_km} km • {route.estimated_driving_hours} hrs • ₹{route.fuel_cost}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div className="bg-white dark:bg-[#161618] p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                          <span className="text-[#86868b]">Payload Carried</span>
                          <p className="mt-1 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{route.total_weight_kg || route.total_weight} / {route.truck_capacity} kg</p>
                        </div>
                        <div className="bg-white dark:bg-[#161618] p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                          <span className="text-[#86868b]">Orders Routed</span>
                          <p className="mt-1 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{route.order_count} consignments</p>
                        </div>
                        <div className="bg-white dark:bg-[#161618] p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                          <span className="text-[#86868b]">Total Stops</span>
                          <p className="mt-1 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{route.stops?.length || 2} stops</p>
                        </div>
                        <div className="bg-white dark:bg-[#161618] p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08]">
                          <span className="text-[#86868b]">Fuel Required</span>
                          <p className="mt-1 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{route.fuel_used_liters} Litres</p>
                        </div>
                      </div>

                      {/* Stops sequence */}
                      {Array.isArray(route.stops) && route.stops.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-[#86868b] block mb-2">Stop Sequence:</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {route.stops.map((stop, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-1.5 text-xs">
                                <span className={`px-3 py-1.5 rounded-xl border font-medium ${
                                  stop.type === "depot"
                                    ? "bg-black/[0.05] border-black/[0.08] text-[#1d1d1f] dark:bg-white/[0.08] dark:border-white/[0.1] dark:text-[#f5f5f7]"
                                    : "bg-white border-black/[0.08] text-[#1d1d1f] dark:bg-[#161618] dark:border-white/[0.08] dark:text-[#f5f5f7]"
                                }`}>
                                  {stop.name || stop.location || `Stop #${sIdx + 1}`}
                                  {stop.weight_kg ? ` (${stop.weight_kg}kg)` : ""}
                                </span>
                                {sIdx < route.stops.length - 1 && (
                                  <ArrowRight size={13} className="text-[#34c759] dark:text-[#30d158] shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unassigned orders */}
            {Array.isArray(result.data?.unassigned_orders) && result.data.unassigned_orders.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#ff9500] dark:text-[#ff9f0a] mb-3 flex items-center gap-2">
                  <AlertTriangle size={15} />
                  Unassigned Consignments ({result.data.unassigned_orders.length})
                </h3>
                <div className="divide-y divide-black/[0.04] rounded-2xl border border-black/[0.06] bg-black/[0.015] p-2 dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {result.data.unassigned_orders.map((u, idx) => (
                    <div key={idx} className="p-3 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Order #{u.order_id}</span>
                        {u.pickup_location && (
                          <span className="text-[#86868b] ml-2">({u.pickup_location} → {u.delivery_location})</span>
                        )}
                      </div>
                      <span className="text-[#ff9500] dark:text-[#ff9f0a] italic max-w-md text-right">
                        {u.reason || "Exceeds vehicle capacity or driver constraints"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON toggle */}
            {showRawJson && (
              <pre className="max-h-96 overflow-auto rounded-2xl bg-[#000000] p-5 text-xs text-[#30d158] border border-white/[0.1]">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* Reset Demo Fleet Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="apple-card w-full max-w-lg p-7 border border-black/10 shadow-2xl dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Reset Demo Fleet Data
                </h3>
                <p className="text-xs text-[#86868b]">
                  Purge operational records and seed realistic Indian logistics data
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
              <p>
                This operation will safely delete trips, GPS tracking, and consignments in foreign-key safe order. 
                <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]"> User accounts, authentication, and org settings are strictly preserved.</strong>
              </p>
              <div className="rounded-xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
                <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  What will be seeded:
                </span>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>12 verified Indian hubs (Gwalior, Delhi, Mumbai, Jaipur, Bhopal, Indore...)</li>
                  <li>16 trucks with valid Indian plates (11 available, 3 in transit, 2 in maintenance)</li>
                  <li>20 licensed drivers with mobile numbers and HGV credentials</li>
                  <li>30 routable consignments with OSRM road distances, deadlines &amp; handling tags</li>
                  <li>In-progress &amp; completed trips for live GPS Tracking and Recorded Trips</li>
                </ul>
              </div>
              <p className="text-[11px] text-[#86868b]">
                An automated backup of the current database has been generated in <code className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono">backend/backups/</code> before executing.
              </p>

              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Random Seed (for deterministic reproducibility)
                </label>
                <input
                  type="number"
                  value={seedVal}
                  onChange={(e) => setSeedVal(Number(e.target.value))}
                  className="apple-input text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={resettingDemo}
                onClick={() => setShowResetModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingDemo}
                onClick={handleResetDemoFleet}
                className="apple-btn-primary bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {resettingDemo ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" />
                    Resetting &amp; Seeding Demo...
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} />
                    Confirm Reset Fleet
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
