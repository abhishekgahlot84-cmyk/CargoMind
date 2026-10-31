import { useEffect, useState, useCallback, useMemo } from "react";
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
  Sparkles,
  ArrowLeftRight,
  AlertTriangle,
  Search,
} from "lucide-react";
import api from "../services/api";

export default function Handovers() {
  const [handovers, setHandovers] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [tripDashboard, setTripDashboard] = useState(null);
  const [hubsOnRoute, setHubsOnRoute] = useState([]);
  const [eligibleDrivers, setEligibleDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planSuccess, setPlanSuccess] = useState("");

  const [modalTripId, setModalTripId] = useState("");
  const [modalHubId, setModalHubId] = useState("");
  const [modalDriverId, setModalDriverId] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [modalArrivalTime, setModalArrivalTime] = useState("");
  const [modalNotes, setModalNotes] = useState("");

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingHandover, setReviewingHandover] = useState(null);
  const [executing, setExecuting] = useState(false);

  const fetchGeneralData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [handoversRes, tripsRes, driversRes] = await Promise.allSettled([
        api.get("/handovers/"),
        api.get("/trips/"),
        api.get("/handovers/eligible-drivers"),
      ]);

      if (handoversRes.status === "fulfilled") {
        setHandovers(Array.isArray(handoversRes.value.data) ? handoversRes.value.data : []);
      }
      if (tripsRes.status === "fulfilled") {
        const allTrips = Array.isArray(tripsRes.value.data) ? tripsRes.value.data : [];
        const active = allTrips.filter((t) => ["planned", "in_progress"].includes(t.status));
        setActiveTrips(active);
        if (active.length > 0 && !selectedTripId) {
          setSelectedTripId(String(active[0].id));
        }
      }
      if (driversRes.status === "fulfilled") {
        setEligibleDrivers(Array.isArray(driversRes.value.data) ? driversRes.value.data : []);
      }
    } catch (err) {
      console.error("Error loading handover data:", err);
      setError("Failed to load driver handover records.");
    } finally {
      setLoading(false);
    }
  }, [selectedTripId]);

  useEffect(() => {
    fetchGeneralData();
  }, [fetchGeneralData]);

  // Load specific trip dashboard & corridor hubs when selectedTripId changes
  const loadTripDetails = useCallback(async (tripId) => {
    if (!tripId) return;
    try {
      const [dashRes, hubsRes] = await Promise.all([
        api.get(`/handovers/trip/${tripId}/dashboard`).catch(() => null),
        api.get(`/handovers/corridor-hubs/${tripId}`).catch(() => null),
      ]);

      if (dashRes?.data) {
        setTripDashboard(dashRes.data);
      }
      if (Array.isArray(hubsRes?.data)) {
        setHubsOnRoute(hubsRes.data);
      }
    } catch (err) {
      console.error("Failed to load trip handover dashboard:", err);
    }
  }, []);

  useEffect(() => {
    if (selectedTripId) {
      loadTripDetails(selectedTripId);
    }
  }, [selectedTripId, loadTripDetails]);

  // Open "Schedule Driver Handover" Modal
  async function handleOpenPlanModal() {
    const tId = selectedTripId || (activeTrips.length > 0 ? String(activeTrips[0].id) : "");
    setModalTripId(tId);
    setPlanError("");
    setPlanSuccess("");
    setDriverSearch("");

    // Load corridor hubs for this trip
    if (tId) {
      try {
        const res = await api.get(`/handovers/corridor-hubs/${tId}`);
        const hubsList = Array.isArray(res.data) ? res.data : [];
        setHubsOnRoute(hubsList);
        if (hubsList.length > 0) {
          setModalHubId(String(hubsList[0].id));
        }
      } catch {
        // fallback
      }
    }

    // Default arrival time 4 hours ahead
    const arrivalDate = new Date(Date.now() + 4.5 * 3600000);
    const hours = String(arrivalDate.getHours()).padStart(2, "0");
    const minutes = String(arrivalDate.getMinutes()).padStart(2, "0");
    setModalArrivalTime(`${hours}:${minutes}`);

    // Preselect highest-wellness assignable driver
    const assignable = eligibleDrivers.filter((d) => d.is_assignable);
    if (assignable.length > 0) {
      setModalDriverId(String(assignable[0].id));
    }

    setShowPlanModal(true);
  }

  // Handle auto-planning relays for current trip
  async function handleAutoPlan() {
    if (!selectedTripId) return;
    setLoading(true);
    setError("");
    try {
      await api.post(`/handovers/auto-plan/${selectedTripId}`);
      await loadTripDetails(selectedTripId);
      await fetchGeneralData();
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setError(typeof detail === "string" ? detail : "Failed to auto-plan relays.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Schedule Handover submit
  async function handleSubmitSchedule(e) {
    e.preventDefault();
    if (!modalTripId || !modalHubId || !modalDriverId) {
      setPlanError("Please select a truck, corridor hub, and relay driver.");
      return;
    }

    setPlanning(true);
    setPlanError("");
    setPlanSuccess("");

    try {
      const trip = activeTrips.find((t) => String(t.id) === String(modalTripId));
      if (!trip) throw new Error("Selected trip not found.");

      // Construct planned handover ISO datetime
      const [hStr, mStr] = modalArrivalTime.split(":");
      const targetDate = new Date();
      targetDate.setHours(Number(hStr), Number(mStr), 0, 0);
      if (targetDate.getTime() < Date.now()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      const payload = {
        trip_id: Number(modalTripId),
        hub_id: Number(modalHubId),
        outgoing_driver_id: Number(trip.driver_id),
        incoming_driver_id: Number(modalDriverId),
        planned_handover_time: targetDate.toISOString(),
        notes: modalNotes || "Scheduled via Driver Handover Portal",
      };

      await api.post("/handovers/plan", payload);
      setPlanSuccess("Handover scheduled successfully!");
      setShowPlanModal(false);
      await loadTripDetails(modalTripId);
      await fetchGeneralData();
    } catch (err) {
      console.error("Failed to plan handover:", err);
      const detail = err.response?.data?.detail || err.message;
      setPlanError(typeof detail === "string" ? detail : "Failed to schedule handover.");
    } finally {
      setPlanning(false);
    }
  }

  // Execute Handover
  async function handleExecuteHandover(handoverId) {
    setExecuting(true);
    try {
      await api.post(`/handovers/${handoverId}/execute`, {});
      setShowReviewModal(false);
      await loadTripDetails(selectedTripId);
      await fetchGeneralData();
    } catch (err) {
      console.error("Failed to execute handover:", err);
      alert(err.response?.data?.detail || "Execution failed.");
    } finally {
      setExecuting(false);
    }
  }

  // Filtered relay drivers for searchable dropdown
  const filteredRelayDrivers = useMemo(() => {
    return eligibleDrivers.filter((d) =>
      d.name?.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.license_category?.toLowerCase().includes(driverSearch.toLowerCase())
    );
  }, [eligibleDrivers, driverSearch]);

  const selectedRelayDriverObj = eligibleDrivers.find((d) => String(d.id) === String(modalDriverId));

  // Determine active journey timeline nodes
  const currentTripObj = activeTrips.find((t) => String(t.id) === String(selectedTripId));
  const activeTimelineSegments = tripDashboard?.timeline_segments || [];

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* SECTION TOOLBAR (REFERENCE DESIGN MATCH) */}
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0071e3] dark:text-[#2997ff]">
            DRIVER HANDOVER
          </span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Keep long journeys moving safely.
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Relay driving along Indian national highways to prevent driver fatigue and guarantee zero-downtime transit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Trip Selector */}
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className="apple-input text-xs w-auto py-1.5 font-medium"
          >
            {activeTrips.length === 0 ? (
              <option value="">No Active Trips</option>
            ) : (
              activeTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.truck_registration || `Truck #${t.truck_id}`} · Trip #{t.id}
                </option>
              ))
            )}
          </select>

          <button
            onClick={handleAutoPlan}
            disabled={loading || activeTrips.length === 0}
            className="apple-btn-secondary text-xs flex items-center gap-1.5"
            title="Auto-compute compliant relay points based on 8h continuous limit"
          >
            <Sparkles size={13} className="text-[#0071e3] dark:text-[#2997ff]" />
            Auto-Plan Relays
          </button>

          <button
            onClick={handleOpenPlanModal}
            disabled={activeTrips.length === 0}
            className="apple-btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus size={14} />
            Plan a handover
          </button>

          <button
            onClick={fetchGeneralData}
            disabled={loading}
            className="apple-btn-secondary text-xs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ACTIVE JOURNEY CARD (EXACT REFERENCE DESIGN MATCH) */}
      {tripDashboard ? (
        <article className="apple-card p-7 mb-10 overflow-hidden relative">
          {/* Journey Head */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                {tripDashboard.truck_registration || "FLEET VEHICLE"} · {String(tripDashboard.trip_status).toUpperCase().replace("_", " ")}
              </span>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                {activeTimelineSegments.length > 0
                  ? [
                      activeTimelineSegments[0].from_node.split(" ")[0],
                      ...activeTimelineSegments.map((s) => s.to_node.split(" ")[0]),
                    ].join(" → ")
                  : `${tripDashboard.origin?.split(",")[0] || "Origin"} → ${tripDashboard.destination?.split(",")[0] || "Destination"}`}
              </h2>
            </div>

            {/* Handing Over Soon Badge */}
            {tripDashboard.handing_over_soon ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 animate-pulse">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                Handing over soon ({tripDashboard.minutes_until_handover}m)
              </span>
            ) : tripDashboard.pending_handover ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Clock size={12} />
                Handover scheduled at {tripDashboard.pending_handover.hub_name || "Transit Hub"}
              </span>
            ) : null}
          </div>

          {/* Timeline Visualizer */}
          <div className="my-8 overflow-x-auto pb-4">
            <div className="flex items-center min-w-[620px] px-2">
              {activeTimelineSegments.length > 0 ? (
                activeTimelineSegments.map((seg, idx) => (
                  <div key={idx} className="contents">
                    {/* Origin/Hub Node */}
                    <div className="flex flex-col items-center text-center min-w-[100px] shrink-0">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                          idx === 0
                            ? "bg-[#0071e3] text-white shadow-md shadow-blue-500/20"
                            : "border-2 border-[#755ae8] bg-[#f2efff] text-[#755ae8] dark:bg-purple-950/40"
                        }`}
                      >
                        {idx === 0 ? "●" : "⇄"}
                      </div>
                      <span className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {seg.from_node.split(" ")[0]}
                      </span>
                      <small className="mt-0.5 text-[9px] text-[#86868b]">
                        {seg.driver_name?.split(" ")[0] || "Driver"} · {idx === 0 ? "Start" : "Relay"}
                      </small>
                    </div>

                    {/* Connecting Leg */}
                    <div className="relative flex-1 text-center mx-2 -top-3">
                      <div className="border-t-2 border-dashed border-[#b8c5d7] dark:border-white/20 w-full" />
                      <span className="relative -top-2.5 inline-block bg-white dark:bg-[#1c1c1e] px-2 text-[10px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] rounded-full border border-black/[0.06] dark:border-white/[0.08]">
                        {seg.total_hours || Math.round(seg.distance_km / 45)}h
                      </span>
                      <span className="block text-[9px] text-[#86868b] mt-0.5">
                        {idx === 0 ? "initial segment" : "next segment"}
                      </span>
                    </div>

                    {/* Final Destination Node on last segment */}
                    {idx === activeTimelineSegments.length - 1 && (
                      <div className="flex flex-col items-center text-center min-w-[100px] shrink-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#34c759] text-white shadow-md shadow-green-500/20 text-xs font-bold">
                          ✓
                        </div>
                        <span className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {seg.to_node.split(" ")[0]}
                        </span>
                        <small className="mt-0.5 text-[9px] text-[#86868b]">
                          Delivery · Destination
                        </small>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="w-full text-center py-6 text-xs text-[#86868b]">
                  Click &quot;Auto-Plan Relays&quot; to calculate compliant highway nodes for this route.
                </div>
              )}
            </div>
          </div>

          {/* Handover Detail Card (Reference Layout Match) */}
          <div className="flex flex-col gap-4 rounded-xl bg-black/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06]">
            <div className="flex items-center gap-3.5">
              {/* Driver Initials Avatar */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0071e3]/10 text-xs font-bold text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                {tripDashboard.current_driver_name
                  ? tripDashboard.current_driver_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                  : "DR"}
              </div>

              <div>
                <p className="text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                  <b>{tripDashboard.current_driver_name || "Assigned Driver"}&apos;s wellness score:{" "}
                  {tripDashboard.driver_wellness?.score ?? 85} / 100</b>{" "}
                  <span className={`apple-badge ml-1.5 ${
                    (tripDashboard.driver_wellness?.score ?? 85) >= 80
                      ? "bg-[#34c759]/15 text-[#34c759] dark:text-[#30d158]"
                      : (tripDashboard.driver_wellness?.score ?? 85) >= 60
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-red-500/15 text-red-600 dark:text-red-400"
                  }`}>
                    {tripDashboard.driver_wellness?.band || "good"}
                  </span>
                </p>
                <p className="text-[11px] text-[#6e6e73] dark:text-[#86868b] mt-0.5">
                  {tripDashboard.pending_handover
                    ? `Recommended: complete handover at ${tripDashboard.pending_handover.hub_name}, then rest 8h.`
                    : "Recommended: maintain rest schedule and plan handover before 8h continuous limit."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {tripDashboard.pending_handover && (
                <button
                  onClick={() => {
                    setReviewingHandover(tripDashboard.pending_handover);
                    setShowReviewModal(true);
                  }}
                  className="apple-btn-secondary text-xs"
                >
                  Review handover
                </button>
              )}
              {tripDashboard.pending_handover && (
                <button
                  onClick={() => handleExecuteHandover(tripDashboard.pending_handover.id)}
                  disabled={executing}
                  className="apple-btn-primary text-xs"
                >
                  {executing ? "Executing..." : "Execute Relay"}
                </button>
              )}
            </div>
          </div>
        </article>
      ) : (
        <div className="apple-card p-12 text-center mb-10">
          <Route size={32} className="mx-auto mb-2 text-[#86868b] opacity-60" />
          <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            No Active Trip Selected
          </p>
          <p className="mt-1 text-[11px] text-[#86868b]">
            Select a commercial expedition from the dropdown to review and coordinate relay handovers.
          </p>
        </div>
      )}

      {/* SCHEDULED HANDOVERS QUEUE TABLE */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            All Scheduled & Historical Handovers
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Complete transfer queue with driver wellness metrics and hub arrival timestamps.
          </p>
        </div>

        {handovers.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="mx-auto h-10 w-10 text-[#86868b] mb-2 opacity-60" />
            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">No Handovers Recorded</p>
            <p className="mt-1 text-[11px] text-[#86868b]">
              Click &quot;Plan a handover&quot; to coordinate a new driver transfer.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {handovers.map((h) => (
              <div
                key={h.id}
                className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] font-mono dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                      Trip #{h.trip_id}
                    </span>
                    <span
                      className={`apple-badge ${
                        h.status === "executed"
                          ? "bg-[#34c759]/15 text-[#34c759] dark:text-[#30d158]"
                          : h.status === "cancelled"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                      }`}
                    >
                      {h.status === "executed" ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                      {h.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                    <span className="font-semibold">{h.outgoing_driver_name || `Driver #${h.outgoing_driver_id}`}</span>
                    <ArrowRight size={13} className="text-[#86868b]" />
                    <span className="apple-badge bg-black/[0.05] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#f5f5f7]">
                      <MapPin size={11} /> {h.hub_name || `Hub #${h.hub_id}`}
                    </span>
                    <ArrowRight size={13} className="text-[#86868b]" />
                    <span className="font-semibold text-[#34c759] dark:text-[#30d158]">
                      {h.incoming_driver_name || `Driver #${h.incoming_driver_id}`}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#86868b] flex items-center gap-3">
                    <span>Target Time: {h.planned_handover_time ? new Date(h.planned_handover_time).toLocaleString() : "ASAP"}</span>
                    {h.actual_handover_time && (
                      <span>Executed: {new Date(h.actual_handover_time).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>

                {h.status === "planned" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExecuteHandover(h.id)}
                      disabled={executing}
                      className="apple-btn-primary text-xs"
                    >
                      Execute
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SCHEDULE DRIVER HANDOVER MODAL (REFERENCE SPEC MATCH) */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="apple-card w-full max-w-lg p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3 dark:border-white/[0.08]">
              <div>
                <h2 className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Schedule Driver Handover
                </h2>
                <p className="text-xs text-[#6e6e73] dark:text-[#86868b] mt-0.5">
                  Coordinate relay driving to preserve driver safety and prevent fatigue.
                </p>
              </div>
              <button
                onClick={() => setShowPlanModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            {planError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 border border-red-500/20">
                <AlertCircle size={15} />
                {planError}
              </div>
            )}

            <form onSubmit={handleSubmitSchedule} className="space-y-4">
              {/* Row 1: Select Truck & Handover Hub */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Select Truck
                  </label>
                  <select
                    value={modalTripId}
                    onChange={(e) => {
                      setModalTripId(e.target.value);
                      setSelectedTripId(e.target.value);
                    }}
                    className="apple-input text-xs"
                    required
                  >
                    {activeTrips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.truck_registration || `Truck #${t.truck_id}`} (Trip #{t.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Handover Hub (On Route)
                  </label>
                  <select
                    value={modalHubId}
                    onChange={(e) => setModalHubId(e.target.value)}
                    className="apple-input text-xs"
                    required
                  >
                    {hubsOnRoute.length === 0 ? (
                      <option value="">No intermediate corridor hubs found</option>
                    ) : (
                      hubsOnRoute.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} {h.km_along_route ? `(km ${Math.round(h.km_along_route)})` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Row 2: Relay Driver (Searchable Dropdown with Wellness) & Arrival Time */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Relay Driver
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="Search driver by name..."
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      className="apple-input text-xs py-1.5 mb-1"
                    />
                    <select
                      value={modalDriverId}
                      onChange={(e) => setModalDriverId(e.target.value)}
                      className="apple-input text-xs"
                      required
                    >
                      <option value="">Select rested relay driver...</option>
                      {filteredRelayDrivers.map((d) => (
                        <option
                          key={d.id}
                          value={d.id}
                          disabled={!d.is_assignable}
                        >
                          {d.name} · Wellness: {d.wellness_score}/100 ({d.wellness_band})
                          {!d.is_assignable ? ` - BLOCKED (${d.blocking_reason})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedRelayDriverObj && (
                    <div className="mt-2 text-[10px] text-[#86868b] flex items-center justify-between bg-black/[0.02] p-2 rounded-lg dark:bg-white/[0.03]">
                      <span>Rest: <b>{selectedRelayDriverObj.rest_hours}h</b></span>
                      <span>Score: <b className="text-[#34c759]">{selectedRelayDriverObj.wellness_score}</b></span>
                      <span>Status: {selectedRelayDriverObj.is_assignable ? "Eligible" : "Blocked"}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Estimated Arrival (Time)
                  </label>
                  <input
                    type="time"
                    value={modalArrivalTime}
                    onChange={(e) => setModalArrivalTime(e.target.value)}
                    className="apple-input text-xs py-2"
                    required
                  />
                  <span className="mt-1 block text-[10px] text-[#86868b]">
                    Auto-calculated from route speed & breaks; adjustable within shift bounds.
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Relay Instructions / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inspect tire pressure, reefer temperature check"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="apple-input text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={planning || !modalDriverId || (selectedRelayDriverObj && !selectedRelayDriverObj.is_assignable)}
                  className="apple-btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {planning ? "Scheduling..." : "Confirm Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW HANDOVER MODAL */}
      {showReviewModal && reviewingHandover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="apple-card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-2 dark:border-white/[0.08]">
              <h3 className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Review Handover #{reviewingHandover.id}
              </h3>
              <button onClick={() => setShowReviewModal(false)} className="text-[#86868b]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
                <span className="text-[#86868b]">Designated Hub:</span>
                <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{reviewingHandover.hub_name}</strong>
              </div>
              <div className="flex justify-between border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
                <span className="text-[#86868b]">Current Driver:</span>
                <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{reviewingHandover.outgoing_driver_name}</strong>
              </div>
              <div className="flex justify-between border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
                <span className="text-[#86868b]">Relay Driver:</span>
                <strong className="text-[#34c759] dark:text-[#30d158]">{reviewingHandover.incoming_driver_name}</strong>
              </div>
              <div className="flex justify-between border-b border-black/[0.04] pb-2 dark:border-white/[0.06]">
                <span className="text-[#86868b]">Scheduled Time:</span>
                <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">
                  {reviewingHandover.planned_handover_time ? new Date(reviewingHandover.planned_handover_time).toLocaleString() : "ASAP"}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setShowReviewModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Close
              </button>
              <button
                onClick={() => handleExecuteHandover(reviewingHandover.id)}
                disabled={executing}
                className="apple-btn-primary text-xs"
              >
                {executing ? "Executing..." : "Execute Handover Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
