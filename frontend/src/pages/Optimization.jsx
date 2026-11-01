import { useState, useEffect, useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import {
  Package,
  Route,
  Truck,
  Play,
  AlertCircle,
  LoaderCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Code,
  RotateCcw,
  Sparkles,
  Navigation,
} from "lucide-react";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";

const mapContainerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "1rem",
};

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // Geographic center of India

// Apple-inspired dark mode styling for Google Maps
const appleDarkMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#161618" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#161618" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8e8e93" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d1d1d6" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#636366" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#242426" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1c1c1e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a3a3c" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1c1c1e" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#48484a" }],
  },
];

export default function Optimization() {
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
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

  // 3 Route Alternatives state
  const [selectedTripForAlternatives, setSelectedTripForAlternatives] = useState("");
  const [evaluatingAlternatives, setEvaluatingAlternatives] = useState(false);
  const [alternativesResult, setAlternativesResult] = useState(null);
  const [alternativesError, setAlternativesError] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("route_b");
  const [confirmingRoute, setConfirmingRoute] = useState(false);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState("");

  async function loadResources() {
    try {
      const [trucksRes, driversRes, tripsRes] = await Promise.all([
        api.get("/trucks/").catch(() => ({ data: [] })),
        api.get("/drivers/").catch(() => ({ data: [] })),
        api.get("/trips/").catch(() => ({ data: [] })),
      ]);
      const tList = Array.isArray(trucksRes.data) ? trucksRes.data : [];
      const dList = Array.isArray(driversRes.data) ? driversRes.data : [];
      const trList = Array.isArray(tripsRes.data) ? tripsRes.data : [];

      setTrucks(tList);
      setDrivers(dList);
      setActiveTrips(trList.filter((t) => ["planned", "in_progress"].includes(t.status)));

      if (tList.length > 0 && !truckId) setTruckId(tList[0].id);
      if (dList.length > 0 && !driverId) setDriverId(dList[0].id);
      if (trList.length > 0 && !selectedTripForAlternatives) setSelectedTripForAlternatives(String(trList[0].id));
    } catch (e) {
      console.error("Failed to load resources for optimization", e);
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
    } catch {
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
        `Demo fleet reset successfully! Seeded ${data.hubs_seeded || 18} hubs, ${data.trucks_seeded || 16} trucks, ${data.drivers_seeded || 20} drivers, ${data.consignments_seeded || 30} consignments.`
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

      await loadResources();
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

  async function handleEvaluateAlternatives(tripIdParam) {
    const targetTripId = tripIdParam || selectedTripForAlternatives;
    if (!targetTripId) {
      setAlternativesError("Please select a trip or expedition to evaluate alternatives.");
      return;
    }

    setEvaluatingAlternatives(true);
    setAlternativesError("");
    setConfirmSuccessMsg("");

    try {
      const res = await api.post("/optimization/route-alternatives", {
        trip_id: Number(targetTripId),
        diesel_price: Number(fuelPrice) || 90.0,
      });

      setAlternativesResult({
        trip_id: Number(targetTripId),
        ...res.data,
      });
      // Default selection to AI Recommended
      setSelectedRouteId("route_b");
    } catch (err) {
      console.error("Route alternatives error:", err);
      const detail = err.response?.data?.detail || err.message;
      setAlternativesError(
        typeof detail === "string" ? detail : "Failed to compute route alternatives."
      );
    } finally {
      setEvaluatingAlternatives(false);
    }
  }

  async function handleConfirmRoute(route) {
    if (!alternativesResult?.trip_id || !route) return;

    setConfirmingRoute(true);
    setConfirmSuccessMsg("");
    setAlternativesError("");

    try {
      const payload = {
        trip_id: alternativesResult.trip_id,
        route_tag: route.tag,
        distance_km: route.distance_km,
        estimated_time_minutes: route.total_transit_minutes || route.duration_minutes,
        fuel_cost: route.fuel_cost,
        coordinates: route.coordinates,
        toll_info: route.toll_display,
        saving_note: route.saving_note,
        ai_reason: route.ai_reason,
      };

      await api.post("/optimization/confirm-route", payload);
      setConfirmSuccessMsg(
        `Route option '${route.tag}' confirmed! Persisted ${route.distance_km} km and ETA ${route.eta_display} to Trip #${alternativesResult.trip_id}.`
      );
      await loadResources();
    } catch (err) {
      console.error("Failed to confirm route:", err);
      const detail = err.response?.data?.detail || err.message;
      setAlternativesError(typeof detail === "string" ? detail : "Failed to persist confirmed route.");
    } finally {
      setConfirmingRoute(false);
    }
  }

  const selectedRouteObj =
    alternativesResult?.routes?.find((r) => r.id === selectedRouteId) ||
    alternativesResult?.routes?.[0] ||
    null;

  const { resolvedTheme } = useTheme();
  const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const [apiKey] = useState(
    localStorage.getItem("fleet_gmaps_key") || envApiKey
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    region: "IN",
    language: "en",
  });

  const mapRef = useRef(null);
  const polylinesRef = useRef([]);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const clearMapOverlays = useCallback(() => {
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
    if (markersRef.current && markersRef.current.length > 0) {
      markersRef.current.forEach((marker) => {
        if (marker && typeof marker.setMap === "function") {
          marker.setMap(null);
        }
      });
      markersRef.current = [];
    }
    if (polylinesRef.current && polylinesRef.current.length > 0) {
      polylinesRef.current.forEach((polyline) => {
        if (polyline && typeof polyline.setMap === "function") {
          polyline.setMap(null);
        }
      });
      polylinesRef.current = [];
    }
  }, []);

  const onMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
  }, []);

  const handleFitRoute = useCallback(() => {
    if (!mapRef.current || !selectedRouteObj?.coordinates?.length || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    selectedRouteObj.coordinates.forEach((c) => {
      bounds.extend({ lat: Number(c[1]), lng: Number(c[0]) });
    });
    mapRef.current.fitBounds(bounds, 50);
  }, [selectedRouteObj]);

  const getOriginMarkerIcon = useCallback(() => {
    if (!window.google?.maps) return null;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="#0071e3" stroke="#ffffff" stroke-width="2.5"/>
        <text x="18" y="23" font-size="13" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif">O</text>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(36, 36),
      anchor: new window.google.maps.Point(18, 18),
    };
  }, []);

  const getDestMarkerIcon = useCallback(() => {
    if (!window.google?.maps) return null;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="#34c759" stroke="#ffffff" stroke-width="2.5"/>
        <text x="18" y="23" font-size="13" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif">D</text>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(36, 36),
      anchor: new window.google.maps.Point(18, 18),
    };
  }, []);

  // Update map overlays whenever selected route, theme, or alternatives change
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps) return;

    mapRef.current.setOptions({
      styles: resolvedTheme === "dark" ? appleDarkMapStyles : [],
    });

    clearMapOverlays();

    if (!alternativesResult?.routes?.length) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasCoords = false;

    // 1. Draw non-selected alternative routes in muted gray
    alternativesResult.routes.forEach((rt) => {
      if (!rt.coordinates || rt.coordinates.length < 2 || rt.id === selectedRouteId) return;
      const path = rt.coordinates.map((c) => ({
        lat: Number(c[1]),
        lng: Number(c[0]),
      }));

      const unselectedPolyline = new window.google.maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: resolvedTheme === "dark" ? "#636366" : "#94a3b8",
        strokeOpacity: 0.5,
        strokeWeight: 3.5,
        zIndex: 10,
      });

      unselectedPolyline.addListener("click", () => {
        setSelectedRouteId(rt.id);
      });

      polylinesRef.current.push(unselectedPolyline);
    });

    // 2. Draw selected highway route
    if (selectedRouteObj?.coordinates && selectedRouteObj.coordinates.length > 1) {
      const selectedPath = selectedRouteObj.coordinates.map((c) => {
        const pt = { lat: Number(c[1]), lng: Number(c[0]) };
        bounds.extend(pt);
        hasCoords = true;
        return pt;
      });

      const routeColor =
        selectedRouteId === "route_b"
          ? resolvedTheme === "dark" ? "#2997ff" : "#0071e3"
          : selectedRouteId === "route_c"
          ? "#34c759"
          : "#ff9500";

      const selectedPolyline = new window.google.maps.Polyline({
        path: selectedPath,
        map: mapRef.current,
        strokeColor: routeColor,
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: 25,
      });

      polylinesRef.current.push(selectedPolyline);

      // 3. Add Origin and Destination Markers
      const originPt = selectedPath[0];
      const destPt = selectedPath[selectedPath.length - 1];

      const currentTrip = activeTrips.find((t) => String(t.id) === String(selectedTripForAlternatives));
      const originName = currentTrip?.pickup_location || "Origin (Start)";
      const destName = currentTrip?.delivery_location || "Destination (End)";

      const originMarker = new window.google.maps.Marker({
        position: originPt,
        map: mapRef.current,
        icon: getOriginMarkerIcon(),
        title: `Origin: ${originName}`,
        zIndex: 35,
      });

      originMarker.addListener("click", () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
        const iw = new window.google.maps.InfoWindow({
          content: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 6px; font-size: 12px; color: #1d1d1f; max-width: 240px;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0071e3; margin-bottom: 2px;">● Origin Hub</div>
              <div style="font-weight: 600; font-size: 13px;">${originName}</div>
              <div style="font-size: 11px; color: #6e6e73; margin-top: 2px;">Lat: ${originPt.lat.toFixed(4)}, Lng: ${originPt.lng.toFixed(4)}</div>
            </div>
          `,
        });
        iw.open({ map: mapRef.current, anchor: originMarker });
        infoWindowRef.current = iw;
      });

      markersRef.current.push(originMarker);

      const destMarker = new window.google.maps.Marker({
        position: destPt,
        map: mapRef.current,
        icon: getDestMarkerIcon(),
        title: `Destination: ${destName}`,
        zIndex: 35,
      });

      destMarker.addListener("click", () => {
        if (infoWindowRef.current) infoWindowRef.current.close();
        const iw = new window.google.maps.InfoWindow({
          content: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 6px; font-size: 12px; color: #1d1d1f; max-width: 240px;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #34c759; margin-bottom: 2px;">● Destination Hub</div>
              <div style="font-weight: 600; font-size: 13px;">${destName}</div>
              <div style="font-size: 11px; color: #6e6e73; margin-top: 2px;">Lat: ${destPt.lat.toFixed(4)}, Lng: ${destPt.lng.toFixed(4)}</div>
            </div>
          `,
        });
        iw.open({ map: mapRef.current, anchor: destMarker });
        infoWindowRef.current = iw;
      });

      markersRef.current.push(destMarker);
    }

    if (hasCoords && mapRef.current) {
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [
    isLoaded,
    selectedRouteObj,
    alternativesResult,
    selectedRouteId,
    resolvedTheme,
    activeTrips,
    selectedTripForAlternatives,
    clearMapOverlays,
    getOriginMarkerIcon,
    getDestMarkerIcon,
  ]);

  // Clean overlays on unmount
  useEffect(() => {
    return () => {
      clearMapOverlays();
    };
  }, [clearMapOverlays]);

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
        "Calculate an optimized road-following route sequence with turn-by-turn highway geometry for the selected vehicle.",
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
            Route & Fleet Optimization
          </h1>
          <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#86868b]">
            OR-Tools constraint solvers, highway trade-offs, and multi-factor logistics evaluation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleRepairStatuses()}
            disabled={repairing}
            className="apple-btn-secondary text-xs"
            title="Sync truck and driver statuses with database"
          >
            <RefreshCw size={13} className={repairing ? "animate-spin" : ""} />
            {repairing ? "Syncing..." : "Sync Fleet Statuses"}
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            className="apple-btn-secondary text-xs border-amber-500/30 text-amber-600 dark:text-amber-400"
            title="Safely reset and reseed realistic Indian logistics fleet data"
          >
            <RotateCcw size={13} />
            Reset Demo Fleet
          </button>
        </div>
      </header>

      {repairMsg && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#34c759]/20 bg-[#34c759]/10 p-4 text-xs font-medium text-[#34c759] dark:border-[#30d158]/20 dark:bg-[#30d158]/10 dark:text-[#30d158]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            {repairMsg}
          </div>
          <button onClick={() => setRepairMsg("")} className="text-xs opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      )}

      {/* SECTION 1: 3 ROUTE OPTIONS (DESIGN REFERENCE MATCH) */}
      <section className="mb-10">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#0071e3] dark:text-[#2997ff]">
              ROUTE TRADEOFF ANALYSIS
            </span>
            <h2 className="mt-0.5 text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
              Choose the tradeoff you actually want.
            </h2>
            <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Evaluate 3 distinct route alternatives computed with real highway distance, ETA, fuel, and tolls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={selectedTripForAlternatives}
              onChange={(e) => setSelectedTripForAlternatives(e.target.value)}
              className="apple-input text-xs w-auto py-1.5"
            >
              {activeTrips.length === 0 ? (
                <option value="">No Active Expeditions</option>
              ) : (
                activeTrips.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    Trip #{tr.id} · {tr.truck_registration || `Truck #${tr.truck_id}`} ({tr.pickup_location?.split(",")[0] || "Origin"} → {tr.delivery_location?.split(",")[0] || "Dest"})
                  </option>
                ))
              )}
            </select>
            <button
              onClick={() => handleEvaluateAlternatives()}
              disabled={evaluatingAlternatives || activeTrips.length === 0}
              className="apple-btn-primary text-xs flex items-center gap-1.5"
            >
              {evaluatingAlternatives ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              {evaluatingAlternatives ? "Evaluating..." : "Optimize route"}
            </button>
          </div>
        </div>

        {alternativesError && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            {alternativesError}
          </div>
        )}

        {confirmSuccessMsg && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-[#34c759]/20 bg-[#34c759]/10 p-4 text-xs font-semibold text-[#34c759] dark:text-[#30d158]">
            <CheckCircle2 size={16} />
            {confirmSuccessMsg}
          </div>
        )}

        {/* Route Cards Grid (Reference Design Match) */}
        {evaluatingAlternatives ? (
          <div className="apple-card p-12 text-center">
            <LoaderCircle size={28} className="mx-auto mb-3 animate-spin text-[#0071e3] dark:text-[#2997ff]" />
            <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Analyzing Highway Corridors across India...
            </p>
            <p className="mt-1 text-[11px] text-[#86868b]">
              Computing Google Routes & OSRM alternatives, fuel burn at truck mileage, night fatigue, and toll fees.
            </p>
          </div>
        ) : alternativesResult?.routes?.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {alternativesResult.routes.map((rt) => {
                const isSelected = selectedRouteId === rt.id;
                const isRecommended = rt.route_label === "recommended";

                return (
                  <article
                    key={rt.id}
                    onClick={() => setSelectedRouteId(rt.id)}
                    className={`relative cursor-pointer rounded-2xl p-6 transition-all duration-200 ${
                      isSelected
                        ? "border-2 border-[#0071e3] bg-gradient-to-br from-blue-50/60 to-indigo-50/40 shadow-lg dark:border-[#2997ff] dark:from-blue-950/30 dark:to-indigo-950/20"
                        : isRecommended
                        ? "border border-blue-200 bg-blue-50/20 hover:border-blue-400 dark:border-blue-900/50 dark:bg-blue-950/10"
                        : "apple-card hover:border-black/20 dark:hover:border-white/20"
                    }`}
                  >
                    {/* Tag badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#6e6e73] dark:text-[#86868b]">
                        ROUTE {rt.id.slice(-1).toUpperCase()} · {rt.tag}
                      </span>
                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0071e3] text-white dark:bg-[#2997ff]">
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Headline metrics */}
                    <h3 className="mt-3.5 text-xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {Math.round(rt.distance_km).toLocaleString()} km · {rt.eta_display} ETA
                    </h3>

                    {/* Cost & Toll */}
                    <p className="mt-1 text-xs text-[#6e6e73] dark:text-[#86868b]">
                      Fuel ₹{Math.round(rt.fuel_cost).toLocaleString()} · Toll {rt.toll_display}
                    </p>

                    {/* Dynamic Saving Note */}
                    {rt.saving_note && (
                      <b className={`mt-3 block text-xs font-semibold ${
                        isRecommended ? "text-[#0071e3] dark:text-[#2997ff]" : "text-[#34c759] dark:text-[#30d158]"
                      }`}>
                        {rt.saving_note}
                      </b>
                    )}

                    {/* AI Recommendation Reason */}
                    {rt.ai_reason && (
                      <p className="mt-2 text-[11px] leading-relaxed text-[#6e6e73] dark:text-[#86868b] border-t border-black/[0.06] pt-2 dark:border-white/[0.08]">
                        <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Why AI picked this:</span> {rt.ai_reason}
                      </p>
                    )}

                    {/* Night driving and risk indicator */}
                    <div className="mt-4 flex items-center justify-between text-[10px] text-[#86868b] border-t border-black/[0.04] pt-2 dark:border-white/[0.06]">
                      <span>Night window (22-03h): {rt.night_hours}h</span>
                      <span className="font-medium">Risk Score: {rt.risk_score}</span>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Selected Route Action Bar & Map View */}
            <div className="apple-card overflow-hidden">
              <div className="flex flex-col justify-between gap-4 border-b border-black/[0.06] p-5 sm:flex-row sm:items-center dark:border-white/[0.08]">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#0071e3] dark:text-[#2997ff]">
                    Selected Highway Polyline
                  </span>
                  <h4 className="text-sm font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Route {selectedRouteObj?.id?.slice(-1)?.toUpperCase()} ({selectedRouteObj?.tag}): {selectedRouteObj?.distance_km} km • ETA {selectedRouteObj?.eta_display}
                  </h4>
                  <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
                    Validated strictly within Survey of India sovereign borders. Ready for vehicle assignment.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleConfirmRoute(selectedRouteObj)}
                    disabled={confirmingRoute || !selectedRouteObj}
                    className="apple-btn-primary text-xs flex items-center gap-1.5"
                  >
                    {confirmingRoute ? (
                      <LoaderCircle size={13} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    {confirmingRoute ? "Persisting..." : "Confirm Route"}
                  </button>
                </div>
              </div>

              {/* Map Polyline Visualizer (Interactive Google Map View) */}
              <div className="p-6">
                <div className="relative h-[440px] w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-[#0c1017] text-white dark:border-white/[0.08]">
                  {/* Top-Left Live Corridor Badge */}
                  <div className="pointer-events-none select-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-xl bg-black/75 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-md">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#34c759] animate-pulse" />
                    <span>Live Corridor:</span>
                    <span className="font-semibold">{selectedRouteObj?.coordinates?.length?.toLocaleString() || 0}</span>
                    <span className="text-[#86868b]">highway waypoints</span>
                    <span className="text-white/30">•</span>
                    <span className="font-semibold text-[#2997ff]">{selectedRouteObj?.distance_km} km</span>
                  </div>

                  {/* Top-Right Fit Route & Quick Center Control */}
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                    <button
                      onClick={handleFitRoute}
                      title="Fit entire highway corridor in map view"
                      className="flex items-center gap-1.5 rounded-xl bg-black/75 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur-md transition-all hover:bg-black/90 active:scale-95"
                    >
                      <Navigation size={12} className="text-[#2997ff]" />
                      <span>Fit Route</span>
                    </button>
                  </div>

                  {/* Bottom-Left Route Alternative Switcher */}
                  {alternativesResult?.routes?.length > 1 && (
                    <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-1.5 rounded-xl bg-black/75 p-1.5 shadow-lg backdrop-blur-md">
                      {alternativesResult.routes.map((rt) => {
                        const isSel = rt.id === selectedRouteId;
                        const routeLetter = rt.id.slice(-1).toUpperCase();
                        let activeBg = "bg-[#0071e3] text-white";
                        let inactiveText = "text-[#2997ff]";
                        if (rt.id === "route_c") {
                          activeBg = "bg-[#34c759] text-white";
                          inactiveText = "text-[#34c759]";
                        } else if (rt.id === "route_a") {
                          activeBg = "bg-[#ff9500] text-white";
                          inactiveText = "text-[#ff9500]";
                        }

                        return (
                          <button
                            key={rt.id}
                            onClick={() => setSelectedRouteId(rt.id)}
                            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
                              isSel ? activeBg : `${inactiveText} hover:bg-white/10`
                            }`}
                          >
                            Route {routeLetter}: {rt.tag}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom-Right Survey of India Compliance Badge */}
                  <div className="pointer-events-none select-none absolute bottom-3 right-3 z-10 rounded-xl bg-black/75 px-3 py-1.5 text-[10px] font-mono text-[#86868b] shadow-lg backdrop-blur-md">
                    India Sovereign Territory (Survey of India Compliant)
                  </div>

                  {/* Google Map / Fallback Visualizer */}
                  {loadError ? (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                      <AlertCircle size={28} className="text-red-500 mb-2" />
                      <h4 className="text-xs font-semibold text-white">
                        Google Maps Loading Error
                      </h4>
                      <p className="mt-1 text-[11px] text-[#86868b] max-w-sm">
                        {loadError.message || "Invalid Google Maps API Key or restricted network permissions."}
                      </p>
                    </div>
                  ) : !isLoaded ? (
                    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                      <LoaderCircle size={24} className="animate-spin text-[#2997ff] mb-2" />
                      <span className="text-xs font-medium text-[#86868b]">
                        Loading Google Maps highway satellite & road layers...
                      </span>
                    </div>
                  ) : selectedRouteObj?.coordinates && selectedRouteObj.coordinates.length > 1 ? (
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={DEFAULT_CENTER}
                      zoom={5}
                      onLoad={onMapLoad}
                      options={{
                        streetViewControl: false,
                        mapTypeControl: true,
                        fullscreenControl: true,
                        zoomControl: true,
                        styles: resolvedTheme === "dark" ? appleDarkMapStyles : [],
                        restriction: {
                          latLngBounds: { north: 37.5, south: 6.5, west: 68.0, east: 97.5 },
                          strictBounds: false,
                        },
                        minZoom: 4,
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#86868b]">
                      No polyline coordinates available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="apple-card p-8 text-center border-dashed">
            <Route size={32} className="mx-auto mb-2 text-[#86868b] opacity-60" />
            <h3 className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Ready to evaluate highway route options
            </h3>
            <p className="mt-1 text-[11px] text-[#86868b]">
              Select an active expedition above and click &quot;Optimize route&quot; to generate Fastest, AI Recommended, and Safest route cards.
            </p>
          </div>
        )}
      </section>

      {/* SECTION 2: CONFIGURATION & SOLVERS */}
      <div className="apple-card p-6 mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#86868b] mb-4">
          Fleet Simulation Inputs
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
              Assigned Truck
            </label>
            <select
              value={truckId}
              onChange={(e) => setTruckId(e.target.value)}
              className="apple-input text-xs"
            >
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.registration_number} ({t.capacity} kg) - {t.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
              Designated Driver
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="apple-input text-xs"
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (Wellness: {d.wellness_score || 85} · {d.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#6e6e73] dark:text-[#86868b]">
              Diesel Rate (₹/Litre)
            </label>
            <input
              type="number"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="apple-input text-xs"
              min="1"
            />
          </div>
        </div>
      </div>

      {/* Solvers Cards Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-10">
        {actions.map((act) => {
          const Icon = act.icon;
          const isRunning = activeAction === act.id;

          return (
            <div key={act.id} className="apple-card flex flex-col justify-between p-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2.5 ${act.color}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className="font-semibold text-sm text-[#1d1d1f] dark:text-[#f5f5f7]">
                    {act.title}
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b]">
                  {act.description}
                </p>
              </div>

              <div className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
                <button
                  onClick={() => runOptimization(act.id)}
                  disabled={Boolean(activeAction)}
                  className="apple-btn-primary w-full text-xs"
                >
                  {isRunning ? (
                    <>
                      <LoaderCircle size={14} className="animate-spin" />
                      Computing Solution...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      {act.button}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* General Solver Error Alert */}
      {error && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="font-semibold">Optimization Feasibility Exception</h4>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
              {error}
            </pre>
          </div>
        </div>
      )}

      {/* Solver Results View */}
      {result && (
        <div className="apple-card overflow-hidden mb-10">
          <div className="flex items-center justify-between border-b border-black/[0.06] p-6 dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-[#34c759] dark:text-[#30d158]" />
              <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Solver Execution Output
              </h2>
            </div>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="apple-btn-secondary text-xs"
            >
              <Code size={13} />
              {showRawJson ? "Hide JSON" : "Raw JSON"}
            </button>
          </div>

          <div className="p-6 space-y-6">
            {result.data?.message && (
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-4 text-xs font-medium text-[#1d1d1f] dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-[#f5f5f7]">
                {result.data.message}
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
                          <span className="text-[#86868b]">Payload:</span>{" "}
                          <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">{asgn.total_weight_kg ?? asgn.total_weight ?? 0} / {asgn.truck_capacity} kg</strong>
                          <span className="ml-1 text-[#86868b]">({asgn.utilization_percentage}%)</span>
                        </div>
                        <div>
                          <span className="text-[#86868b]">Fuel Cost:</span>{" "}
                          <strong className="text-[#1d1d1f] dark:text-[#f5f5f7]">₹{asgn.total_fuel_cost ?? asgn.fuel_cost ?? 0}</strong>
                        </div>
                      </div>
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

                      {/* Stops sequence */}
                      {Array.isArray(route.stops) && route.stops.length > 0 && (
                        <div>
                          <span className="text-xs font-semibold text-[#86868b] block mb-2">Stop Sequence:</span>
                          <div className="flex flex-wrap items-center gap-2">
                            {route.stops.map((stop, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-1.5 text-xs">
                                <span className="px-3 py-1.5 rounded-xl border font-medium bg-white border-black/[0.08] text-[#1d1d1f] dark:bg-[#161618] dark:border-white/[0.08] dark:text-[#f5f5f7]">
                                  {stop.name || stop.location || `Stop #${sIdx + 1}`}
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

            {/* Raw JSON inspection */}
            {showRawJson && (
              <pre className="rounded-2xl border border-black/[0.08] bg-[#0c1017] p-5 text-xs text-[#34c759] font-mono overflow-x-auto dark:border-white/[0.08]">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Reset Demo Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="apple-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Reset Demo Fleet
            </h3>
            <p className="text-xs text-[#6e6e73] dark:text-[#86868b]">
              This will safely back up your current state and reseed realistic Indian hubs, trucks with mileage counters, drivers with varied wellness scores, and consignments.
            </p>
            <div>
              <label className="text-xs font-medium text-[#6e6e73] dark:text-[#86868b] block mb-1">
                Random Seed (Determinism)
              </label>
              <input
                type="number"
                value={seedVal}
                onChange={(e) => setSeedVal(Number(e.target.value))}
                className="apple-input text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="apple-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleResetDemoFleet}
                disabled={resettingDemo}
                className="apple-btn-primary text-xs"
              >
                {resettingDemo ? "Seeding..." : "Confirm & Reseed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
