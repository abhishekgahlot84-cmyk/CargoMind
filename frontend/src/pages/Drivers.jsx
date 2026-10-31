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
  Clock,
  Phone,
  Search,
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
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
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
            {loading ? "—" : drivers.filter((d) => d.status === "available").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Rest compliant & ready</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">On Active Duty</span>
            <Clock size={18} className="text-[#ff9500] dark:text-[#ff9f0a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : drivers.filter((d) => d.status === "assigned" || d.status === "busy").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Currently on highway runs</p>
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
                  <th className="px-6 py-3.5">Name & Contact</th>
                  <th className="px-6 py-3.5">License Category</th>
                  <th className="px-6 py-3.5">Experience</th>
                  <th className="px-6 py-3.5">Shift & Rest</th>
                  <th className="px-6 py-3.5">Status</th>
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
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      {driver.experience_years != null ? `${driver.experience_years} yrs` : "—"}
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      <span>Max {driver.working_hours || 8}h shift</span>
                      <span className="text-[#86868b]"> • </span>
                      <span>{driver.rest_hours || 8}h rest</span>
                    </td>
                    <td className="px-6 py-4">
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
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
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
    </div>
  );
}
