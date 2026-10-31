import { useEffect, useState } from "react";
import {
  Route,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Truck,
  Users,
  Package,
  Play,
  CheckCircle2,
  XCircle,
  Trash2,
} from "lucide-react";
import api from "../services/api";

export default function Trips() {
  const [trips, setTrips] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  async function fetchData() {
    try {
      setLoading(true);
      setError("");

      const [tripsResponse, ordersResponse] = await Promise.all([
        api.get("/trips/"),
        api.get("/orders/"),
      ]);

      setTrips(Array.isArray(tripsResponse.data) ? tripsResponse.data : []);
      setOrders(Array.isArray(ordersResponse.data) ? ordersResponse.data : []);
    } catch (err) {
      console.error("Failed to load trips or orders:", err);
      setError(
        err.response?.data?.detail || "Unable to load trips. Check backend connection."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAutoAllocate(event) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    if (!orderId) {
      setError("Please select an order first.");
      return;
    }

    try {
      setAllocating(true);
      const response = await api.post("/trips/auto-allocate", null, {
        params: { order_id: Number(orderId) },
      });

      setSuccess(response.data.trip);
      setOrderId("");
      await fetchData();
    } catch (err) {
      console.error("Automatic allocation failed:", err);
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : "Automatic allocation failed. Check truck capacity."
      );
    } finally {
      setAllocating(false);
    }
  }

  async function handleStatusChange(tripId, newStatus) {
    try {
      await api.put(`/trips/${tripId}/status`, null, {
        params: { status: newStatus },
      });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Status transition failed");
    }
  }

  async function handleDeleteTrip(tripId) {
    if (!confirm(`Are you sure you want to delete Trip #${tripId}?`)) return;
    try {
      await api.delete(`/trips/${tripId}`);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete trip");
    }
  }

  const activeTrips = trips.filter((trip) =>
    ["planned", "in_progress"].includes(String(trip.status).toLowerCase())
  );

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Page Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Fleet Operations
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Trip Expeditions
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Allocate vehicles and drivers, monitor trip lifecycles, and track transit progress.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="apple-btn-secondary text-xs"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Expeditions</span>
            <Route size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {trips.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">All recorded trips</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Active & Reserved</span>
            <Truck size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {activeTrips.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Planned or on highway</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Unallocated Consignments</span>
            <Users size={18} className="text-[#ff9500] dark:text-[#ff9f0a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {orders.filter((order) => !trips.some((trip) => trip.order_id === order.id)).length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Awaiting truck assignment</p>
        </div>
      </div>

      {/* Auto-Allocation Action Card */}
      <div className="apple-card p-7 mb-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
            <Package size={17} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Dispatch Allocation
            </h2>
            <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
              Select a pending order to automatically allocate an eligible truck and available driver.
            </p>
          </div>
        </div>

        <form onSubmit={handleAutoAllocate} className="flex flex-col gap-3 sm:flex-row sm:items-end pt-2">
          <div className="flex-1">
            <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
              Select Pending Consignment
            </label>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="apple-input text-xs"
              required
            >
              <option value="">Select an order to dispatch...</option>
              {orders
                .filter((order) => !trips.some((trip) => trip.order_id === order.id))
                .map((order) => (
                  <option key={order.id} value={order.id}>
                    Order #{order.id} — {order.pickup_location || "Origin"} → {order.delivery_location || "Dest"} ({order.weight} kg)
                  </option>
                ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={allocating || loading || !orderId}
            className="apple-btn-primary text-xs shrink-0"
          >
            {allocating ? "Allocating..." : "Auto Allocate"}
          </button>
        </form>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-xl border border-[#34c759]/20 bg-[#34c759]/10 p-4 text-xs text-[#34c759] dark:text-[#30d158]">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <CheckCircle size={16} />
              Trip #{success.id} successfully generated & allocated
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-[#1d1d1f] dark:text-[#f5f5f7]">
              <p>Trip: <strong>#{success.id}</strong></p>
              <p>Truck ID: <strong>{success.truck_id}</strong></p>
              <p>Driver ID: <strong>{success.driver_id}</strong></p>
              <p>Order ID: <strong>{success.order_id}</strong></p>
            </div>
          </div>
        )}
      </div>

      {/* Trips Table */}
      <div className="apple-card overflow-hidden">
        <div className="border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
          <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Recorded Trips
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Trip resource assignments and live delivery state.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading expeditions...</p>
        ) : trips.length === 0 ? (
          <p className="p-8 text-center text-xs text-[#86868b]">No trip records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">Trip</th>
                  <th className="px-6 py-3.5">Truck</th>
                  <th className="px-6 py-3.5">Driver</th>
                  <th className="px-6 py-3.5">Consignment</th>
                  <th className="px-6 py-3.5">Distance</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {trips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      #{trip.id}
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {trip.truck_registration || `Truck #${trip.truck_id}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {trip.driver_name || `Driver #${trip.driver_id}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[#6e6e73] dark:text-[#86868b]">
                      <div>
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Order #{trip.order_id}</span>
                        {trip.pickup_location && (
                          <span className="block text-[11px] text-[#86868b] truncate max-w-xs">
                            {trip.pickup_location} → {trip.delivery_location}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {trip.distance ?? trip.distance_km ?? 0} km
                    </td>
                    <td className="px-6 py-4">
                      <span className={`apple-badge ${
                        trip.status === "in_progress"
                          ? "bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                          : trip.status === "completed"
                          ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                          : trip.status === "cancelled"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                      }`}>
                        {trip.status || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {trip.status === "planned" && (
                          <button
                            onClick={() => handleStatusChange(trip.id, "in_progress")}
                            className="rounded-full bg-[#0071e3]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] hover:bg-[#0071e3]/20 dark:bg-[#2997ff]/15 dark:text-[#2997ff] transition"
                            title="Start expedition"
                          >
                            Start
                          </button>
                        )}
                        {trip.status === "in_progress" && (
                          <button
                            onClick={() => handleStatusChange(trip.id, "completed")}
                            className="rounded-full bg-[#34c759]/10 px-2.5 py-1 text-[11px] font-semibold text-[#34c759] hover:bg-[#34c759]/20 dark:bg-[#30d158]/15 dark:text-[#30d158] transition"
                            title="Mark completed"
                          >
                            Complete
                          </button>
                        )}
                        {["planned", "in_progress"].includes(trip.status) && (
                          <button
                            onClick={() => handleStatusChange(trip.id, "cancelled")}
                            className="rounded-full bg-black/[0.05] px-2 py-1 text-[11px] font-medium text-[#6e6e73] hover:bg-black/[0.1] dark:bg-white/[0.08] dark:text-[#86868b] transition"
                            title="Cancel expedition"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTrip(trip.id)}
                          className="p-1 rounded-md text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition"
                          title="Delete trip record"
                        >
                          <Trash2 size={13} />
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
    </div>
  );
}
