import { useEffect, useState, useMemo } from "react";
import {
  Warehouse,
  Plus,
  RefreshCw,
  X,
  AlertCircle,
  MapPin,
  Edit2,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Building2,
  Phone,
  Search,
} from "lucide-react";
import api from "../services/api";
import PlaceAutocomplete from "../components/PlaceAutocomplete";

const HUB_TYPES = [
  { value: "warehouse", label: "Warehouse" },
  { value: "distribution_hub", label: "Distribution Hub" },
  { value: "rest_stop", label: "Rest Stop" },
  { value: "handover_hub", label: "Driver Handover Hub" },
  { value: "other", label: "Other Facility" },
];

export default function Hubs() {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingHub, setDeletingHub] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    hub_type: "warehouse",
    address: "",
    city: "",
    state: "",
    country: "India",
    latitude: "",
    longitude: "",
    operational_status: "active",
    capacity_tons: "",
    contact_name: "",
    contact_phone: "",
    notes: "",
  });

  async function fetchHubs() {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/hubs/");
      setHubs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch hubs:", err);
      setError("Unable to load hubs. Please verify backend service.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHubs();
  }, []);

  function handleOpenCreate() {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      name: "",
      hub_type: "warehouse",
      address: "",
      city: "",
      state: "",
      country: "India",
      latitude: "",
      longitude: "",
      operational_status: "active",
      capacity_tons: "",
      contact_name: "",
      contact_phone: "",
      notes: "",
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  function handleOpenEdit(hub) {
    setIsEditing(true);
    setEditingId(hub.id);
    setForm({
      name: hub.name || "",
      hub_type: hub.hub_type || "warehouse",
      address: hub.address || "",
      city: hub.city || "",
      state: hub.state || "",
      country: hub.country || "India",
      latitude: hub.latitude != null ? String(hub.latitude) : "",
      longitude: hub.longitude != null ? String(hub.longitude) : "",
      operational_status: hub.operational_status || "active",
      capacity_tons: hub.capacity_tons != null ? String(hub.capacity_tons) : "",
      contact_name: hub.contact_name || "",
      contact_phone: hub.contact_phone || "",
      notes: hub.notes || "",
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  function handlePlaceSelected(place) {
    setForm((prev) => ({
      ...prev,
      name: prev.name || place.name,
      address: place.address || place.name,
      city: prev.city || place.name,
      state: prev.state || place.state,
      latitude: place.latitude != null ? String(place.latitude) : prev.latitude,
      longitude: place.longitude != null ? String(place.longitude) : prev.longitude,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const params = {
        name: form.name.trim(),
        hub_type: form.hub_type,
        address: form.address?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        country: form.country?.trim() || "India",
        operational_status: form.operational_status,
      };

      if (form.latitude) params.latitude = form.latitude.trim();
      if (form.longitude) params.longitude = form.longitude.trim();
      if (form.capacity_tons) params.capacity_tons = Number(form.capacity_tons);
      if (form.contact_name) params.contact_name = form.contact_name.trim();
      if (form.contact_phone) params.contact_phone = form.contact_phone.trim();
      if (form.notes) params.notes = form.notes.trim();

      if (isEditing) {
        await api.put(`/hubs/${editingId}`, null, { params });
        setFormSuccess("Hub updated.");
      } else {
        await api.post("/hubs/", null, { params });
        setFormSuccess("Hub created.");
      }

      setTimeout(() => {
        setShowModal(false);
        fetchHubs();
      }, 500);
    } catch (err) {
      console.error("Save hub error:", err);
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "Failed to save hub details.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenDelete(hub) {
    setDeletingHub(hub);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!deletingHub) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/hubs/${deletingHub.id}`);
      setShowDeleteModal(false);
      fetchHubs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setDeleteError(
        typeof detail === "string"
          ? detail
          : "Cannot delete this hub while linked to active trips."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeactivateInstead() {
    if (!deletingHub) return;
    setIsDeleting(true);
    try {
      await api.patch(`/hubs/${deletingHub.id}/deactivate`);
      setShowDeleteModal(false);
      fetchHubs();
    } catch {
      setDeleteError("Failed to deactivate hub.");
    } finally {
      setIsDeleting(false);
    }
  }

  const filteredHubs = useMemo(() => {
    return hubs.filter((hub) => {
      const matchesSearch =
        !searchQuery ||
        hub.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hub.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hub.address?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = selectedType === "all" || hub.hub_type === selectedType;
      const matchesStatus = selectedStatus === "all" || hub.operational_status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [hubs, searchQuery, selectedType, selectedStatus]);

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Infrastructure Network
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Warehouses & Transit Hubs
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Regional logistics nodes, cross-docking depots, and driver rest facilities.
          </p>
        </div>

        <div className="flex gap-2.5">
          <button onClick={handleOpenCreate} className="apple-btn-primary text-xs">
            <Plus size={14} />
            Add Hub
          </button>
          <button
            onClick={fetchHubs}
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
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Registered Facilities</span>
            <Warehouse size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : hubs.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Regional logistics nodes</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Active Distribution Hubs</span>
            <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : hubs.filter((h) => h.operational_status === "active").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Operational & ready</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Network Capacity</span>
            <Building2 size={18} className="text-[#af52de] dark:text-[#bf5af2]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading
              ? "—"
              : `${hubs.reduce((acc, h) => acc + (h.capacity_tons || 0), 0).toLocaleString()} Tons`}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Cumulative warehouse storage</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="apple-card p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <Search size={15} className="text-[#86868b]" />
          <input
            type="text"
            placeholder="Search hubs by name, address, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none dark:text-[#f5f5f7]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="apple-input text-xs w-auto py-1.5"
          >
            <option value="all">All Types</option>
            {HUB_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="apple-input text-xs w-auto py-1.5"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
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
            Logistics Infrastructure Directory
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Regional facility anchors for cross-docking and dispatch stops.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading facilities...</p>
        ) : filteredHubs.length === 0 ? (
          <p className="p-8 text-center text-xs text-[#86868b]">No hubs found matching criteria.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">Facility Name</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Location & Geopoint</th>
                  <th className="px-6 py-3.5">Capacity</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {filteredHubs.map((hub) => (
                  <tr key={hub.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{hub.name}</p>
                      {hub.contact_phone && (
                        <p className="flex items-center gap-1 text-[11px] text-[#86868b] mt-0.5">
                          <Phone size={10} /> {hub.contact_phone}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="apple-badge bg-black/[0.04] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#f5f5f7]">
                        {hub.hub_type?.replace("_", " ") || "Warehouse"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[#6e6e73] dark:text-[#86868b]">{hub.city ? `${hub.city}, ${hub.state || ""}` : hub.address || "—"}</p>
                      {hub.latitude && hub.longitude && (
                        <p className="font-mono text-[10px] text-[#86868b]">
                          {Number(hub.latitude).toFixed(3)}, {Number(hub.longitude).toFixed(3)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {hub.capacity_tons ? `${Number(hub.capacity_tons).toLocaleString()} Tons` : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`apple-badge ${
                        hub.operational_status === "active"
                          ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                          : hub.operational_status === "maintenance"
                          ? "bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                          : "bg-black/[0.05] text-[#86868b] dark:bg-white/[0.08]"
                      }`}>
                        {hub.operational_status || "Active"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(hub)}
                          className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                          title="Edit Hub"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(hub)}
                          className="p-1 rounded-md text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition"
                          title="Delete Hub"
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
          <div className="w-full max-w-lg apple-card p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {isEditing ? `Edit Facility #${editingId}` : "Add Logistics Facility"}
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
                    Facility Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Gwalior Central Logistics Center"
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Facility Category
                  </label>
                  <select
                    value={form.hub_type}
                    onChange={(e) => setForm({ ...form, hub_type: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {HUB_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <PlaceAutocomplete
                  label="Search Address (Google Places Autocomplete)"
                  value={form.address}
                  onChange={(text) => setForm({ ...form, address: text })}
                  onPlaceSelect={handlePlaceSelected}
                  placeholder="e.g. Industrial Area, Gwalior, MP"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Capacity (Tons)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.capacity_tons}
                    onChange={(e) => setForm({ ...form, capacity_tons: e.target.value })}
                    placeholder="1200"
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Latitude</label>
                  <input
                    type="text"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    placeholder="26.2183"
                    className="apple-input font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Longitude</label>
                  <input
                    type="text"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="78.1828"
                    className="apple-input font-mono text-xs"
                  />
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
                  {saving ? "Saving..." : isEditing ? "Update Hub" : "Create Hub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteModal && deletingHub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm apple-card p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-sm font-semibold">Delete Facility</h3>
            </div>

            <p className="mt-2.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Confirm deletion of facility <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{deletingHub.name}</strong> (#{deletingHub.id})?
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
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
