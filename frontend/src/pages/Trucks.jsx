import { useEffect, useState, useMemo } from "react";
import {
  Truck,
  RefreshCw,
  AlertCircle,
  Plus,
  X,
  Edit2,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Search,
  Fuel,
  Eye,
  Gauge,
  Wrench,
  AlertTriangle,
  ArrowRightLeft,
  FileText,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "Electric"];
const TRUCK_STATUSES = ["available", "assigned", "maintenance", "in_maintenance", "inactive"];

export default function Trucks() {
  const { user } = useAuth();
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [form, setForm] = useState({
    registration_number: "",
    capacity: "",
    fuel_type: "Diesel",
    fuel_efficiency: "",
    model: "",
    year: "",
    status: "available",
    max_speed_kmph: "80",
    avg_speed_kmph: "45",
    notes: "",
    company_id: String(user?.company_id || 1),
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTruck, setDeletingTruck] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [viewingTruck, setViewingTruck] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Maintenance Suggestions State
  const [suggestions, setSuggestions] = useState([]);

  // Send to Maintenance modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [truckToSend, setTruckToSend] = useState(null);
  const [replacementTrucks, setReplacementTrucks] = useState([]);
  const [selectedReplacementId, setSelectedReplacementId] = useState("");
  const [maintenanceReason, setMaintenanceReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState("");

  // Mark Maintained modal state
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [truckToMark, setTruckToMark] = useState(null);
  const [markForm, setMarkForm] = useState({
    maintenance_type: "Periodic Preventive Service",
    cost: "15000",
    notes: "Routine inspection, engine oil replacement, and brake pad servicing.",
    performed_by: "Central Fleet Depot Workshop",
  });

  // Maintenance Log history modal state
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTruckForLogs, setSelectedTruckForLogs] = useState(null);
  const [truckLogs, setTruckLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  async function fetchSuggestions() {
    try {
      const res = await api.get("/maintenance/suggestions");
      setSuggestions(res.data?.suggestions || []);
    } catch (e) {
      console.warn("Could not load maintenance suggestions:", e);
    }
  }

  async function fetchTrucks() {
    try {
      setLoading(true);
      setError("");
      const [trucksRes] = await Promise.all([
        api.get("/trucks/"),
        fetchSuggestions(),
      ]);
      setTrucks(Array.isArray(trucksRes.data) ? trucksRes.data : []);
    } catch (err) {
      console.error("Failed to fetch trucks:", err);
      setError("Unable to load fleet vehicles. Please verify backend connectivity.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenSendModal(truck, suggestion = null) {
    setTruckToSend(truck);
    setMaintenanceReason(suggestion?.message || `Scheduled service after ${truck.trips_since_service || 0} trips`);
    setActionError("");
    setSelectedReplacementId("");
    setShowSendModal(true);

    try {
      const res = await api.get(`/maintenance/replacements/${truck.id}`);
      setReplacementTrucks(res.data?.replacements || []);
    } catch {
      setReplacementTrucks([]);
    }
  }

  async function handleConfirmSendMaintenance() {
    if (!truckToSend) return;
    setSubmittingAction(true);
    setActionError("");

    try {
      await api.post("/maintenance/send-to-maintenance", {
        truck_id: truckToSend.id,
        replacement_truck_id: selectedReplacementId ? Number(selectedReplacementId) : null,
        reason: maintenanceReason,
        notes: "Servicing scheduled via Fleet Management",
      });
      setShowSendModal(false);
      await fetchTrucks();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Failed to send truck to maintenance.");
    } finally {
      setSubmittingAction(false);
    }
  }

  function handleOpenMarkModal(truck) {
    setTruckToMark(truck);
    setMarkForm({
      maintenance_type: "Periodic Preventive Service",
      cost: "15000",
      notes: "Routine inspection, engine oil replacement, and brake pad servicing.",
      performed_by: "Central Fleet Depot Workshop",
    });
    setActionError("");
    setShowMarkModal(true);
  }

  async function handleConfirmMarkMaintained() {
    if (!truckToMark) return;
    setSubmittingAction(true);
    setActionError("");

    try {
      await api.post("/maintenance/mark-maintained", {
        truck_id: truckToMark.id,
        maintenance_type: markForm.maintenance_type,
        cost: markForm.cost ? Number(markForm.cost) : 0,
        notes: markForm.notes,
        performed_by: markForm.performed_by,
      });
      setShowMarkModal(false);
      await fetchTrucks();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Failed to mark vehicle as maintained.");
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleOpenLogs(truck) {
    setSelectedTruckForLogs(truck);
    setShowLogsModal(true);
    setLoadingLogs(true);

    try {
      const res = await api.get(`/maintenance/logs/${truck.id}`);
      setTruckLogs(res.data?.logs || []);
    } catch {
      setTruckLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => {
    fetchTrucks();
  }, []);

  async function handleSeedFleet() {
    try {
      setSeeding(true);
      await api.post("/auth/seed-starter-fleet");
      await fetchTrucks();
    } catch (err) {
      console.error("Failed to seed fleet:", err);
    } finally {
      setSeeding(false);
    }
  }

  function handleOpenCreate() {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      registration_number: "",
      capacity: "",
      fuel_type: "Diesel",
      fuel_efficiency: "",
      model: "",
      year: "",
      status: "available",
      max_speed_kmph: "80",
      avg_speed_kmph: "45",
      notes: "",
      company_id: String(user?.company_id || 1),
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  function handleOpenEdit(truck) {
    setIsEditing(true);
    setEditingId(truck.id);
    setForm({
      registration_number: truck.registration_number || "",
      capacity: truck.capacity != null ? String(truck.capacity) : "",
      fuel_type: truck.fuel_type || "Diesel",
      fuel_efficiency: truck.fuel_efficiency != null ? String(truck.fuel_efficiency) : "",
      model: truck.model || "",
      year: truck.year != null ? String(truck.year) : "",
      status: truck.status || "available",
      max_speed_kmph: truck.max_speed_kmph != null ? String(truck.max_speed_kmph) : "80",
      avg_speed_kmph: truck.avg_speed_kmph != null ? String(truck.avg_speed_kmph) : "45",
      notes: truck.notes || "",
      company_id: String(truck.company_id || user?.company_id || 1),
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const maxS = Number(form.max_speed_kmph || 80);
      const avgS = Number(form.avg_speed_kmph || 45);

      if (maxS < 20 || maxS > 120) {
        setFormError("Max speed must be between 20 and 120 km/h.");
        setSaving(false);
        return;
      }
      if (avgS < 10 || avgS > maxS) {
        setFormError(`Average cruising speed must be between 10 km/h and max speed (${maxS} km/h).`);
        setSaving(false);
        return;
      }

      const params = {
        registration_number: form.registration_number.trim(),
        capacity: Number(form.capacity),
        fuel_type: form.fuel_type.trim(),
        status: form.status,
        max_speed_kmph: maxS,
        avg_speed_kmph: avgS,
      };

      if (form.fuel_efficiency !== "") params.fuel_efficiency = Number(form.fuel_efficiency);
      if (form.model) params.model = form.model.trim();
      if (form.year) params.year = Number(form.year);
      if (form.notes) params.notes = form.notes.trim();

      if (isEditing) {
        await api.put(`/trucks/${editingId}`, null, { params });
        setFormSuccess("Vehicle updated.");
      } else {
        params.company_id = Number(user?.company_id || form.company_id || 1);
        await api.post("/trucks/", null, { params });
        setFormSuccess("Vehicle registered.");
      }

      setTimeout(() => {
        setShowModal(false);
        fetchTrucks();
      }, 500);
    } catch (err) {
      console.error("Save truck error:", err);
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "Failed to save vehicle details.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenDelete(truck) {
    setDeletingTruck(truck);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete(force = false) {
    if (!deletingTruck) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/trucks/${deletingTruck.id}`, { params: { force } });
      setShowDeleteModal(false);
      fetchTrucks();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setDeleteError(
        typeof detail === "string"
          ? detail
          : "Cannot delete vehicle with active trips."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeactivateInstead() {
    if (!deletingTruck) return;
    setIsDeleting(true);
    try {
      await api.patch(`/trucks/${deletingTruck.id}/deactivate`);
      setShowDeleteModal(false);
      fetchTrucks();
    } catch {
      setDeleteError("Failed to deactivate vehicle.");
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredTrucks = useMemo(() => {
    return trucks.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        t.registration_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.model?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = selectedStatus === "all" || t.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [trucks, searchQuery, selectedStatus]);

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Fleet Inventory
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Fleet & Vehicles
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Manage truck payload capacity, fuel metrics, and operational readiness.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff] border border-[#0071e3]/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3] dark:bg-[#2997ff] animate-pulse" />
              Isolated Workspace: {user?.company_name || `Workspace #${user?.company_id || 1}`} (User ID: {user?.id || 1})
            </span>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button onClick={handleOpenCreate} className="apple-btn-primary text-xs">
            <Plus size={14} />
            Register Truck
          </button>
          <button
            onClick={fetchTrucks}
            disabled={loading}
            className="apple-btn-secondary text-xs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Vehicles</span>
            <Truck size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : trucks.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Registered fleet assets</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Available for Dispatch</span>
            <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : trucks.filter((t) => t.status === "available").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Ready for allocation</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Assigned / In Transit</span>
            <Fuel size={18} className="text-[#ff9500] dark:text-[#ff9f0a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : trucks.filter((t) => t.status === "assigned").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Currently en route</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Maintenance Attention</span>
            <Wrench size={18} className="text-amber-500" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-amber-500">
            {loading ? "—" : suggestions.length + trucks.filter((t) => t.status === "maintenance" || t.status === "in_maintenance").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Vehicles due / grounded</p>
        </div>
      </div>

      {/* Maintenance Suggestion Cards Section */}
      {suggestions.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                Fleet Maintenance Suggestions ({suggestions.length})
              </h2>
              <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                Automated threshold monitoring: Service warning at ≥ 20 trips, service due at ≥ 30 trips.
              </p>
            </div>
            <span className="apple-badge bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
              Action Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((sug) => {
              const truckObj = trucks.find((t) => t.id === sug.truck_id) || {
                id: sug.truck_id,
                registration_number: sug.registration_number,
                capacity: sug.capacity,
                model: sug.model,
                trips_since_service: sug.trips_since_service,
                km_since_service: sug.km_since_service,
                status: sug.status,
              };

              return (
                <div
                  key={sug.truck_id}
                  className={`apple-card p-5 border flex flex-col justify-between transition ${
                    sug.urgency === "due"
                      ? "border-red-500/30 bg-red-500/[0.02] dark:bg-red-500/[0.04]"
                      : "border-amber-500/30 bg-amber-500/[0.02] dark:bg-amber-500/[0.04]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {sug.registration_number}
                        </span>
                        <span className="text-xs text-[#86868b]">
                          {sug.model}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                          sug.urgency === "due"
                            ? "bg-red-500/10 text-red-600 border-red-500/25 dark:bg-red-500/20 dark:text-red-400"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        <Wrench size={10} />
                        {sug.urgency === "due" ? "Service Due (≥30 trips)" : "Service Recommended (≥20 trips)"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {sug.message}
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#6e6e73] dark:text-[#86868b]">
                      <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.03] p-2">
                        <span className="block text-[10px] text-[#86868b]">Completed Trips</span>
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {sug.trips_since_service} trips
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.03] p-2">
                        <span className="block text-[10px] text-[#86868b]">Km Since Svc</span>
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {sug.km_since_service ? Math.round(sug.km_since_service).toLocaleString() : 0} km
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.03] p-2">
                        <span className="block text-[10px] text-[#86868b]">Capacity</span>
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {sug.capacity} T
                        </span>
                      </div>
                    </div>

                    {sug.active_trip && (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                        <span className="font-semibold">Active Trip #{sug.active_trip.id} ({sug.active_trip.origin} → {sug.active_trip.destination}):</span> Immediate grounding blocked until trip completes. Replacement truck will be scheduled for next run.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenSendModal(truckObj, sug)}
                      className="apple-btn-secondary text-xs py-1.5 flex items-center gap-1.5"
                    >
                      <ArrowRightLeft size={13} />
                      Send to Maintenance
                    </button>
                    <button
                      onClick={() => handleOpenMarkModal(truckObj)}
                      className="apple-btn-primary text-xs py-1.5 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={13} />
                      Mark as Maintained
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="apple-card p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <Search size={15} className="text-[#86868b]" />
          <input
            type="text"
            placeholder="Search by registration number or model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none dark:text-[#f5f5f7]"
          />
        </div>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="apple-input text-xs w-auto py-1.5"
        >
          <option value="all">All Statuses</option>
          {TRUCK_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Fleet Vehicle Directory
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Direct database records from SQLite fleet inventory.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading vehicles...</p>
        ) : filteredTrucks.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-[#86868b] mb-3">No vehicles found in workspace #{user?.company_id || 1}.</p>
            <button
              onClick={handleSeedFleet}
              disabled={seeding}
              className="apple-button-secondary text-xs px-4 py-2"
            >
              {seeding ? "Loading Starter Fleet..." : "Load Sample Starter Fleet for this Account"}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Registration & Model</th>
                  <th className="px-6 py-3.5">Payload & Speed</th>
                  <th className="px-6 py-3.5">Fuel & Economy</th>
                  <th className="px-6 py-3.5">Service Health</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {filteredTrucks.map((truck) => {
                  const tripsSince = truck.trips_since_service || 0;
                  const isDue = tripsSince >= 30;
                  const isWarning = tripsSince >= 20;

                  return (
                    <tr key={truck.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-[#86868b]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">#{truck.id}</span>
                          <span className="text-[10px] text-[#0071e3] dark:text-[#2997ff] font-sans font-medium">
                            User #{truck.user_id || user?.id || 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {truck.registration_number || `Truck #${truck.id}`}
                        </p>
                        <p className="text-[11px] text-[#86868b]">
                          {truck.model || "Heavy Hauler"} {truck.year ? `(${truck.year})` : ""}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {truck.capacity ? `${Number(truck.capacity).toLocaleString()} kg` : "—"}
                        </p>
                        <p className="text-[10px] text-[#86868b]">
                          {truck.avg_speed_kmph || 45} km/h avg · max {truck.max_speed_kmph || 80}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                        <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {truck.mileage_kmpl || truck.fuel_efficiency || "4.5"} km/L
                        </span>
                        <p className="text-[10px] text-[#86868b]">{truck.fuel_type || "Diesel"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                              {tripsSince} trips
                            </span>
                            {isDue ? (
                              <span className="apple-badge bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 text-[9px] py-0">
                                Due (≥30)
                              </span>
                            ) : isWarning ? (
                              <span className="apple-badge bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[9px] py-0">
                                Warn (≥20)
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-[#86868b]">
                            {truck.km_since_service ? Math.round(truck.km_since_service).toLocaleString() : 0} km since service
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`apple-badge ${
                          truck.status === "available"
                            ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                            : truck.status === "assigned"
                            ? "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                            : truck.status === "maintenance" || truck.status === "in_maintenance"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                            : "bg-black/[0.05] text-[#86868b] dark:bg-white/[0.08]"
                        }`}>
                          {truck.status === "maintenance" ? "Maintenance" : truck.status || "Unknown"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenLogs(truck)}
                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                            title="Maintenance Service History"
                          >
                            <Wrench size={14} />
                          </button>
                          {truck.status === "maintenance" ? (
                            <button
                              onClick={() => handleOpenMarkModal(truck)}
                              className="p-1 rounded-md text-[#34c759] hover:bg-[#34c759]/10 transition"
                              title="Mark Servicing Complete"
                            >
                              <CheckCircle2 size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenSendModal(truck)}
                              className="p-1 rounded-md text-amber-500 hover:bg-amber-500/10 transition"
                              title="Send to Maintenance"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setViewingTruck(truck);
                              setShowDetailsModal(true);
                            }}
                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                            title="View Vehicle Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(truck)}
                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                            title="Edit Vehicle"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenDelete(truck)}
                            className="p-1 rounded-md text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition"
                            title="Delete Vehicle"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {isEditing ? `Edit Vehicle #${editingId}` : "Register Vehicle"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Registration Number *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.registration_number}
                    onChange={(e) =>
                      setForm({ ...form, registration_number: e.target.value.toUpperCase() })
                    }
                    placeholder="DL01XY7788"
                    className="apple-input font-mono uppercase text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Payload Capacity (kg) *
                  </label>
                  <input
                    required
                    type="number"
                    min="100"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    placeholder="15000"
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Fuel Type
                  </label>
                  <select
                    value={form.fuel_type}
                    onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Fuel Economy (km/L)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.fuel_efficiency}
                    onChange={(e) => setForm({ ...form, fuel_efficiency: e.target.value })}
                    placeholder="8.5"
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Tata Signa"
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                    placeholder="2023"
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {TRUCK_STATUSES.map((st) => (
                      <option key={st} value={st}>{st.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Truck Speed Limits & Cruising Average */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06]">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Max Speed Limit (km/h) *
                  </label>
                  <input
                    required
                    type="number"
                    min="20"
                    max="120"
                    step="1"
                    value={form.max_speed_kmph}
                    onChange={(e) => setForm({ ...form, max_speed_kmph: e.target.value })}
                    placeholder="80"
                    className="apple-input text-xs"
                  />
                  <p className="mt-1 text-[10px] text-[#86868b]">
                    Mechanical & legal limit (20–120 km/h)
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Average Cruising Speed (km/h) *
                  </label>
                  <input
                    required
                    type="number"
                    min="10"
                    max={form.max_speed_kmph || 120}
                    step="1"
                    value={form.avg_speed_kmph}
                    onChange={(e) => setForm({ ...form, avg_speed_kmph: e.target.value })}
                    placeholder="45"
                    className="apple-input text-xs"
                  />
                  <p className="mt-1 text-[10px] text-[#86868b]">
                    Average speed is used for ETA and live tracking (must be ≤ max speed)
                  </p>
                </div>
              </div>

              {formError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="rounded-xl border border-[#34c759]/20 bg-[#34c759]/10 p-3 text-xs text-[#34c759] dark:text-[#30d158]">
                  {formSuccess}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="apple-btn-primary text-xs"
                >
                  {saving ? "Saving..." : isEditing ? "Update Vehicle" : "Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm apple-card p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-sm font-semibold">Delete Vehicle</h3>
            </div>

            <p className="mt-2.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Confirm deletion of vehicle <strong className="font-mono text-[#1d1d1f] dark:text-[#f5f5f7]">{deletingTruck.registration_number || `#${deletingTruck.id}`}</strong>?
            </p>

            {deleteError && (
              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-[#ff9500] dark:text-[#ff9f0a]">
                <p>{deleteError}</p>
                <button
                  type="button"
                  onClick={handleDeactivateInstead}
                  disabled={isDeleting}
                  className="apple-btn-secondary mt-2 text-[11px] py-1"
                >
                  Deactivate Instead
                </button>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(false)}
                disabled={isDeleting}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Vehicle Details Panel / Modal */}
      {showDetailsModal && viewingTruck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Vehicle Specifications
                  </h3>
                  <p className="text-xs text-[#86868b] font-mono">
                    {viewingTruck.registration_number || `Truck #${viewingTruck.id}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Speed Model Settings Card */}
              <div className="rounded-xl border border-[#0071e3]/20 bg-[#0071e3]/5 p-4 dark:border-[#2997ff]/20 dark:bg-[#2997ff]/5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0071e3] dark:text-[#2997ff]">
                  <Gauge size={15} />
                  <span>Speed Configuration & Telemetry Model</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg bg-white p-3 border border-black/[0.06] dark:bg-[#1c1c1e] dark:border-white/[0.08]">
                    <span className="text-[10px] text-[#86868b] block">Max Speed Limit</span>
                    <span className="text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-mono">
                      {viewingTruck.max_speed_kmph || 80} km/h
                    </span>
                    <span className="text-[9px] text-[#86868b] block mt-0.5">Mechanical / legal limit</span>
                  </div>
                  <div className="rounded-lg bg-white p-3 border border-black/[0.06] dark:bg-[#1c1c1e] dark:border-white/[0.08]">
                    <span className="text-[10px] text-[#86868b] block">Cruising Average</span>
                    <span className="text-sm font-bold text-[#0071e3] dark:text-[#2997ff] font-mono">
                      {viewingTruck.avg_speed_kmph || 45} km/h
                    </span>
                    <span className="text-[9px] text-[#86868b] block mt-0.5">Standard transit cruise</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#6e6e73] dark:text-[#86868b] leading-relaxed pt-1">
                  💡 <strong>Average speed is used for ETA and live tracking</strong> across GPS simulation, load allocation, and multi-day scheduler routes.
                </p>
              </div>

              {/* General Vehicle Specs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-black/[0.02] p-3 border border-black/[0.04] dark:bg-white/[0.02] dark:border-white/[0.06]">
                  <span className="text-[10px] text-[#86868b] block">Model & Year</span>
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {viewingTruck.model || "Standard Heavy Commercial"} {viewingTruck.year ? `(${viewingTruck.year})` : ""}
                  </span>
                </div>
                <div className="rounded-xl bg-black/[0.02] p-3 border border-black/[0.04] dark:bg-white/[0.02] dark:border-white/[0.06]">
                  <span className="text-[10px] text-[#86868b] block">Operational Status</span>
                  <span className="text-xs font-semibold capitalize text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {viewingTruck.status || "available"}
                  </span>
                </div>
                <div className="rounded-xl bg-black/[0.02] p-3 border border-black/[0.04] dark:bg-white/[0.02] dark:border-white/[0.06]">
                  <span className="text-[10px] text-[#86868b] block">Payload Capacity</span>
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {viewingTruck.capacity ? `${Number(viewingTruck.capacity).toLocaleString()} kg` : "—"}
                  </span>
                </div>
                <div className="rounded-xl bg-black/[0.02] p-3 border border-black/[0.04] dark:bg-white/[0.02] dark:border-white/[0.06]">
                  <span className="text-[10px] text-[#86868b] block">Fuel Type & Economy</span>
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {viewingTruck.fuel_type || "Diesel"} {viewingTruck.fuel_efficiency ? `• ${viewingTruck.fuel_efficiency} km/L` : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  setShowDetailsModal(false);
                  handleOpenEdit(viewingTruck);
                }}
                className="apple-btn-secondary text-xs flex items-center gap-1.5"
              >
                <Edit2 size={13} />
                Edit Vehicle
              </button>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="apple-btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to Maintenance Modal */}
      {showSendModal && truckToSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Wrench size={18} />
                <h3 className="text-base font-semibold">Send Vehicle to Maintenance</h3>
              </div>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {truckToSend.registration_number || `Truck #${truckToSend.id}`}
                  </span>
                  <span className="apple-badge bg-amber-500/10 text-amber-600 dark:text-amber-400 capitalize">
                    {truckToSend.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#86868b] mt-1">
                  {truckToSend.model} · {truckToSend.capacity} Tons capacity · {truckToSend.trips_since_service || 0} completed trips
                </p>
              </div>

              {truckToSend.status === "assigned" && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-semibold block mb-0.5">⚠️ Active Trip En Route</span>
                  This vehicle is currently on an active highway run. Immediate grounding is blocked, but scheduling will exclude it from any future load allocations and ground it immediately upon delivery.
                </div>
              )}

              {/* Next Suggested Vehicle / Replacement selection */}
              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1.5">
                  Next Suggested Vehicle (Replacement Truck)
                </label>
                <p className="text-[11px] text-[#86868b] mb-2">
                  Select an available truck with similar or larger capacity ({truckToSend.capacity} T) to take over any planned trips:
                </p>

                {replacementTrucks.length === 0 ? (
                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] dark:border-white/[0.06] p-3 text-[#86868b]">
                    No immediate replacement truck available in fleet with ≥ {truckToSend.capacity} T payload. Planned trips will be held for re-assignment.
                  </div>
                ) : (
                  <select
                    value={selectedReplacementId}
                    onChange={(e) => setSelectedReplacementId(e.target.value)}
                    className="apple-input text-xs w-full"
                  >
                    <option value="">-- No replacement (hold planned trips) --</option>
                    {replacementTrucks.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.registration_number} · {rep.model || "Commercial"} ({rep.capacity} T · {rep.mileage_kmpl || "4.5"} km/L)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Maintenance Reason / Defect Notes
                </label>
                <textarea
                  rows={2}
                  value={maintenanceReason}
                  onChange={(e) => setMaintenanceReason(e.target.value)}
                  className="apple-input text-xs w-full resize-none"
                  placeholder="e.g. Periodic maintenance due, routine 30-trip inspection"
                />
              </div>

              {actionError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-red-600 dark:text-red-400">
                  {actionError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowSendModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendMaintenance}
                disabled={submittingAction}
                className="apple-btn-primary text-xs"
              >
                {submittingAction ? "Processing..." : "Confirm & Send to Maintenance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Maintained Modal */}
      {showMarkModal && truckToMark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#34c759] dark:text-[#30d158]">
                <CheckCircle2 size={18} />
                <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Mark Vehicle as Maintained</h3>
              </div>
              <button
                onClick={() => setShowMarkModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                <span className="font-mono text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  {truckToMark.registration_number || `Truck #${truckToMark.id}`}
                </span>
                <p className="text-[11px] text-[#86868b] mt-0.5">
                  Completed {truckToMark.trips_since_service || 0} trips · {truckToMark.km_since_service ? Math.round(truckToMark.km_since_service) : 0} km since last service
                </p>
                <div className="mt-2 text-[11px] text-[#34c759] dark:text-[#30d158] font-medium">
                  ✓ This action will reset trips_since_service to 0, km_since_service to 0, update last_service_date to today, and restore truck status to available.
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Service / Maintenance Type
                </label>
                <input
                  type="text"
                  value={markForm.maintenance_type}
                  onChange={(e) => setMarkForm({ ...markForm, maintenance_type: e.target.value })}
                  className="apple-input text-xs w-full"
                  placeholder="e.g. Periodic Preventive Service, Engine Oil & Brakes"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Servicing Cost (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={markForm.cost}
                    onChange={(e) => setMarkForm({ ...markForm, cost: e.target.value })}
                    className="apple-input text-xs w-full"
                    placeholder="15000"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Facility / Performed By
                  </label>
                  <input
                    type="text"
                    value={markForm.performed_by}
                    onChange={(e) => setMarkForm({ ...markForm, performed_by: e.target.value })}
                    className="apple-input text-xs w-full"
                    placeholder="Central Fleet Workshop"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Work Order Notes & Parts Replaced
                </label>
                <textarea
                  rows={2}
                  value={markForm.notes}
                  onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })}
                  className="apple-input text-xs w-full resize-none"
                  placeholder="e.g. Replaced oil filter, engine oil, front brake pads inspected and cleared"
                />
              </div>

              {actionError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-red-600 dark:text-red-400">
                  {actionError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowMarkModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkMaintained}
                disabled={submittingAction}
                className="apple-btn-primary text-xs"
              >
                {submittingAction ? "Updating..." : "Confirm & Restore to Available"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Logs Modal */}
      {showLogsModal && selectedTruckForLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl apple-card p-6 shadow-2xl overflow-y-auto max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
                <div>
                  <h3 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Maintenance & Service History
                  </h3>
                  <p className="text-xs text-[#86868b]">
                    {selectedTruckForLogs.registration_number} (Vehicle #{selectedTruckForLogs.id} · {selectedTruckForLogs.model})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowLogsModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              {loadingLogs ? (
                <p className="p-6 text-center text-xs text-[#86868b]">Loading maintenance records...</p>
              ) : truckLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#86868b]">
                  <Wrench size={24} className="mx-auto mb-2 opacity-40" />
                  No maintenance records logged yet for this vehicle.
                </div>
              ) : (
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08] text-[10px] uppercase text-[#86868b]">
                      <tr>
                        <th className="px-3.5 py-2.5">Date</th>
                        <th className="px-3.5 py-2.5">Action</th>
                        <th className="px-3.5 py-2.5">Type & Notes</th>
                        <th className="px-3.5 py-2.5">Cost</th>
                        <th className="px-3.5 py-2.5">Trips at Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                      {truckLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                          <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#86868b]">
                            {log.date ? new Date(log.date).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold capitalize">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                              log.action === "marked_maintained"
                                ? "bg-[#34c759]/10 text-[#34c759]"
                                : "bg-amber-500/10 text-amber-600"
                            }`}>
                              {log.action?.replace("_", " ") || "Servicing"}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <p className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                              {log.maintenance_type || "Routine Service"}
                            </p>
                            {log.notes && (
                              <p className="text-[11px] text-[#86868b] mt-0.5">{log.notes}</p>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-[#1d1d1f] dark:text-[#f5f5f7]">
                            {log.cost ? `₹${Number(log.cost).toLocaleString()}` : "—"}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#86868b]">
                            {log.trips_at_time ?? "—"} trips · {log.km_at_time ? Math.round(log.km_at_time).toLocaleString() : 0} km
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowLogsModal(false)}
                className="apple-btn-primary text-xs"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
