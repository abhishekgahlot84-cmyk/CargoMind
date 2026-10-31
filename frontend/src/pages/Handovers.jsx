import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Route,
  ArrowRight,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  X,
  ShieldCheck,
  Calendar,
  UserCheck,
} from "lucide-react";
import api from "../services/api";

export default function Handovers() {
  const [handovers, setHandovers] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planSuccess, setPlanSuccess] = useState("");

  const [planForm, setPlanForm] = useState({
    trip_id: "",
    hub_id: "",
    incoming_driver_id: "",
    planned_handover_time: "",
    outgoing_km: "",
    notes: "",
  });

  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executingHandover, setExecutingHandover] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState("");
  const [executeNotes, setExecuteNotes] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [handoversRes, tripsRes, hubsRes, driversRes] = await Promise.allSettled([
        api.get("/handovers/"),
        api.get("/trips/"),
        api.get("/hubs/"),
        api.get("/drivers/"),
      ]);

      if (handoversRes.status === "fulfilled") {
        setHandovers(Array.isArray(handoversRes.value.data) ? handoversRes.value.data : []);
      }
      if (tripsRes.status === "fulfilled") {
        const allTrips = Array.isArray(tripsRes.value.data) ? tripsRes.value.data : [];
        setActiveTrips(allTrips.filter((t) => ["planned", "in_progress"].includes(t.status)));
      }
      if (hubsRes.status === "fulfilled") {
        setHubs(Array.isArray(hubsRes.value.data) ? hubsRes.value.data : []);
      }
      if (driversRes.status === "fulfilled") {
        setDrivers(Array.isArray(driversRes.value.data) ? driversRes.value.data : []);
      }
    } catch (err) {
      console.error("Error loading handover data:", err);
      setError("Failed to load driver handover records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTrip = activeTrips.find((t) => String(t.id) === String(planForm.trip_id));
  const currentDriver = drivers.find((d) => d.id === selectedTrip?.driver_id);

  function handleOpenPlan() {
    setPlanForm({
      trip_id: activeTrips.length > 0 ? String(activeTrips[0].id) : "",
      hub_id: hubs.length > 0 ? String(hubs[0].id) : "",
      incoming_driver_id: "",
      planned_handover_time: new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16),
      outgoing_km: "",
      notes: "",
    });
    setPlanError("");
    setPlanSuccess("");
    setShowPlanModal(true);
  }

  async function handlePlanSubmit(e) {
    e.preventDefault();
    setPlanning(true);
    setPlanError("");

    if (!selectedTrip) {
      setPlanError("Please select a valid active trip.");
      setPlanning(false);
      return;
    }

    if (!selectedTrip.driver_id) {
      setPlanError("The selected trip has no current driver assigned.");
      setPlanning(false);
      return;
    }

    if (!planForm.incoming_driver_id) {
      setPlanError("Please choose an eligible incoming driver.");
      setPlanning(false);
      return;
    }

    if (String(selectedTrip.driver_id) === String(planForm.incoming_driver_id)) {
      setPlanError("The incoming driver cannot be the same as the current driver.");
      setPlanning(false);
      return;
    }

    try {
      const payload = {
        trip_id: Number(planForm.trip_id),
        hub_id: Number(planForm.hub_id),
        outgoing_driver_id: Number(selectedTrip.driver_id),
        incoming_driver_id: Number(planForm.incoming_driver_id),
        planned_handover_time: new Date(planForm.planned_handover_time).toISOString(),
        outgoing_km: planForm.outgoing_km ? Number(planForm.outgoing_km) : null,
        notes: planForm.notes?.trim() || null,
      };

      await api.post("/handovers/plan", payload);
      setPlanSuccess("Handover scheduled.");
      setTimeout(() => {
        setShowPlanModal(false);
        fetchData();
      }, 500);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setPlanError(typeof detail === "string" ? detail : "Failed to plan handover.");
    } finally {
      setPlanning(false);
    }
  }

  function handleOpenExecute(handover) {
    setExecutingHandover(handover);
    setExecuteError("");
    setExecuteNotes("");
    setShowExecuteModal(true);
  }

  async function handleExecuteSubmit(e) {
    e.preventDefault();
    if (!executingHandover) return;
    setExecuting(true);
    setExecuteError("");

    try {
      await api.post(`/handovers/${executingHandover.id}/execute`, {
        notes: executeNotes.trim() || null,
      });

      setShowExecuteModal(false);
      fetchData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setExecuteError(typeof detail === "string" ? detail : "Failed to execute handover.");
    } finally {
      setExecuting(false);
    }
  }

  async function handleCancelHandover(handoverId) {
    if (!window.confirm("Are you sure you want to cancel this planned handover?")) return;
    try {
      await api.post(`/handovers/${handoverId}/cancel`);
      fetchData();
    } catch {
      alert("Failed to cancel handover.");
    }
  }

  const plannedHandovers = handovers.filter((h) => ["planned", "confirmed"].includes(h.status));
  const completedHandovers = handovers.filter((h) => ["completed", "executed"].includes(h.status));

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Relay Logistics
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Driver Handover & Relief
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Enforce shift rest periods and manage vehicle driver relays at intermediate hubs.
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={handleOpenPlan}
            disabled={activeTrips.length === 0 || hubs.length === 0}
            className="apple-btn-primary text-xs disabled:opacity-50"
          >
            <Plus size={14} />
            Schedule Handover
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="apple-btn-secondary text-xs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Active Trips</span>
            <Route size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : activeTrips.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Ongoing expeditions</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Pending Handovers</span>
            <Clock size={18} className="text-[#ff9500] dark:text-[#ff9f0a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : plannedHandovers.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Scheduled at transit hubs</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Completed Transfers</span>
            <ShieldCheck size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : completedHandovers.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Successful relay operations</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Scheduled Handovers Timeline Cards */}
      <div className="apple-card overflow-hidden mb-8">
        <div className="border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Scheduled Handover Queue
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Driver transfers awaiting vehicle arrival at designated hubs.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading handovers...</p>
        ) : plannedHandovers.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="mx-auto h-10 w-10 text-[#86868b] mb-2" />
            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">No scheduled handovers</p>
            <p className="mt-1 text-[11px] text-[#86868b]">Click &quot;Schedule Handover&quot; to assign a relay driver.</p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {plannedHandovers.map((h) => (
              <div
                key={h.id}
                className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] font-mono dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                      Trip #{h.trip_id}
                    </span>
                    <span className="apple-badge bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]">
                      <Clock size={11} /> Planned Relay
                    </span>
                  </div>

                  {/* Journey Transfer Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7] pt-1">
                    <span className="font-semibold">
                      {h.outgoing_driver_name || `Driver #${h.outgoing_driver_id}`}
                    </span>
                    <ArrowRight size={13} className="text-[#86868b]" />
                    <span className="apple-badge bg-black/[0.05] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#f5f5f7]">
                      <MapPin size={11} /> {h.hub_name || `Hub #${h.hub_id}`}
                    </span>
                    <ArrowRight size={13} className="text-[#86868b]" />
                    <span className="font-semibold text-[#34c759] dark:text-[#30d158]">
                      {h.incoming_driver_name || `Driver #${h.incoming_driver_id}`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#86868b]">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Target: {h.planned_handover_time ? new Date(h.planned_handover_time).toLocaleString() : "ASAP"}
                    </span>
                  </div>

                  {h.notes && (
                    <p className="text-[11px] text-[#86868b] italic bg-black/[0.02] p-2 rounded-xl dark:bg-white/[0.02]">
                      Note: {h.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:self-center">
                  <button
                    onClick={() => handleOpenExecute(h)}
                    className="apple-btn-primary text-xs"
                  >
                    Confirm & Execute
                  </button>
                  <button
                    onClick={() => handleCancelHandover(h.id)}
                    className="apple-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Handovers Table */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Handover Verification Log
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Historical audit record of verified driver exchanges.
          </p>
        </div>

        {completedHandovers.length === 0 ? (
          <p className="p-8 text-center text-xs text-[#86868b]">No executed handovers logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Trip</th>
                  <th className="px-6 py-3.5">Hub Facility</th>
                  <th className="px-6 py-3.5">Outgoing Driver</th>
                  <th className="px-6 py-3.5">Incoming Driver</th>
                  <th className="px-6 py-3.5">Executed At</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {completedHandovers.map((h) => (
                  <tr key={h.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-[#86868b]">#{h.id}</td>
                    <td className="px-6 py-4 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Trip #{h.trip_id}</td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      {h.hub_name || `Hub #${h.hub_id}`}
                    </td>
                    <td className="px-6 py-4 text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {h.outgoing_driver_name || `Driver #${h.outgoing_driver_id}`}
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#34c759] dark:text-[#30d158]">
                      {h.incoming_driver_name || `Driver #${h.incoming_driver_id}`}
                    </td>
                    <td className="px-6 py-4 text-[#86868b]">
                      {h.actual_handover_time ? new Date(h.actual_handover_time).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                        <CheckCircle2 size={11} /> Executed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Handover Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Schedule Driver Handover
              </h2>
              <button
                onClick={() => setShowPlanModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePlanSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Select Active Trip *
                </label>
                <select
                  required
                  value={planForm.trip_id}
                  onChange={(e) => setPlanForm({ ...planForm, trip_id: e.target.value })}
                  className="apple-input text-xs"
                >
                  {activeTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      Trip #{t.id} (Truck #{t.truck_id} • Driver #{t.driver_id})
                    </option>
                  ))}
                </select>
              </div>

              {selectedTrip && (
                <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] p-3 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="text-[#86868b]">
                    Current Outgoing Driver:{" "}
                    <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{currentDriver?.name || `Driver #${selectedTrip.driver_id}`}</strong>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Handover Relay Hub *
                  </label>
                  <select
                    required
                    value={planForm.hub_id}
                    onChange={(e) => setPlanForm({ ...planForm, hub_id: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {hubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.city || "Hub"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Incoming Relief Driver *
                  </label>
                  <select
                    required
                    value={planForm.incoming_driver_id}
                    onChange={(e) => setPlanForm({ ...planForm, incoming_driver_id: e.target.value })}
                    className="apple-input text-xs"
                  >
                    <option value="">Select relief driver...</option>
                    {drivers
                      .filter((d) => d.id !== selectedTrip?.driver_id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.status} • {d.license_category})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Planned Handover Time *
                  </label>
                  <input
                    required
                    type="datetime-local"
                    value={planForm.planned_handover_time}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, planned_handover_time: e.target.value })
                    }
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Odometer at Handover (km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={planForm.outgoing_km}
                    onChange={(e) => setPlanForm({ ...planForm, outgoing_km: e.target.value })}
                    placeholder="e.g. 420"
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Handover Notes / Instructions
                </label>
                <textarea
                  rows={2}
                  value={planForm.notes}
                  onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                  placeholder="e.g. Mandatory 11h rest period for outgoing driver"
                  className="apple-input text-xs"
                />
              </div>

              {planError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {planError}
                </div>
              )}

              {planSuccess && (
                <div className="rounded-xl border border-[#34c759]/20 bg-[#34c759]/10 p-3 text-xs text-[#34c759] dark:text-[#30d158]">
                  {planSuccess}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={planning}
                  className="apple-btn-primary text-xs"
                >
                  {planning ? "Scheduling..." : "Schedule Handover"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execute Handover Modal */}
      {showExecuteModal && executingHandover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Execute Handover #{executingHandover.id}
              </h3>
              <button
                onClick={() => setShowExecuteModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Confirm transfer of vehicle controls for Trip #{executingHandover.trip_id} from{" "}
              <strong>{executingHandover.outgoing_driver_name}</strong> to{" "}
              <strong className="text-[#34c759] dark:text-[#30d158]">{executingHandover.incoming_driver_name}</strong>.
            </p>

            <form onSubmit={handleExecuteSubmit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Execution Remarks
                </label>
                <textarea
                  rows={2}
                  value={executeNotes}
                  onChange={(e) => setExecuteNotes(e.target.value)}
                  placeholder="Vehicle inspected, keys handed over."
                  className="apple-input text-xs"
                />
              </div>

              {executeError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {executeError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowExecuteModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={executing}
                  className="apple-btn-primary text-xs"
                >
                  {executing ? "Executing..." : "Confirm Execution"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
