import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  X,
  AlertCircle,
  Edit2,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Phone,
  Search,
  Activity,
  HeartPulse,
  BatteryCharging,
  Info,
  Moon,
  UploadCloud,
  FileSpreadsheet,
  Check,
  Clock,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const LICENSE_CATEGORIES = [
  "Heavy Vehicle",
  "Commercial Medium",
  "Light Motor Vehicle",
  "Hazardous Materials Endorsement",
  "Multi-Axle Trailer",
];

const DRIVER_STATUSES = ["available", "assigned", "busy", "off_duty", "inactive"];

export default function Drivers() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
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
    name: "",
    license_category: "Heavy Vehicle",
    license_number: "",
    phone: "",
    experience_years: 5,
    working_hours: 8,
    rest_hours: 8,
    status: "available",
    notes: "",
    company_id: user?.company_id || 1,
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Driver Wellness Modal State
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [selectedDriverForWellness, setSelectedDriverForWellness] = useState(null);
  const [wellnessHistory, setWellnessHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [recomputingWellness, setRecomputingWellness] = useState(false);

  // Send to Rest Modal State
  const [showRestModal, setShowRestModal] = useState(false);
  const [driverForRest, setDriverForRest] = useState(null);
  const [restDurationHours, setRestDurationHours] = useState(8);
  const [restStartTime, setRestStartTime] = useState(0);
  const [restNotes, setRestNotes] = useState("");
  const [submittingRest, setSubmittingRest] = useState(false);
  const [restError, setRestError] = useState("");
  const [restSuccess, setRestSuccess] = useState("");

  // Bulk Import Modal State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");

  async function fetchDrivers() {
    try {
      setLoading(true);
      setError("");
      const response = await api.get("/drivers/");
      setDrivers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
      setError("Unable to load fleet drivers. Please verify the backend service.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDrivers();
  }, []);

  function handleOpenCreate() {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      name: "",
      license_category: "Heavy Vehicle",
      license_number: "",
      phone: "",
      experience_years: 5,
      working_hours: 8,
      rest_hours: 8,
      status: "available",
      notes: "",
      company_id: user?.company_id || 1,
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  function handleOpenEdit(driver) {
    setIsEditing(true);
    setEditingId(driver.id);
    setForm({
      name: driver.name || "",
      license_category: driver.license_category || "Heavy Vehicle",
      license_number: driver.license_number || "",
      phone: driver.phone || "",
      experience_years: driver.experience_years != null ? driver.experience_years : 0,
      working_hours: driver.working_hours != null ? driver.working_hours : 8,
      rest_hours: driver.rest_hours != null ? driver.rest_hours : 8,
      status: driver.status || "available",
      notes: driver.notes || "",
      company_id: driver.company_id || user?.company_id || 1,
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  async function handleOpenWellness(driver) {
    setSelectedDriverForWellness(driver);
    setShowWellnessModal(true);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/drivers/${driver.id}/wellness/history`);
      setWellnessHistory(res.data?.history || []);
    } catch {
      setWellnessHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleRecomputeWellness(driverId) {
    setRecomputingWellness(true);
    try {
      const res = await api.post(`/drivers/${driverId}/wellness/recompute`);
      if (res.data?.wellness) {
        setSelectedDriverForWellness((prev) =>
          prev ? { ...prev, ...res.data.wellness, wellness_score: res.data.wellness.score, wellness_band: res.data.wellness.band } : prev
        );
        // Refresh full driver list
        await fetchDrivers();
        // Refresh history
        const hRes = await api.get(`/drivers/${driverId}/wellness/history`);
        setWellnessHistory(hRes.data?.history || []);
      }
    } catch (err) {
      console.error("Failed to recompute wellness:", err);
    } finally {
      setRecomputingWellness(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const params = {
        name: form.name.trim(),
        license_category: form.license_category.trim(),
        experience_years: Number(form.experience_years) || 0,
        working_hours: Number(form.working_hours) || 0,
        rest_hours: Number(form.rest_hours) || 0,
        status: form.status,
      };

      if (form.license_number) params.license_number = form.license_number.trim();
      if (form.phone) params.phone = form.phone.trim();
      if (form.notes) params.notes = form.notes.trim();

      if (isEditing) {
        await api.put(`/drivers/${editingId}`, null, { params });
        setFormSuccess("Driver updated.");
      } else {
        params.company_id = Number(user?.company_id || form.company_id || 1);
        await api.post("/drivers/", null, { params });
        setFormSuccess("Driver registered.");
      }

      setTimeout(() => {
        setShowModal(false);
        fetchDrivers();
      }, 500);
    } catch (err) {
      console.error("Save driver error:", err);
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "Failed to save driver details.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenDelete(driver) {
    setDeletingDriver(driver);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete(force = false) {
    if (!deletingDriver) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/drivers/${deletingDriver.id}`, { params: { force } });
      setShowDeleteModal(false);
      fetchDrivers();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setDeleteError(
        typeof detail === "string"
          ? detail
          : "Cannot delete driver with active trips."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeactivateInstead() {
    if (!deletingDriver) return;
    setIsDeleting(true);
    try {
      await api.patch(`/drivers/${deletingDriver.id}/deactivate`);
      setShowDeleteModal(false);
      fetchDrivers();
    } catch {
      setDeleteError("Failed to deactivate driver.");
    } finally {
      setIsDeleting(false);
    }
  }

  function parseDriverCSV(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fall back to line parser
      }
    }
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = parts[idx] !== undefined ? parts[idx] : "";
      });
      if (obj.name) {
        results.push({
          name: obj.name,
          license_category: obj.license_category || obj.license_type || "Heavy Vehicle",
          license_number: obj.license_number || obj.license || "",
          phone: obj.phone || obj.mobile || "",
          experience_years: Number(obj.experience_years || obj.experience) || 3,
          working_hours: Number(obj.working_hours || obj.shift_hours) || 8,
          rest_hours: Number(obj.rest_hours) || 8,
          notes: obj.notes || "",
          status: obj.status || "available",
        });
      }
    }
    return results;
  }

  function handleOpenRestModal(driver) {
    setDriverForRest(driver);
    setRestDurationHours(8);
    setRestStartTime(Date.now());
    setRestNotes("");
    setRestError("");
    setRestSuccess("");
    setShowRestModal(true);
  }

  async function handleSubmitRest(e) {
    if (e) e.preventDefault();
    if (!driverForRest) return;
    setSubmittingRest(true);
    setRestError("");
    setRestSuccess("");
    try {
      const res = await api.post(`/drivers/${driverForRest.id}/send-to-rest`, {
        rest_hours: Number(restDurationHours) || 8,
        notes: restNotes.trim() || undefined,
      });
      setRestSuccess(res.data?.message || "Driver sent to mandatory rest.");
      await fetchDrivers();
      setTimeout(() => {
        setShowRestModal(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to send driver to rest:", err);
      const detail = err.response?.data?.detail;
      setRestError(typeof detail === "string" ? detail : "Failed to assign driver rest.");
    } finally {
      setSubmittingRest(false);
    }
  }

  async function handleEndRest(driver) {
    if (!window.confirm(`Complete mandatory rest early for ${driver.name} and restore to Available status?`)) {
      return;
    }
    try {
      await api.post(`/drivers/${driver.id}/end-rest`);
      await fetchDrivers();
    } catch (err) {
      console.error("Failed to end rest:", err);
      alert("Failed to end rest. Please try again.");
    }
  }

  function handleOpenBulkModal() {
    setBulkText("");
    setBulkError("");
    setBulkSuccess("");
    setShowBulkModal(true);
  }

  const sampleDriversCSV = `name,license_category,license_number,phone,experience_years,working_hours,rest_hours,notes
Rajesh Kumar,Heavy Vehicle,MH0120200012345,+91 98201 12345,8,8,8,Senior Interstate Driver
Vikram Singh,Multi-Axle Trailer,DL0420180056789,+91 98112 56789,12,8,10,Specialized Heavy Haul
Amit Sharma,Commercial Medium,KA0520210098765,+91 98450 98765,5,8,8,South Freight Corridor
Mohammed Irfan,Heavy Vehicle,TS0920190043210,+91 98661 43210,7,8,8,Central Transit Specialist
Suresh Patel,Hazardous Materials Endorsement,GJ0120170067890,+91 98250 67890,10,8,12,Hazmat Tanker Certified`;

  function handleLoadSampleDrivers() {
    setBulkText(sampleDriversCSV);
    setBulkError("");
  }

  function handleFileBulkDrivers(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBulkText(event.target?.result || "");
      setBulkError("");
    };
    reader.readAsText(file);
  }

  const parsedBulkDrivers = useMemo(() => {
    return parseDriverCSV(bulkText);
  }, [bulkText]);

  async function handleSubmitBulkDrivers(e) {
    e.preventDefault();
    if (!parsedBulkDrivers || parsedBulkDrivers.length === 0) {
      setBulkError("No valid drivers parsed. Please check CSV/JSON format.");
      return;
    }
    setBulkSubmitting(true);
    setBulkError("");
    setBulkSuccess("");
    try {
      const res = await api.post("/drivers/bulk", { drivers: parsedBulkDrivers });
      setBulkSuccess(res.data?.message || `Successfully imported ${parsedBulkDrivers.length} drivers.`);
      await fetchDrivers();
      setTimeout(() => {
        setShowBulkModal(false);
      }, 1200);
    } catch (err) {
      console.error("Bulk driver import failed:", err);
      const detail = err.response?.data?.detail;
      let errorMsg = "Failed to import drivers in bulk.";
      if (typeof detail === "string") {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        errorMsg = detail
          .map((d) => (d.msg ? `${d.loc ? d.loc.slice(-1)[0] + ": " : ""}${d.msg}` : JSON.stringify(d)))
          .join(", ");
      } else if (err.message) {
        errorMsg = err.message;
      }
      setBulkError(errorMsg);
    } finally {
      setBulkSubmitting(false);
    }
  }

  function formatRestUntil(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  }

  const calculatedAvailableDate = useMemo(() => {
    const base = restStartTime > 0 ? restStartTime : 0;
    const d = new Date(base + (Number(restDurationHours) || 8) * 3600 * 1000);
    return d.toLocaleString("en-IN", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [restStartTime, restDurationHours]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      const matchesSearch =
        !searchQuery ||
        d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.license_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone?.includes(searchQuery);

      const matchesStatus = selectedStatus === "all" || d.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [drivers, searchQuery, selectedStatus]);

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Personnel Operations
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Drivers & Crew
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Driver certifications, compliance monitoring, and duty rest enforcement.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff] border border-[#0071e3]/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3] dark:bg-[#2997ff] animate-pulse" />
              Isolated Workspace: {user?.company_name || `Workspace #${user?.company_id || 1}`} (User ID: {user?.id || 1})
            </span>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button onClick={handleOpenBulkModal} className="apple-btn-secondary text-xs">
            <UploadCloud size={14} />
            Bulk Import
          </button>
          <button onClick={handleOpenCreate} className="apple-btn-primary text-xs">
            <Plus size={14} />
            Register Driver
          </button>
          <button
            onClick={fetchDrivers}
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
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Registered Drivers</span>
            <Users size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : drivers.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Active personnel</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Available for Dispatch</span>
            <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : drivers.filter((d) => d.status === "available" && d.is_assignable !== false).length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Rest compliant & ready</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Good Wellness (≥80)</span>
            <HeartPulse size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : drivers.filter((d) => (d.wellness_score ?? 100) >= 80).length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Optimal alertness & low fatigue</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Needs Rest / Blocked</span>
            <BatteryCharging size={18} className="text-[#ff3b30] dark:text-[#ff453a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#ff3b30] dark:text-[#ff453a]">
            {loading ? "—" : drivers.filter((d) => (d.wellness_score ?? 100) < 60 || d.is_assignable === false).length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Blocked from trip dispatch</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="apple-card p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <Search size={15} className="text-[#86868b]" />
          <input
            type="text"
            placeholder="Search by driver name, license, or phone..."
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
          {DRIVER_STATUSES.map((st) => (
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
            Driver Crew Directory
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Verified crew personnel with shift schedules and rest compliance data.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading drivers...</p>
        ) : filteredDrivers.length === 0 ? (
          <p className="p-8 text-center text-xs text-[#86868b]">No drivers found matching criteria.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Driver & Contact</th>
                  <th className="px-6 py-3.5">License Category</th>
                  <th className="px-6 py-3.5">Shift & Rest</th>
                  <th className="px-6 py-3.5">Wellness Score (0-100)</th>
                  <th className="px-6 py-3.5">Dispatch Readiness</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-[#86868b]">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">#{driver.id}</span>
                        <span className="text-[10px] text-[#0071e3] dark:text-[#2997ff] font-sans font-medium">
                          User #{driver.user_id || user?.id || 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{driver.name}</p>
                      {driver.phone && (
                        <p className="flex items-center gap-1 text-[11px] text-[#86868b] mt-0.5">
                          <Phone size={10} /> {driver.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="apple-badge bg-black/[0.04] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#f5f5f7]">
                        {driver.license_category || "Standard"}
                      </span>
                      {driver.license_number && (
                        <p className="font-mono text-[10px] text-[#86868b] mt-0.5">
                          {driver.license_number}
                        </p>
                      )}
                      {driver.experience_years != null && (
                        <p className="text-[10px] text-[#86868b] mt-0.5">
                          {driver.experience_years} yrs exp
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      <span>Max {driver.working_hours || 8}h shift</span>
                      <span className="text-[#86868b]"> • </span>
                      <span>{driver.rest_hours || 8}h rest</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                              (driver.wellness_score ?? 100) >= 80
                                ? "bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25 dark:bg-[#30d158]/15 dark:text-[#30d158]"
                                : (driver.wellness_score ?? 100) >= 60
                                ? "bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/25 dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                                : "bg-red-500/10 text-red-600 border-red-500/25 dark:bg-red-500/15 dark:text-red-400"
                            }`}
                          >
                            <HeartPulse size={12} />
                            <span>{driver.wellness_score ?? 100} / 100</span>
                            <span className="opacity-75 capitalize">• {driver.wellness_band || "good"}</span>
                          </span>
                          <button
                            onClick={() => handleOpenWellness(driver)}
                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 dark:hover:text-[#2997ff] transition"
                            title="Inspect Wellness Breakdown"
                          >
                            <Info size={13} />
                          </button>
                        </div>
                        <p className="text-[10px] text-[#86868b]">
                          {driver.hours_driven_24h ? `${driver.hours_driven_24h}h / 24h` : "0h / 24h"} · {driver.night_driving_hours ? `${driver.night_driving_hours}h night` : "0h night"}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {driver.status === "resting" || driver.is_actively_resting ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/25 dark:bg-purple-500/20 dark:text-purple-300 w-fit">
                            <Moon size={11} className="animate-pulse text-purple-600 dark:text-purple-400" />
                            <span>On Mandatory Rest</span>
                          </span>
                          <span className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">
                            {driver.rest_hours_remaining ? `${driver.rest_hours_remaining}h left` : "Rest active"} • Available {formatRestUntil(driver.rest_until)}
                          </span>
                          <button
                            onClick={() => handleEndRest(driver)}
                            className="text-[10px] text-[#0071e3] hover:underline font-medium text-left w-fit"
                          >
                            Complete Rest Early
                          </button>
                        </div>
                      ) : (driver.wellness_score ?? 100) < 60 || driver.wellness_band === "needs_rest" ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="apple-badge bg-red-500/10 text-red-600 border border-red-500/20 dark:bg-red-500/15 dark:text-red-400 font-semibold w-fit">
                            High Fatigue Risk
                          </span>
                          <span className="text-[10px] text-red-500 font-medium max-w-[190px] truncate" title={driver.blocking_reason}>
                            {driver.blocking_reason || "Duty shift limit exceeded"}
                          </span>
                          <button
                            onClick={() => handleOpenRestModal(driver)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/25 transition dark:text-amber-300 w-fit"
                            title="Assign mandatory rest period to restore wellness"
                          >
                            <Moon size={11} />
                            Send to Rest
                          </button>
                        </div>
                      ) : driver.is_assignable === false || driver.blocking_reason ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="apple-badge bg-red-500/10 text-red-600 border border-red-500/20 dark:bg-red-500/15 dark:text-red-400 font-semibold w-fit">
                            Blocked from Dispatch
                          </span>
                          <span className="text-[10px] text-red-500 font-medium max-w-[180px] truncate" title={driver.blocking_reason}>
                            {driver.blocking_reason || "Needs 8h rest before trip"}
                          </span>
                        </div>
                      ) : (
                        <span className={`apple-badge ${
                          driver.status === "available"
                            ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                            : driver.status === "assigned" || driver.status === "busy"
                            ? "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                            : driver.status === "off_duty"
                            ? "bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                            : "bg-black/[0.05] text-[#86868b] dark:bg-white/[0.08]"
                        }`}>
                          {driver.status || "Unknown"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenRestModal(driver)}
                          className="p-1 rounded-md text-[#86868b] hover:text-purple-600 hover:bg-purple-500/10 transition dark:hover:text-purple-400"
                          title="Assign Mandatory Rest"
                        >
                          <Moon size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenWellness(driver)}
                          className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                          title="Wellness Breakdown"
                        >
                          <Activity size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(driver)}
                          className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                          title="Edit Driver"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(driver)}
                          className="p-1 rounded-md text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition"
                          title="Delete Driver"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {isEditing ? `Edit Driver #${editingId}` : "Register Driver"}
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
                    Full Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Vikram Singh"
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    License Qualification *
                  </label>
                  <select
                    value={form.license_category}
                    onChange={(e) => setForm({ ...form, license_category: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {LICENSE_CATEGORIES.map((lic) => (
                      <option key={lic} value={lic}>{lic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    License Number
                  </label>
                  <input
                    type="text"
                    value={form.license_number}
                    onChange={(e) =>
                      setForm({ ...form, license_number: e.target.value.toUpperCase() })
                    }
                    placeholder="DL-0420110012345"
                    className="apple-input font-mono uppercase text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98123 45678"
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Experience (Yrs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.experience_years}
                    onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Max Shift (h)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={form.working_hours}
                    onChange={(e) => setForm({ ...form, working_hours: e.target.value })}
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Rest Period (h)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.rest_hours}
                    onChange={(e) => setForm({ ...form, rest_hours: e.target.value })}
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
                    {DRIVER_STATUSES.map((st) => (
                      <option key={st} value={st}>{st.replace("_", " ")}</option>
                    ))}
                  </select>
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
                  {saving ? "Saving..." : isEditing ? "Update Driver" : "Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && deletingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm apple-card p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-sm font-semibold">Delete Driver</h3>
            </div>

            <p className="mt-2.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Confirm deletion of driver <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{deletingDriver.name}</strong> (#{deletingDriver.id})?
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
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Wellness Breakdown Modal */}
      {showWellnessModal && selectedDriverForWellness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl apple-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                  <HeartPulse size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Driver Wellness & Fatigue Audit
                  </h2>
                  <p className="text-xs text-[#86868b]">
                    {selectedDriverForWellness.name} (Driver #{selectedDriverForWellness.id} · {selectedDriverForWellness.license_category})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowWellnessModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-6">
              {/* Top Banner with Score */}
              <div className={`rounded-2xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                (selectedDriverForWellness.wellness_score ?? 100) >= 80
                  ? "bg-[#34c759]/10 border-[#34c759]/20 text-[#1d1d1f] dark:text-[#f5f5f7]"
                  : (selectedDriverForWellness.wellness_score ?? 100) >= 60
                  ? "bg-[#ff9500]/10 border-[#ff9500]/20 text-[#1d1d1f] dark:text-[#f5f5f7]"
                  : "bg-red-500/10 border-red-500/20 text-[#1d1d1f] dark:text-[#f5f5f7]"
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`grid h-16 w-16 place-items-center rounded-2xl border font-bold text-2xl ${
                    (selectedDriverForWellness.wellness_score ?? 100) >= 80
                      ? "border-[#34c759]/40 bg-white/70 dark:bg-black/40 text-[#34c759] dark:text-[#30d158]"
                      : (selectedDriverForWellness.wellness_score ?? 100) >= 60
                      ? "border-[#ff9500]/40 bg-white/70 dark:bg-black/40 text-[#ff9500] dark:text-[#ff9f0a]"
                      : "border-red-500/40 bg-white/70 dark:bg-black/40 text-red-600 dark:text-red-400"
                  }`}>
                    {selectedDriverForWellness.wellness_score ?? 100}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold capitalize">
                        {selectedDriverForWellness.wellness_band || "good"} Band
                      </span>
                      <span className="text-xs text-[#86868b]">(Score: {selectedDriverForWellness.wellness_score ?? 100}/100)</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
                      {(selectedDriverForWellness.wellness_score ?? 100) >= 80
                        ? "Optimal alertness. Rest requirements fulfilled. Assignable for long-haul routes."
                        : (selectedDriverForWellness.wellness_score ?? 100) >= 60
                        ? "Moderate fatigue detected. Eligible for short corridors or daytime runs."
                        : "High fatigue detected. Max driving hours exceeded or minimum rest period violated."}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex sm:flex-col items-center sm:items-end gap-2">
                  <span className={`apple-badge font-semibold ${
                    selectedDriverForWellness.is_assignable === false || selectedDriverForWellness.blocking_reason
                      ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                      : "bg-[#34c759]/15 text-[#34c759] dark:text-[#30d158] border border-[#34c759]/30"
                  }`}>
                    {selectedDriverForWellness.is_assignable === false || selectedDriverForWellness.blocking_reason
                      ? "Blocked from Dispatch"
                      : "Eligible for Dispatch"}
                  </span>
                  <button
                    onClick={() => handleRecomputeWellness(selectedDriverForWellness.id)}
                    disabled={recomputingWellness}
                    className="apple-btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={recomputingWellness ? "animate-spin" : ""} />
                    {recomputingWellness ? "Evaluating..." : "Recompute"}
                  </button>
                </div>
              </div>

              {/* Blocking Warning if any */}
              {(selectedDriverForWellness.is_assignable === false || selectedDriverForWellness.blocking_reason) && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 flex items-start gap-3 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Dispatch Policy Enforcement:</span>
                    <p className="mt-0.5">{selectedDriverForWellness.blocking_reason || "Driver wellness score is below 60 or minimum 8h rest requirement has not been met."}</p>
                  </div>
                </div>
              )}

              {/* Sub-Metrics Grid */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-3">
                  Fatigue & Duty Sub-Metrics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">24h Driving Hours</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.hours_driven_24h ?? 0}h
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Threshold: ≤ 8.0h</span>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">7-Day Driving Hours</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.hours_driven_7d ?? 0}h
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Threshold: ≤ 48.0h</span>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">Night Driving (22-03)</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.night_driving_hours ?? 0}h
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Threshold: ≤ 4.0h</span>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">Consecutive Days</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.consecutive_working_days ?? 0} days
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Max limit: 6 days</span>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">Mandatory Rest</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.rest_hours ?? 8}h
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Min required: 8.0h</span>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5">
                    <span className="text-[11px] text-[#86868b] block">Shift Limit</span>
                    <span className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.working_hours ?? 8}h
                    </span>
                    <span className="text-[10px] text-[#86868b] block mt-0.5">Max continuous shift</span>
                  </div>
                </div>
              </div>

              {/* Evaluation Reasons Breakdown */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-2">
                  Factor Explanations & Deductions
                </h3>
                <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] dark:border-white/[0.06] dark:bg-white/[0.015] p-3.5">
                  {selectedDriverForWellness.wellness_reasons && selectedDriverForWellness.wellness_reasons.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {selectedDriverForWellness.wellness_reasons.map((r, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#0071e3] dark:text-[#2997ff] mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[#86868b]">All wellness parameters compliant with standard fatigue benchmarks.</p>
                  )}
                </div>
              </div>

              {/* Historical Log */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-2">
                  Recent Wellness Score History
                </h3>
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
                  {loadingHistory ? (
                    <p className="p-4 text-center text-xs text-[#86868b]">Loading score audit history...</p>
                  ) : wellnessHistory.length === 0 ? (
                    <p className="p-4 text-center text-xs text-[#86868b]">No previous score history recorded.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.06] text-[10px] uppercase text-[#86868b]">
                        <tr>
                          <th className="px-3 py-2">Timestamp</th>
                          <th className="px-3 py-2">Score</th>
                          <th className="px-3 py-2">Band</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                        {wellnessHistory.slice(0, 5).map((h, i) => (
                          <tr key={h.id || i}>
                            <td className="px-3 py-2 text-[#86868b] font-mono text-[11px]">
                              {h.computed_at ? new Date(h.computed_at).toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-2 font-semibold">
                              {h.score} / 100
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                                h.band === "good"
                                  ? "bg-[#34c759]/10 text-[#34c759]"
                                  : h.band === "fair"
                                  ? "bg-[#ff9500]/10 text-[#ff9500]"
                                  : "bg-red-500/10 text-red-600"
                              }`}>
                                {h.band}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowWellnessModal(false)}
                  className="apple-btn-primary text-xs"
                >
                  Close Audit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send to Mandatory Rest Modal */}
      {showRestModal && driverForRest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
                  <Moon size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Assign Mandatory Rest
                  </h2>
                  <p className="text-xs text-[#86868b]">
                    Fatigue mitigation & duty recovery for {driverForRest.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRestModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            {restError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 border border-red-500/20">
                <AlertCircle size={14} className="shrink-0" />
                <span>{restError}</span>
              </div>
            )}

            {restSuccess && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#34c759]/10 p-3 text-xs text-[#34c759] border border-[#34c759]/20">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{restSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmitRest} className="mt-5 space-y-4">
              {/* Current Driver Fatigue Summary */}
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02] p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{driverForRest.name}</p>
                  <p className="text-[11px] text-[#86868b] mt-0.5">
                    {driverForRest.hours_driven_24h || 0}h driven in last 24h • {driverForRest.night_driving_hours || 0}h night shift
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
                  (driverForRest.wellness_score ?? 100) >= 80
                    ? "bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25"
                    : (driverForRest.wellness_score ?? 100) >= 60
                    ? "bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/25"
                    : "bg-red-500/10 text-red-600 border-red-500/25"
                }`}>
                  <HeartPulse size={12} />
                  {driverForRest.wellness_score ?? 100} / 100
                </span>
              </div>

              {/* Rest Duration Selector */}
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Select Rest Duration
                </label>
                <p className="text-[11px] text-[#86868b] mt-0.5 mb-2">
                  Motor Transport Worker regulations mandate at least 8 continuous hours of rest.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { hours: 8, label: "8h Statutory" },
                    { hours: 10, label: "10h Overnight" },
                    { hours: 12, label: "12h Extended" },
                    { hours: 24, label: "24h Full Day" },
                  ].map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      onClick={() => setRestDurationHours(preset.hours)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition ${
                        Number(restDurationHours) === preset.hours
                          ? "border-purple-600 bg-purple-500/10 text-purple-600 dark:border-purple-400 dark:text-purple-300 font-semibold"
                          : "border-black/[0.08] dark:border-white/[0.08] text-[#6e6e73] dark:text-[#86868b] hover:border-black/20"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <span className="text-xs text-[#86868b]">Or custom hours:</span>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    step="0.5"
                    value={restDurationHours}
                    onChange={(e) => setRestDurationHours(Number(e.target.value))}
                    className="w-24 apple-input text-xs py-1"
                  />
                  <span className="text-xs text-[#86868b]">hours</span>
                </div>
              </div>

              {/* Dynamic Availability Display */}
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.04] dark:bg-purple-500/[0.08] p-4">
                <div className="flex items-start gap-3">
                  <Clock size={18} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-bold text-purple-600 dark:text-purple-300">
                      Truck Assignment Availability
                    </span>
                    <p className="mt-1 text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Available at: {calculatedAvailableDate}
                    </p>
                    <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                      In exactly {restDurationHours} hours, driver status will automatically revert to Available with full 100% alertness recovery.
                    </p>
                  </div>
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Rest Location & Dispatch Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Resting at Gwalior Hub Rest Stop / Transshipment Yard"
                  value={restNotes}
                  onChange={(e) => setRestNotes(e.target.value)}
                  className="apple-input text-xs mt-1.5"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowRestModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRest}
                  className="apple-btn-primary text-xs bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Moon size={14} />
                  {submittingRest ? "Assigning Rest..." : `Confirm ${restDurationHours}h Mandatory Rest`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Drivers Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl apple-card p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/20 dark:text-[#2997ff]">
                  <UploadCloud size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Bulk Import Fleet Drivers
                  </h2>
                  <p className="text-xs text-[#86868b]">
                    Batch register drivers via CSV or JSON format
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4">
              {bulkError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 border border-red-500/20">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {bulkSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-[#34c759]/10 p-3 text-xs text-[#34c759] border border-[#34c759]/20">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{bulkSuccess}</span>
                </div>
              )}

              {/* Actions row: Upload file or Load template */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <label className="apple-btn-secondary text-xs cursor-pointer">
                    <FileSpreadsheet size={13} />
                    Upload CSV / JSON
                    <input
                      type="file"
                      accept=".csv,.json,text/plain"
                      onChange={handleFileBulkDrivers}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSampleDrivers}
                    className="apple-btn-secondary text-xs"
                  >
                    Load Sample Template
                  </button>
                </div>
                <span className="text-xs text-[#86868b]">
                  {parsedBulkDrivers.length} driver{parsedBulkDrivers.length === 1 ? "" : "s"} detected
                </span>
              </div>

              {/* CSV/JSON Textarea */}
              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                  CSV / JSON Data
                </label>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Paste CSV rows (e.g. name,license_category,license_number,phone,experience_years) or JSON array..."
                  className="mt-1.5 w-full rounded-xl border border-black/[0.1] bg-black/[0.02] p-3 font-mono text-xs text-[#1d1d1f] dark:border-white/[0.1] dark:bg-white/[0.02] dark:text-[#f5f5f7] outline-none focus:border-[#0071e3]"
                />
              </div>

              {/* Live Preview Table */}
              {parsedBulkDrivers.length > 0 && (
                <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
                  <div className="bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Import Preview ({parsedBulkDrivers.length} records ready)
                    </span>
                    <span className="text-[10px] text-[#34c759] font-medium flex items-center gap-1">
                      <Check size={12} /> Valid schema
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black/[0.02] dark:bg-white/[0.02] text-[10px] uppercase text-[#86868b]">
                        <tr>
                          <th className="px-3 py-1.5">Name</th>
                          <th className="px-3 py-1.5">Category</th>
                          <th className="px-3 py-1.5">License</th>
                          <th className="px-3 py-1.5">Phone</th>
                          <th className="px-3 py-1.5">Exp (Yrs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                        {parsedBulkDrivers.map((d, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-1.5 font-medium">{d.name}</td>
                            <td className="px-3 py-1.5 text-[#86868b]">{d.license_category}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#86868b]">{d.license_number || "—"}</td>
                            <td className="px-3 py-1.5 text-[#86868b]">{d.phone || "—"}</td>
                            <td className="px-3 py-1.5 text-[#86868b]">{d.experience_years}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-3 mt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitBulkDrivers}
                disabled={bulkSubmitting || parsedBulkDrivers.length === 0}
                className="apple-btn-primary text-xs"
              >
                <UploadCloud size={14} />
                {bulkSubmitting
                  ? "Importing..."
                  : `Import ${parsedBulkDrivers.length} Driver${parsedBulkDrivers.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
