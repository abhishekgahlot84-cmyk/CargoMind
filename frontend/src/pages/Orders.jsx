import { useEffect, useState, useMemo } from "react";
import {
  Package,
  Plus,
  RefreshCw,
  X,
  MapPin,
  AlertCircle,
  Clock,
  ShieldAlert,
  Thermometer,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Search,
  UploadCloud,
  FileSpreadsheet,
  Check,
} from "lucide-react";
import api from "../services/api";
import PlaceAutocomplete from "../components/PlaceAutocomplete";
import { useAuth } from "../context/AuthContext";

const INITIAL_CARGO_CATEGORIES = [
  "Technology",
  "Organic Products",
  "Consumer Electronics",
  "Industrial Parts",
  "General Cargo",
  "Perishable Goods",
  "Fragile Goods",
  "Hazardous Materials",
  "Pharmaceuticals",
  "Other",
];

export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState(INITIAL_CARGO_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedUrgency, setSelectedUrgency] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

function computeVolumeM3(lStr, wStr, hStr, unit = "cm", pkgsStr = "1") {
  const l = parseFloat(lStr);
  const w = parseFloat(wStr);
  const h = parseFloat(hStr);
  const pkgs = parseInt(pkgsStr, 10);
  if (isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
    return { volume: "", hint: "", warning: "" };
  }
  const count = !isNaN(pkgs) && pkgs >= 1 ? pkgs : 1;

  let l_m = l;
  let w_m = w;
  let h_m = h;
  if (unit === "cm") {
    l_m = l / 100.0;
    w_m = w / 100.0;
    h_m = h / 100.0;
  } else if (unit === "ft") {
    l_m = l * 0.3048;
    w_m = w * 0.3048;
    h_m = h * 0.3048;
  }

  const vol = (l_m * w_m * h_m) * count;
  const roundedVol = (Math.round(vol * 1000) / 1000).toFixed(3);

  let warning = "";
  if (l_m > 18.0 || w_m > 3.5 || h_m > 4.0) {
    warning = `Warning: Dimensions exceed standard single-trailer clearance (18m × 3.5m × 4m).`;
  } else if (vol > 120.0) {
    warning = `Warning: Total volume (${roundedVol} m³) exceeds heavy vehicle capacity (120 m³).`;
  }

  const pkgText = count === 1 ? "1 pkg" : `${count} pkgs`;
  const hint = `${l} × ${w} × ${h} ${unit} (${pkgText}) = ${roundedVol} m³`;

  return { volume: roundedVol, hint, warning };
}

  const [form, setForm] = useState({
    pickup_location: "",
    delivery_location: "",
    weight: "",
    deadline: "",
    distance_km: "",
    pickup_latitude: "",
    pickup_longitude: "",
    pickup_place_id: "",
    delivery_latitude: "",
    delivery_longitude: "",
    delivery_place_id: "",
    cargo_category: "General Cargo",
    is_fragile: false,
    is_hazardous: false,
    is_perishable: false,
    requires_temperature_control: false,
    temperature_min_c: "",
    temperature_max_c: "",
    length: "",
    width: "",
    height: "",
    dimension_unit: "cm",
    package_count: "1",
    volume_m3: "",
    handling_instructions: "",
    company_id: user?.company_id || 1,
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Import Consignments State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");

  async function fetchOrders() {
    try {
      setLoading(true);
      setError("");

      const [ordersRes, catRes] = await Promise.allSettled([
        api.get("/orders/"),
        api.get("/orders/categories"),
      ]);

      if (ordersRes.status === "fulfilled") {
        setOrders(Array.isArray(ordersRes.value.data) ? ordersRes.value.data : []);
      }
      if (catRes.status === "fulfilled" && catRes.value.data?.categories) {
        setCategories(catRes.value.data.categories);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
      setError("Unable to load orders. Please verify the backend service.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [user?.company_id]);

  const [seeding, setSeeding] = useState(false);

  async function handleSeedFleet() {
    try {
      setSeeding(true);
      await api.post("/auth/seed-starter-fleet");
      await fetchOrders();
    } catch (err) {
      console.error("Failed to seed orders:", err);
    } finally {
      setSeeding(false);
    }
  }

  function handleOpenCreate() {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      pickup_location: "",
      delivery_location: "",
      weight: "",
      deadline: new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16),
      distance_km: "",
      pickup_latitude: "",
      pickup_longitude: "",
      pickup_place_id: "",
      delivery_latitude: "",
      delivery_longitude: "",
      delivery_place_id: "",
      cargo_category: "General Cargo",
      is_fragile: false,
      is_hazardous: false,
      is_perishable: false,
      requires_temperature_control: false,
      temperature_min_c: "",
      temperature_max_c: "",
      length: "",
      width: "",
      height: "",
      dimension_unit: "cm",
      package_count: "1",
      volume_m3: "",
      handling_instructions: "",
      company_id: user?.company_id || 1,
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  function handleOpenEdit(order) {
    setIsEditing(true);
    setEditingId(order.id);

    let deadlineVal = "";
    if (order.deadline) {
      try {
        deadlineVal = new Date(order.deadline).toISOString().slice(0, 16);
      } catch {
        deadlineVal = String(order.deadline);
      }
    }

    setForm({
      pickup_location: order.pickup_location || "",
      delivery_location: order.delivery_location || "",
      weight: order.weight != null ? String(order.weight) : "",
      deadline: deadlineVal,
      distance_km: order.distance_km != null ? String(order.distance_km) : "",
      pickup_latitude: order.pickup_latitude != null ? String(order.pickup_latitude) : "",
      pickup_longitude: order.pickup_longitude != null ? String(order.pickup_longitude) : "",
      pickup_place_id: order.pickup_place_id || "",
      delivery_latitude: order.delivery_latitude != null ? String(order.delivery_latitude) : "",
      delivery_longitude: order.delivery_longitude != null ? String(order.delivery_longitude) : "",
      delivery_place_id: order.delivery_place_id || "",
      cargo_category: order.cargo_category || "General Cargo",
      is_fragile: Boolean(order.is_fragile),
      is_hazardous: Boolean(order.is_hazardous),
      is_perishable: Boolean(order.is_perishable),
      requires_temperature_control: Boolean(order.requires_temperature_control),
      temperature_min_c: order.temperature_min_c != null ? String(order.temperature_min_c) : "",
      temperature_max_c: order.temperature_max_c != null ? String(order.temperature_max_c) : "",
      length: order.length != null ? String(order.length) : "",
      width: order.width != null ? String(order.width) : "",
      height: order.height != null ? String(order.height) : "",
      dimension_unit: order.dimension_unit || "cm",
      package_count: order.package_count != null ? String(order.package_count) : "1",
      volume_m3: order.volume_m3 != null ? String(order.volume_m3) : "",
      handling_instructions: order.handling_instructions || "",
      company_id: order.company_id || user?.company_id || 1,
    });
    setFormError("");
    setFormSuccess("");
    setShowModal(true);
  }

  const liveCalc = useMemo(() => {
    return computeVolumeM3(
      form.length,
      form.width,
      form.height,
      form.dimension_unit,
      form.package_count
    );
  }, [form.length, form.width, form.height, form.dimension_unit, form.package_count]);

  const handleDimensionChange = (field, val) => {
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      const calc = computeVolumeM3(
        field === "length" ? val : next.length,
        field === "width" ? val : next.width,
        field === "height" ? val : next.height,
        field === "dimension_unit" ? val : next.dimension_unit,
        field === "package_count" ? val : next.package_count
      );
      return {
        ...next,
        volume_m3: calc.volume || "",
      };
    });
  };

  const [calculatingDist, setCalculatingDist] = useState(false);
  const [distSource, setDistSource] = useState("");
  const [distanceError, setDistanceError] = useState("");

  async function triggerDistanceCalculation(nextForm) {
    const f = nextForm || form;
    const pLat = f.pickup_latitude;
    const pLon = f.pickup_longitude;
    const pId = f.pickup_place_id;

    const dLat = f.delivery_latitude;
    const dLon = f.delivery_longitude;
    const dId = f.delivery_place_id;

    if ((pLat && dLat) || (pId && dId)) {
      setCalculatingDist(true);
      setDistanceError("");
      try {
        const res = await api.post("/orders/calculate-distance", null, {
          params: {
            origin_latitude: pLat ? Number(pLat) : undefined,
            origin_longitude: pLon ? Number(pLon) : undefined,
            origin_place_id: pId || undefined,
            delivery_latitude: dLat ? Number(dLat) : undefined,
            delivery_longitude: dLon ? Number(dLon) : undefined,
            delivery_place_id: dId || undefined,
          },
        });
        if (res.data?.distance_km > 0) {
          setForm((prev) => ({
            ...prev,
            distance_km: String(res.data.distance_km),
            estimated_travel_hours: res.data.estimated_travel_hours,
          }));
          setDistSource(
            res.data.source === "google_routes"
              ? "Google Routes API (Directions v2)"
              : "OSRM Geometry Engine"
          );
        }
      } catch (err) {
        setDistanceError(err.response?.data?.detail || "Could not auto-calculate distance.");
      } finally {
        setCalculatingDist(false);
      }
    }
  }

  function handlePickupPlaceSelect(place) {
    setForm((prev) => {
      const next = {
        ...prev,
        pickup_location: place.name || place.address,
        pickup_latitude: place.latitude != null ? String(place.latitude) : prev.pickup_latitude,
        pickup_longitude: place.longitude != null ? String(place.longitude) : prev.pickup_longitude,
        pickup_place_id: place.place_id || prev.pickup_place_id,
      };
      triggerDistanceCalculation(next);
      return next;
    });
  }

  function handleDeliveryPlaceSelect(place) {
    setForm((prev) => {
      const next = {
        ...prev,
        delivery_location: place.name || place.address,
        delivery_latitude: place.latitude != null ? String(place.latitude) : prev.delivery_latitude,
        delivery_longitude: place.longitude != null ? String(place.longitude) : prev.delivery_longitude,
        delivery_place_id: place.place_id || prev.delivery_place_id,
      };
      triggerDistanceCalculation(next);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      // Validate dimensions & packages
      const l = parseFloat(form.length);
      const w = parseFloat(form.width);
      const h = parseFloat(form.height);
      const pkgs = parseInt(form.package_count, 10);

      if (!form.length || !form.width || !form.height || isNaN(l) || isNaN(w) || isNaN(h) || l <= 0 || w <= 0 || h <= 0) {
        setFormError("Length, width, and height are required and must be strictly positive numbers (> 0).");
        setSaving(false);
        return;
      }
      if (isNaN(pkgs) || pkgs < 1) {
        setFormError("Number of packages must be an integer of at least 1.");
        setSaving(false);
        return;
      }

      const params = {
        pickup_location: form.pickup_location.trim(),
        delivery_location: form.delivery_location.trim(),
        weight: Number(form.weight),
        deadline: form.deadline ? new Date(form.deadline).toISOString() : form.deadline,
        distance_km: form.distance_km ? Number(form.distance_km) : 0,
        cargo_category: form.cargo_category,
        is_fragile: form.is_fragile,
        is_hazardous: form.is_hazardous,
        is_perishable: form.is_perishable,
        requires_temperature_control: form.requires_temperature_control,
        length: l,
        width: w,
        height: h,
        dimension_unit: form.dimension_unit || "cm",
        package_count: pkgs,
      };

      if (form.pickup_latitude) params.pickup_latitude = form.pickup_latitude.trim();
      if (form.pickup_longitude) params.pickup_longitude = form.pickup_longitude.trim();
      if (form.pickup_place_id) params.pickup_place_id = form.pickup_place_id.trim();

      if (form.delivery_latitude) params.delivery_latitude = form.delivery_latitude.trim();
      if (form.delivery_longitude) params.delivery_longitude = form.delivery_longitude.trim();
      if (form.delivery_place_id) params.delivery_place_id = form.delivery_place_id.trim();

      if (form.temperature_min_c !== "") params.temperature_min_c = Number(form.temperature_min_c);
      if (form.temperature_max_c !== "") params.temperature_max_c = Number(form.temperature_max_c);
      if (liveCalc.volume) {
        params.volume_m3 = Number(liveCalc.volume);
      } else if (form.volume_m3 !== "") {
        params.volume_m3 = Number(form.volume_m3);
      }
      if (form.handling_instructions) params.handling_instructions = form.handling_instructions.trim();

      if (isEditing) {
        await api.put(`/orders/${editingId}`, null, { params });
        setFormSuccess("Order updated.");
      } else {
        params.company_id = Number(user?.company_id || form.company_id || 1);
        await api.post("/orders/", null, { params });
        setFormSuccess("Order registered.");
      }

      setTimeout(() => {
        setShowModal(false);
        fetchOrders();
      }, 500);
    } catch (err) {
      console.error("Save order error:", err);
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "Failed to save order.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenDelete(order) {
    setDeletingOrder(order);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!deletingOrder) return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      await api.delete(`/orders/${deletingOrder.id}`);
      setShowDeleteModal(false);
      fetchOrders();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setDeleteError(typeof detail === "string" ? detail : "Failed to delete order.");
    } finally {
      setIsDeleting(false);
    }
  }

  function parseOrderCSV(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fall back
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
      const pickup = obj.pickup_location || obj.origin || obj.pickup || obj.from;
      const delivery = obj.delivery_location || obj.destination || obj.delivery || obj.to;
      if (pickup && delivery) {
        results.push({
          pickup_location: pickup,
          delivery_location: delivery,
          weight: Number(obj.weight || obj.weight_kg) || 1500,
          cargo_category: obj.cargo_category || obj.category || "General Cargo",
          deadline: obj.deadline || obj.delivery_deadline || "",
          delivery_deadline: obj.delivery_deadline || obj.deadline || "",
          distance_km: Number(obj.distance_km || obj.distance) || 0,
          length: Number(obj.length) || 120,
          width: Number(obj.width) || 100,
          height: Number(obj.height) || 100,
          dimension_unit: obj.dimension_unit || "cm",
          package_count: Number(obj.package_count || obj.packages) || 1,
          volume_m3: obj.volume_m3 ? Number(obj.volume_m3) : undefined,
          is_fragile: obj.is_fragile === "true" || obj.is_fragile === "1" || obj.is_fragile === true,
          is_hazardous: obj.is_hazardous === "true" || obj.is_hazardous === "1" || obj.is_hazardous === true,
          is_perishable: obj.is_perishable === "true" || obj.is_perishable === "1" || obj.is_perishable === true,
          handling_instructions: obj.handling_instructions || "",
        });
      }
    }
    return results;
  }

  const sampleOrdersCSV = `pickup_location,delivery_location,weight,cargo_category,length,width,height,package_count,is_fragile,is_perishable
Mumbai,Delhi (NCR),4500,Technology,150,120,110,4,true,false
Bengaluru,Chennai,3200,Automotive Parts,120,80,90,6,false,false
Ahmedabad,Pune,2800,Chemicals,100,100,100,2,false,false
Kolkata,Lucknow,5200,Industrial Machinery,200,150,140,1,false,false
Hyderabad,Nagpur,1900,Pharmaceuticals,80,60,60,8,true,true`;

  function handleOpenBulkModal() {
    setBulkText("");
    setBulkError("");
    setBulkSuccess("");
    setShowBulkModal(true);
  }

  function handleLoadSampleOrders() {
    setBulkText(sampleOrdersCSV);
    setBulkError("");
  }

  function handleFileBulkOrders(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBulkText(event.target?.result || "");
      setBulkError("");
    };
    reader.readAsText(file);
  }

  const parsedBulkOrders = useMemo(() => {
    return parseOrderCSV(bulkText);
  }, [bulkText]);

  async function handleSubmitBulkOrders(e) {
    e.preventDefault();
    if (!parsedBulkOrders || parsedBulkOrders.length === 0) {
      setBulkError("No valid consignments parsed. Please check CSV/JSON format.");
      return;
    }
    setBulkSubmitting(true);
    setBulkError("");
    setBulkSuccess("");
    try {
      const res = await api.post("/orders/bulk", { orders: parsedBulkOrders });
      setBulkSuccess(res.data?.message || `Successfully imported ${parsedBulkOrders.length} consignments.`);
      await fetchOrders();
      setTimeout(() => {
        setShowBulkModal(false);
      }, 1200);
    } catch (err) {
      console.error("Bulk orders import failed:", err);
      const detail = err.response?.data?.detail;
      setBulkError(typeof detail === "string" ? detail : "Failed to import consignments in bulk.");
    } finally {
      setBulkSubmitting(false);
    }
  }

  const filteredOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .filter((o) => {
        const matchesSearch =
          !searchQuery ||
          String(o.id).includes(searchQuery) ||
          o.pickup_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.delivery_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.cargo_category?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = selectedStatus === "all" || o.status === selectedStatus;
        const matchesUrgency = selectedUrgency === "all" || o.urgency === selectedUrgency;

        return matchesSearch && matchesStatus && matchesUrgency;
      });
  }, [orders, searchQuery, selectedStatus, selectedUrgency]);

  return (
    <div className="min-w-0 flex-1 px-6 py-8 sm:px-10 sm:py-10 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
            Shipment Manifests
          </span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            Consignments & Orders
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Deadlines, urgency weighting, dual capacity dimensions, and handling constraints.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff] border border-[#0071e3]/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3] dark:bg-[#2997ff] animate-pulse" />
              Isolated Workspace: {user?.company_name || `Workspace #${user?.company_id || 1}`} (User ID: {user?.id || 1})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {orders.length === 0 && !loading && (
            <button
              onClick={handleSeedFleet}
              disabled={seeding}
              className="apple-btn-secondary text-xs text-[#0071e3] dark:text-[#2997ff]"
            >
              <RefreshCw size={13} className={seeding ? "animate-spin" : ""} />
              {seeding ? "Generating Orders..." : "Seed Starter Orders"}
            </button>
          )}
          <button onClick={handleOpenBulkModal} className="apple-btn-secondary text-xs">
            <UploadCloud size={14} />
            Bulk Import
          </button>
          <button id="order-book-shipment-btn" onClick={handleOpenCreate} className="apple-btn-primary text-xs">
            <Plus size={14} />
            Book Shipment
          </button>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="apple-btn-secondary text-xs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Total Consignments</span>
            <Package size={18} className="text-[#0071e3] dark:text-[#2997ff]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : orders.length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">All recorded orders</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Critical Urgency</span>
            <AlertTriangle size={18} className="text-[#ff3b30] dark:text-[#ff453a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : orders.filter((o) => o.urgency === "critical" || o.is_late).length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Slack window ≤ 0h</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Urgent Attention</span>
            <Clock size={18} className="text-[#ff9500] dark:text-[#ff9f0a]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : orders.filter((o) => o.urgency === "urgent").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Slack window ≤ 6h</p>
        </div>

        <div className="apple-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">Pending Allocation</span>
            <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
            {loading ? "—" : orders.filter((o) => o.status === "pending").length}
          </p>
          <p className="mt-1 text-xs text-[#86868b]">Awaiting solver packing</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="apple-card p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <Search size={15} className="text-[#86868b]" />
          <input
            type="text"
            placeholder="Search by ID, city, or cargo category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#1d1d1f] placeholder-[#86868b] outline-none dark:text-[#f5f5f7]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedUrgency}
            onChange={(e) => setSelectedUrgency(e.target.value)}
            className="apple-input text-xs w-auto py-1.5"
          >
            <option value="all">All Urgencies</option>
            <option value="critical">Critical</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
            <option value="scheduled">Scheduled</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="apple-input text-xs w-auto py-1.5"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_trip">In Trip</option>
            <option value="delivered">Delivered</option>
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
            Active Shipment Orders
          </h2>
          <p className="mt-0.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            Deliveries classified by SLA urgency, weight, volume, and temperature rules.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-xs text-[#86868b]">Loading shipments...</p>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto h-10 w-10 text-[#86868b] mb-2" />
            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">No shipments found</p>
            <p className="mt-1 text-[11px] text-[#86868b]">Click &quot;Book Shipment&quot; to register an order.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] bg-black/[0.02] text-[11px] font-semibold uppercase tracking-wider text-[#86868b] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Corridor (Origin → Dest)</th>
                  <th className="px-6 py-3.5">Payload Dimensions</th>
                  <th className="px-6 py-3.5">Handling Rules</th>
                  <th className="px-6 py-3.5">Urgency & SLA</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {filteredOrders.map((order) => {
                  const urgency = order.urgency || "normal";
                  const isLate = order.is_late || order.remaining_delivery_hours < 0;

                  return (
                    <tr key={order.id} className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-[#86868b]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">#{order.id}</span>
                          <span className="text-[10px] text-[#0071e3] dark:text-[#2997ff] font-sans font-medium">
                            User #{order.user_id || user?.id || 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {order.pickup_location} → {order.delivery_location}
                        </p>
                        <p className="text-[11px] text-[#86868b]">
                          {order.distance_km ? `${order.distance_km} km` : "Dist uncalc"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="apple-badge bg-black/[0.04] text-[#1d1d1f] dark:bg-white/[0.08] dark:text-[#f5f5f7]">
                          {order.cargo_category || "General Cargo"}
                        </span>
                        <p className="mt-1 text-[11px] text-[#6e6e73] dark:text-[#86868b]">
                          {order.weight ? `${Number(order.weight).toLocaleString()} kg` : "—"}
                          {order.volume_m3 ? ` • ${Number(order.volume_m3).toFixed(3)} m³` : ""}
                        </p>
                        {order.length != null && order.width != null && order.height != null && (
                          <p className="mt-0.5 text-[10px] text-[#86868b] font-mono">
                            {order.length}×{order.width}×{order.height} {order.dimension_unit || "cm"}
                            {order.package_count > 1 ? ` (${order.package_count} pkgs)` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {order.is_fragile && (
                            <span className="apple-badge bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]">
                              Fragile
                            </span>
                          )}
                          {order.is_hazardous && (
                            <span className="apple-badge bg-red-500/10 text-red-600 dark:text-red-400">
                              Hazardous
                            </span>
                          )}
                          {order.is_perishable && (
                            <span className="apple-badge bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                              Perishable
                            </span>
                          )}
                          {order.requires_temperature_control && (
                            <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
                              <Thermometer size={10} /> Cold Chain
                            </span>
                          )}
                          {!order.is_fragile &&
                            !order.is_hazardous &&
                            !order.is_perishable &&
                            !order.requires_temperature_control && (
                              <span className="text-[11px] text-[#86868b]">Standard</span>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`apple-badge ${
                          urgency === "critical" || isLate
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : urgency === "urgent"
                            ? "bg-[#ff9500]/10 text-[#ff9500] dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]"
                            : urgency === "scheduled"
                            ? "bg-black/[0.05] text-[#86868b] dark:bg-white/[0.08]"
                            : "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                        }`}>
                          {isLate ? "LATE" : urgency.toUpperCase()}
                        </span>
                        <p className="text-[10px] text-[#86868b] flex items-center gap-1 mt-1">
                          <Calendar size={10} />
                          {order.deadline ? new Date(order.deadline).toLocaleDateString() : "No deadline"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`apple-badge ${
                          order.status === "assigned"
                            ? "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                            : order.status === "delivered"
                            ? "bg-[#34c759]/10 text-[#34c759] dark:bg-[#30d158]/15 dark:text-[#30d158]"
                            : "bg-black/[0.05] text-[#6e6e73] dark:bg-white/[0.08] dark:text-[#86868b]"
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(order)}
                            className="p-1 rounded-md text-[#86868b] hover:text-[#0071e3] hover:bg-[#0071e3]/10 transition dark:hover:text-[#2997ff]"
                            title="Edit Order"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenDelete(order)}
                            className="p-1 rounded-md text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition"
                            title="Delete Order"
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

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl apple-card p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                {isEditing ? `Edit Consignment #${editingId}` : "Book Shipment"}
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
                <PlaceAutocomplete
                  label="Pickup Origin *"
                  required
                  value={form.pickup_location}
                  onChange={(text) => setForm({ ...form, pickup_location: text })}
                  onPlaceSelect={handlePickupPlaceSelect}
                  placeholder="e.g. Gwalior Logistics Hub"
                />

                <PlaceAutocomplete
                  label="Delivery Destination *"
                  required
                  value={form.delivery_location}
                  onChange={(text) => setForm({ ...form, delivery_location: text })}
                  onPlaceSelect={handleDeliveryPlaceSelect}
                  placeholder="e.g. Morena Warehouse"
                />
              </div>

              {(form.pickup_latitude || form.delivery_latitude) && (
                <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] p-2.5 text-[11px] text-[#86868b] flex flex-wrap gap-4 font-mono dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {form.pickup_latitude && (
                    <span>Origin: {Number(form.pickup_latitude).toFixed(4)}, {Number(form.pickup_longitude).toFixed(4)}</span>
                  )}
                  {form.delivery_latitude && (
                    <span>Dest: {Number(form.delivery_latitude).toFixed(4)}, {Number(form.delivery_longitude).toFixed(4)}</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Weight (kg) *
                  </label>
                  <input
                    id="order-input-weight"
                    required
                    type="number"
                    min="1"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    placeholder="5000"
                    className="apple-input text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Delivery Deadline *
                  </label>
                  <input
                    id="order-input-deadline"
                    required
                    type="datetime-local"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="apple-input text-xs"
                  />
                </div>
              </div>

              {/* Package Dimensions & Calculated Volume */}
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-1.5">
                    <Package size={13} className="text-[#0071e3] dark:text-[#2997ff]" /> Package Dimensions & Quantity
                  </span>
                  <span className="text-[11px] text-[#86868b]">Calculates consignment volume (m³)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                      Length *
                    </label>
                    <input
                      id="order-input-length"
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      value={form.length}
                      onChange={(e) => handleDimensionChange("length", e.target.value)}
                      placeholder="120"
                      className="apple-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                      Width *
                    </label>
                    <input
                      id="order-input-width"
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      value={form.width}
                      onChange={(e) => handleDimensionChange("width", e.target.value)}
                      placeholder="80"
                      className="apple-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                      Height *
                    </label>
                    <input
                      id="order-input-height"
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      value={form.height}
                      onChange={(e) => handleDimensionChange("height", e.target.value)}
                      placeholder="100"
                      className="apple-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                      Unit
                    </label>
                    <select
                      id="order-select-unit"
                      value={form.dimension_unit}
                      onChange={(e) => handleDimensionChange("dimension_unit", e.target.value)}
                      className="apple-input text-xs"
                    >
                      <option value="cm">cm</option>
                      <option value="m">m</option>
                      <option value="ft">ft</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                      Packages *
                    </label>
                    <input
                      id="order-input-packages"
                      required
                      type="number"
                      min="1"
                      step="1"
                      value={form.package_count}
                      onChange={(e) => handleDimensionChange("package_count", e.target.value)}
                      placeholder="1"
                      className="apple-input text-xs"
                    />
                  </div>
                </div>

                {/* Live Volume Calculation Card */}
                {liveCalc.volume ? (
                  <div className="rounded-xl bg-white dark:bg-[#161618] p-2.5 border border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#86868b] block">
                        Calculated Volume
                      </span>
                      <p id="order-calculated-hint" className="text-xs font-medium text-[#0071e3] dark:text-[#2997ff]">
                        {liveCalc.hint}
                      </p>
                    </div>
                    <div className="text-right">
                      <span id="order-calculated-volume" className="font-mono text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {liveCalc.volume} m³
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#86868b] italic">
                    Enter positive length, width, and height to calculate total volume in real time.
                  </p>
                )}

                {liveCalc.warning && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-[#ff9500] dark:text-[#ff9f0a] flex items-center gap-1.5">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span>{liveCalc.warning}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                    Cargo Category
                  </label>
                  <select
                    value={form.cargo_category}
                    onChange={(e) => setForm({ ...form, cargo_category: e.target.value })}
                    className="apple-input text-xs"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Road Distance (km)
                    </label>
                    {calculatingDist && (
                      <span className="flex items-center gap-1 text-[10px] text-[#0071e3] dark:text-[#2997ff]">
                        <RefreshCw size={10} className="animate-spin" /> Routing API...
                      </span>
                    )}
                    {!calculatingDist && form.distance_km && distSource && (
                      <span className="apple-badge bg-[#34c759]/10 text-[#34c759] text-[9px] dark:bg-[#30d158]/15 dark:text-[#30d158]">
                        ✓ {distSource}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={form.distance_km}
                    onChange={(e) => setForm({ ...form, distance_km: e.target.value })}
                    placeholder="Calculated automatically via Google Routes"
                    className="apple-input text-xs"
                    required
                  />
                  {distanceError && (
                    <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                      {distanceError}
                    </p>
                  )}
                </div>
              </div>

              {/* Handling Constraints */}
              <div className="rounded-2xl border border-black/[0.06] bg-black/[0.015] p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b] block mb-2.5">
                  Handling Specifications
                </span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_fragile}
                      onChange={(e) => setForm({ ...form, is_fragile: e.target.checked })}
                      className="rounded"
                    />
                    Fragile
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_hazardous}
                      onChange={(e) => setForm({ ...form, is_hazardous: e.target.checked })}
                      className="rounded"
                    />
                    Hazardous
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_perishable}
                      onChange={(e) => setForm({ ...form, is_perishable: e.target.checked })}
                      className="rounded"
                    />
                    Perishable
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requires_temperature_control}
                      onChange={(e) =>
                        setForm({ ...form, requires_temperature_control: e.target.checked })
                      }
                      className="rounded"
                    />
                    Cold Chain
                  </label>
                </div>

                {form.requires_temperature_control && (
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.08]">
                    <div>
                      <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Min Temp (°C)</label>
                      <input
                        type="number"
                        value={form.temperature_min_c}
                        onChange={(e) => setForm({ ...form, temperature_min_c: e.target.value })}
                        placeholder="2"
                        className="apple-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">Max Temp (°C)</label>
                      <input
                        type="number"
                        value={form.temperature_max_c}
                        onChange={(e) => setForm({ ...form, temperature_max_c: e.target.value })}
                        placeholder="8"
                        className="apple-input text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
                  Handling Instructions
                </label>
                <textarea
                  rows={2}
                  value={form.handling_instructions}
                  onChange={(e) => setForm({ ...form, handling_instructions: e.target.value })}
                  placeholder="e.g. Keep upright, do not stack"
                  className="apple-input text-xs"
                />
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
                  {saving ? "Saving..." : isEditing ? "Update Order" : "Book Shipment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteModal && deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm apple-card p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-sm font-semibold">Delete Consignment</h3>
            </div>

            <p className="mt-2.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Confirm permanent deletion of consignment <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">#{deletingOrder.id}</strong>?
            </p>

            {deleteError && (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {deleteError}
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

      {/* Bulk Import Consignments Modal */}
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
                    Bulk Import Consignments
                  </h2>
                  <p className="text-xs text-[#86868b]">
                    Batch register orders across Indian freight corridors via CSV or JSON
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

              {/* Actions row */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <label className="apple-btn-secondary text-xs cursor-pointer">
                    <FileSpreadsheet size={13} />
                    Upload CSV / JSON
                    <input
                      type="file"
                      accept=".csv,.json,text/plain"
                      onChange={handleFileBulkOrders}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadSampleOrders}
                    className="apple-btn-secondary text-xs"
                  >
                    Load Sample Corridors
                  </button>
                </div>
                <span className="text-xs text-[#86868b]">
                  {parsedBulkOrders.length} consignment{parsedBulkOrders.length === 1 ? "" : "s"} detected
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
                  placeholder="Paste CSV rows (e.g. pickup_location,delivery_location,weight,cargo_category,length,width,height) or JSON array..."
                  className="mt-1.5 w-full rounded-xl border border-black/[0.1] bg-black/[0.02] p-3 font-mono text-xs text-[#1d1d1f] dark:border-white/[0.1] dark:bg-white/[0.02] dark:text-[#f5f5f7] outline-none focus:border-[#0071e3]"
                />
              </div>

              {/* Live Preview Table */}
              {parsedBulkOrders.length > 0 && (
                <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
                  <div className="bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      Import Preview ({parsedBulkOrders.length} consignments ready)
                    </span>
                    <span className="text-[10px] text-[#34c759] font-medium flex items-center gap-1">
                      <Check size={12} /> Auto-geocoding enabled
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black/[0.02] dark:bg-white/[0.02] text-[10px] uppercase text-[#86868b]">
                        <tr>
                          <th className="px-3 py-1.5">Origin</th>
                          <th className="px-3 py-1.5">Destination</th>
                          <th className="px-3 py-1.5">Weight (kg)</th>
                          <th className="px-3 py-1.5">Category</th>
                          <th className="px-3 py-1.5">Dimensions (cm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                        {parsedBulkOrders.map((o, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-1.5 font-medium">{o.pickup_location}</td>
                            <td className="px-3 py-1.5 font-medium">{o.delivery_location}</td>
                            <td className="px-3 py-1.5 text-[#86868b]">{o.weight?.toLocaleString()} kg</td>
                            <td className="px-3 py-1.5 text-[#86868b]">{o.cargo_category}</td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#86868b]">
                              {o.length}×{o.width}×{o.height} ({o.package_count} pkgs)
                            </td>
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
                onClick={handleSubmitBulkOrders}
                disabled={bulkSubmitting || parsedBulkOrders.length === 0}
                className="apple-btn-primary text-xs"
              >
                <UploadCloud size={14} />
                {bulkSubmitting
                  ? "Importing..."
                  : `Import ${parsedBulkOrders.length} Consignment${parsedBulkOrders.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
