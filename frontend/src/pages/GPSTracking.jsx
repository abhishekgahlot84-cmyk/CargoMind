import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import {
  Truck,
  RefreshCw,
  AlertTriangle,
  Radio,
  MapPin,
  Clock,
  Gauge,
  Key,
  X,
  User,
  Phone,
  Layers,
  Sparkles,
  Info,
  ChevronLeft,
} from "lucide-react";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import SpeedometerGauge from "../components/SpeedometerGauge";

const containerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "1rem",
};

const DEFAULT_CENTER = { lat: 22.5937, lng: 78.9629 }; // Central India geographic center

// Apple-inspired minimalist dark mode map styles
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

export default function GPSTracking() {
  const { resolvedTheme } = useTheme();
  const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const [apiKey, setApiKey] = useState(
    localStorage.getItem("fleet_gmaps_key") || envApiKey
  );
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    region: "IN",
    language: "en",
  });

  // Single source of truth for view mode: null = Fleet Overview, number = Selected Truck ID
  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const selectedTruckIdRef = useRef(null);

  const [fleetList, setFleetList] = useState([]);
  const [singleTruckData, setSingleTruckData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Map and Overlay Refs for deterministic imperative lifecycle
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Synchronize ref with state
  useEffect(() => {
    selectedTruckIdRef.current = selectedTruckId;
  }, [selectedTruckId]);

  // Imperatively purge all map overlays to eliminate lingering routes/markers
  const clearMapOverlays = useCallback(() => {
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current.setMap(null);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMapOverlays();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [clearMapOverlays]);

  // Fetch all fleet vehicles and their simulated positions
  const fetchFleetTelemetry = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await api.get("/gps/simulation/fleet");
      const list = Array.isArray(res.data) ? res.data : [];
      setFleetList(list);
    } catch (err) {
      console.error("Fleet telemetry fetch error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFleetTelemetry();
  }, [fetchFleetTelemetry]);

  // Fetch telemetry for specifically selected truck with race-condition guard
  const fetchSelectedTruckTelemetry = useCallback(async (truckId) => {
    if (!truckId) {
      setSingleTruckData(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestIdRef.current;

    try {
      const res = await api.get(`/gps/simulation/${truckId}`, {
        signal: controller.signal,
      });
      if (reqId === requestIdRef.current && selectedTruckIdRef.current === truckId) {
        if (res.data) {
          setSingleTruckData(res.data);
        }
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error(`Error fetching telemetry for truck ${truckId}:`, err);
      }
    }
  }, []);

  // Selection handlers
  const handleSelectTruck = useCallback(
    (truckId) => {
      selectedTruckIdRef.current = truckId;
      setSelectedTruckId(truckId);
      fetchSelectedTruckTelemetry(truckId);
    },
    [fetchSelectedTruckTelemetry]
  );

  const handleBackToOverview = useCallback(() => {
    selectedTruckIdRef.current = null;
    setSelectedTruckId(null);
    setSingleTruckData(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Escape key returns to fleet overview
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleBackToOverview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBackToOverview]);

  // Auto-refresh interval (frequent updates: every 2.5 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchFleetTelemetry();
      if (selectedTruckIdRef.current) {
        fetchSelectedTruckTelemetry(selectedTruckIdRef.current);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchFleetTelemetry, fetchSelectedTruckTelemetry]);

  // Active truck object
  const activeTruck = useMemo(() => {
    if (!selectedTruckId) return null;
    if (singleTruckData && singleTruckData.truck_id === selectedTruckId) {
      return singleTruckData;
    }
    return fleetList.find((t) => t.truck_id === selectedTruckId) || null;
  }, [singleTruckData, fleetList, selectedTruckId]);

  // Polyline points formatted for Google Maps
  const polylinePath = useMemo(() => {
    if (!activeTruck?.route_polyline || !Array.isArray(activeTruck.route_polyline)) {
      return [];
    }
    return activeTruck.route_polyline
      .map((pt) => {
        if (Array.isArray(pt) && pt.length >= 2) {
          return { lat: Number(pt[1]), lng: Number(pt[0]) };
        }
        if (pt && typeof pt === "object") {
          return { lat: Number(pt.lat || pt.latitude), lng: Number(pt.lng || pt.longitude) };
        }
        return null;
      })
      .filter((pt) => pt && !isNaN(pt.lat) && !isNaN(pt.lng));
  }, [activeTruck]);

  // Marker Icon Generators
  const getTruckMarkerIcon = useCallback((truck, isSelected) => {
    if (!window.google) return null;
    const bg = isSelected ? "#0071e3" : "#1d1d1f";
    const stroke = isSelected ? "#ffffff" : "#86868b";
    const reg = truck.truck_registration || `#${truck.truck_id}`;
    const cleanReg = reg.length > 8 ? reg.slice(-8) : reg;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="90" height="38" viewBox="0 0 90 38">
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.4"/>
          </filter>
        </defs>
        <rect x="2" y="3" width="86" height="30" rx="9" fill="${bg}" stroke="${stroke}" stroke-width="1.5" filter="url(#shadow)"/>
        <circle cx="16" cy="18" r="8" fill="#ffffff" fill-opacity="0.18"/>
        <text x="16" y="22" font-size="10" font-family="system-ui, sans-serif" text-anchor="middle" fill="#ffffff">🚛</text>
        <text x="51" y="22" font-size="10" font-weight="700" font-family="monospace, system-ui, sans-serif" text-anchor="middle" fill="#ffffff">${cleanReg}</text>
      </svg>
    `;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(90, 38),
      anchor: new window.google.maps.Point(45, 19),
    };
  }, []);

  const getPickupMarkerIcon = useCallback(() => {
    if (!window.google) return null;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="#34c759" stroke="#ffffff" stroke-width="2.5"/>
        <text x="18" y="23" font-size="13" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif">P</text>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(36, 36),
      anchor: new window.google.maps.Point(18, 18),
    };
  }, []);

  const getDeliveryMarkerIcon = useCallback(() => {
    if (!window.google) return null;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="#ff3b30" stroke="#ffffff" stroke-width="2.5"/>
        <text x="18" y="23" font-size="13" font-weight="bold" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif">D</text>
      </svg>
    `;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(36, 36),
      anchor: new window.google.maps.Point(18, 18),
    };
  }, []);

  // Popup Info Window Generator
  const showTruckInfoWindow = useCallback((truck, anchorMarker) => {
    if (!window.google || !mapRef.current) return;
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const isDark = resolvedTheme === "dark";
    const bg = isDark ? "#1c1c1e" : "#ffffff";
    const textPrimary = isDark ? "#f5f5f7" : "#1d1d1f";
    const textMuted = isDark ? "#86868b" : "#6e6e73";
    const borderCol = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
    const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)";
    const accentCol = isDark ? "#2997ff" : "#0071e3";

    const currSpeed = Number(truck.speed_kmph ?? truck.current_speed ?? 0);
    const avgSpeed = Number(truck.avg_speed_kmph ?? truck.average_speed_kmph ?? 45);
    const maxSpeed = Number(truck.max_speed_kmph ?? 80);
    const stateKey = (truck.state || truck.trip_status || "moving").toLowerCase();
    
    let stateLabel = "Moving";
    let stateBadgeBg = "rgba(52,199,89,0.15)";
    let stateBadgeColor = isDark ? "#30d158" : "#34c759";
    if (stateKey.includes("break")) {
      stateLabel = "On Break";
      stateBadgeBg = "rgba(255,149,0,0.15)";
      stateBadgeColor = isDark ? "#ff9f0a" : "#ff9500";
    } else if (stateKey.includes("not_started") || stateKey.includes("idle")) {
      stateLabel = "Not Started";
      stateBadgeBg = "rgba(0,113,227,0.15)";
      stateBadgeColor = isDark ? "#2997ff" : "#0071e3";
    } else if (stateKey.includes("completed")) {
      stateLabel = "Completed";
      stateBadgeBg = "rgba(99,99,102,0.15)";
      stateBadgeColor = isDark ? "#8e8e93" : "#636366";
    }

    const contentString = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 240px; max-width: 300px; padding: 6px; color: ${textPrimary}; background: ${bg}; border-radius: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${borderCol}; padding-bottom: 6px; margin-bottom: 6px;">
          <div>
            <div style="font-weight: 700; font-size: 13px; color: ${textPrimary}; font-family: monospace;">${truck.truck_registration || `Truck #${truck.truck_id}`}</div>
            <div style="font-size: 10px; color: ${textMuted};">Trip #${truck.trip_id || "—"} • <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 9px; background: ${stateBadgeBg}; color: ${stateBadgeColor};">${stateLabel}</span></div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
            <span style="font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(52,199,89,0.15); color: #34c759; text-transform: uppercase;">
              Simulated
            </span>
            <span style="font-size: 8px; color: ${textMuted}; font-family: monospace;">Road Polyline</span>
          </div>
        </div>
        ${
          truck.driver
            ? `
          <div style="background: ${cardBg}; border: 1px solid ${borderCol}; border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; font-size: 11px;">
            <div style="font-size: 9px; text-transform: uppercase; font-weight: 600; color: ${textMuted};">Assigned Driver</div>
            <div style="font-weight: 600; color: ${textPrimary};">${truck.driver.name}</div>
            <div style="color: ${textMuted}; font-size: 10px;">${truck.driver.phone || "—"}</div>
          </div>
        `
            : ""
        }
        <div style="font-size: 11px; line-height: 1.5; color: ${textPrimary};">
          <div style="margin-bottom: 4px;"><strong>Corridor:</strong> ${truck.origin || "Pickup"} → ${truck.destination || "Delivery"}</div>
          
          <div style="background: ${cardBg}; border: 1px solid ${borderCol}; border-radius: 6px; padding: 6px 8px; margin-bottom: 5px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span><strong>Speed:</strong> <span style="font-size: 13px; font-weight: 700; color: ${accentCol}; font-family: monospace;">${currSpeed.toFixed(1)}</span> km/h</span>
              <span style="font-size: 10px; color: ${textMuted}; font-family: monospace;">Avg: ${avgSpeed.toFixed(0)} | Max: ${maxSpeed.toFixed(0)}</span>
            </div>
            <div style="margin-top: 4px; height: 4px; border-radius: 2px; background: ${borderCol}; overflow: hidden; position: relative;">
              <div style="height: 100%; width: ${Math.min(100, Math.max(0, (currSpeed / maxSpeed) * 100))}%; background: ${accentCol};"></div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span><strong>ETA:</strong> ${truck.eta || "In Transit"}</span>
            <span><strong>Progress:</strong> ${truck.progress_percentage || 0}%</span>
          </div>
          <div style="font-size: 10px; color: ${textMuted};">
            Distance: ${truck.distance_travelled_km || 0} / ${truck.total_distance_km || 0} km (Rem: ${truck.distance_remaining_km || 0} km)
          </div>
        </div>
      </div>
    `;

    const infoWindow = new window.google.maps.InfoWindow({
      content: contentString,
      disableAutoPan: false,
    });
    infoWindow.open({
      map: mapRef.current,
      anchor: anchorMarker,
    });
    infoWindowRef.current = infoWindow;
  }, [resolvedTheme]);

  // Imperative Map Renderer: Renders Fleet Overview (zero polylines) OR Single Truck (only 1 truck + route)
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    // Apply Apple map theme styles
    mapRef.current.setOptions({
      styles: resolvedTheme === "dark" ? appleDarkMapStyles : [],
    });

    // 1. ALWAYS clean previous overlays first
    clearMapOverlays();

    // 2. Case A: Fleet Overview Mode (selectedTruckId === null)
    if (!selectedTruckId) {
      if (fleetList.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        let validCoords = 0;

        fleetList.forEach((truck) => {
          if (!truck.current_position?.lat || !truck.current_position?.lng) return;
          const pos = {
            lat: Number(truck.current_position.lat),
            lng: Number(truck.current_position.lng),
          };
          bounds.extend(pos);
          validCoords++;

          const marker = new window.google.maps.Marker({
            position: pos,
            map: mapRef.current,
            icon: getTruckMarkerIcon(truck, false),
            title: truck.truck_registration || `Truck #${truck.truck_id}`,
            zIndex: 10,
          });

          marker.addListener("click", (e) => {
            if (e && e.stop) e.stop();
            handleSelectTruck(truck.truck_id);
          });

          markersRef.current.push(marker);
        });

        if (validCoords > 0) {
          mapRef.current.fitBounds(bounds, 60);
        } else {
          const indiaBounds = new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(6.5, 68.0),
            new window.google.maps.LatLng(37.5, 97.5)
          );
          mapRef.current.fitBounds(indiaBounds, 20);
        }
      } else {
        const indiaBounds = new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(6.5, 68.0),
          new window.google.maps.LatLng(37.5, 97.5)
        );
        mapRef.current.fitBounds(indiaBounds, 20);
      }
      return;
    }

    // 3. Case B: Single Selected Truck Mode (selectedTruckId !== null)
    if (!activeTruck) return;

    const bounds = new window.google.maps.LatLngBounds();
    let hasCoords = false;

    // (i) Pickup Marker (Green 'P')
    if (activeTruck.pickup_coordinates?.lat && activeTruck.pickup_coordinates?.lng) {
      const pPos = {
        lat: Number(activeTruck.pickup_coordinates.lat),
        lng: Number(activeTruck.pickup_coordinates.lng),
      };
      bounds.extend(pPos);
      hasCoords = true;

      const pMarker = new window.google.maps.Marker({
        position: pPos,
        map: mapRef.current,
        icon: getPickupMarkerIcon(),
        title: `Pickup: ${activeTruck.origin || "Pickup Hub"}`,
        zIndex: 25,
      });

      pMarker.addListener("click", (e) => {
        if (e && e.stop) e.stop();
        if (infoWindowRef.current) infoWindowRef.current.close();
        const iw = new window.google.maps.InfoWindow({
          content: `<div style="font-family: system-ui; padding: 4px; font-size: 12px;"><strong>Pickup Origin:</strong> ${activeTruck.origin}</div>`,
        });
        iw.open({ map: mapRef.current, anchor: pMarker });
        infoWindowRef.current = iw;
      });

      markersRef.current.push(pMarker);
    }

    // (ii) Delivery Marker (Red 'D')
    if (activeTruck.delivery_coordinates?.lat && activeTruck.delivery_coordinates?.lng) {
      const dPos = {
        lat: Number(activeTruck.delivery_coordinates.lat),
        lng: Number(activeTruck.delivery_coordinates.lng),
      };
      bounds.extend(dPos);
      hasCoords = true;

      const dMarker = new window.google.maps.Marker({
        position: dPos,
        map: mapRef.current,
        icon: getDeliveryMarkerIcon(),
        title: `Destination: ${activeTruck.destination || "Delivery Terminal"}`,
        zIndex: 25,
      });

      dMarker.addListener("click", (e) => {
        if (e && e.stop) e.stop();
        if (infoWindowRef.current) infoWindowRef.current.close();
        const iw = new window.google.maps.InfoWindow({
          content: `<div style="font-family: system-ui; padding: 4px; font-size: 12px;"><strong>Delivery Destination:</strong> ${activeTruck.destination}</div>`,
        });
        iw.open({ map: mapRef.current, anchor: dMarker });
        infoWindowRef.current = iw;
      });

      markersRef.current.push(dMarker);
    }

    // (iii) Split Route Polylines: Travelled (highlighted) vs Remaining (dimmed)
    if (polylinePath.length > 1) {
      polylinePath.forEach((pt) => {
        bounds.extend(pt);
        hasCoords = true;
      });

      const progress = Math.min(100, Math.max(0, activeTruck.progress_percentage || 0));
      const splitIdx = Math.max(
        1,
        Math.min(polylinePath.length - 1, Math.floor((polylinePath.length - 1) * (progress / 100)))
      );

      const travelledPoints = polylinePath.slice(0, splitIdx + 1);
      if (activeTruck.current_position?.lat && activeTruck.current_position?.lng) {
        travelledPoints[travelledPoints.length - 1] = {
          lat: Number(activeTruck.current_position.lat),
          lng: Number(activeTruck.current_position.lng),
        };
      }

      const remainingPoints = [
        activeTruck.current_position?.lat && activeTruck.current_position?.lng
          ? {
              lat: Number(activeTruck.current_position.lat),
              lng: Number(activeTruck.current_position.lng),
            }
          : polylinePath[splitIdx],
        ...polylinePath.slice(splitIdx + 1),
      ];

      // Highlighted Travelled Path
      const travelledLine = new window.google.maps.Polyline({
        path: travelledPoints,
        map: mapRef.current,
        strokeColor: resolvedTheme === "dark" ? "#2997ff" : "#0071e3",
        strokeOpacity: 1.0,
        strokeWeight: 5,
        zIndex: 15,
      });
      polylinesRef.current.push(travelledLine);

      // Dimmed Remaining Path
      if (remainingPoints.length > 1) {
        const remainingLine = new window.google.maps.Polyline({
          path: remainingPoints,
          map: mapRef.current,
          strokeColor: resolvedTheme === "dark" ? "#636366" : "#86868b",
          strokeOpacity: 0.45,
          strokeWeight: 4,
          zIndex: 5,
        });
        polylinesRef.current.push(remainingLine);
      }
    }

    // (iv) Live Truck Position Marker
    if (activeTruck.current_position?.lat && activeTruck.current_position?.lng) {
      const truckPos = {
        lat: Number(activeTruck.current_position.lat),
        lng: Number(activeTruck.current_position.lng),
      };
      bounds.extend(truckPos);
      hasCoords = true;

      const truckMarker = new window.google.maps.Marker({
        position: truckPos,
        map: mapRef.current,
        icon: getTruckMarkerIcon(activeTruck, true),
        title: `${activeTruck.truck_registration || `Truck #${activeTruck.truck_id}`} (Live)`,
        zIndex: 100,
      });

      truckMarker.addListener("click", (e) => {
        if (e && e.stop) e.stop();
        showTruckInfoWindow(activeTruck, truckMarker);
      });

      markersRef.current.push(truckMarker);

      // Automatically show telemetry popup on selection
      showTruckInfoWindow(activeTruck, truckMarker);
    }

    // Fit map view to the isolated trip
    if (hasCoords) {
      mapRef.current.fitBounds(bounds, 70);
    }
  }, [
    selectedTruckId,
    activeTruck,
    fleetList,
    polylinePath,
    resolvedTheme,
    clearMapOverlays,
    getTruckMarkerIcon,
    getPickupMarkerIcon,
    getDeliveryMarkerIcon,
    handleSelectTruck,
    showTruckInfoWindow,
  ]);

  // Google Maps map instance load handler
  const onMapLoad = useCallback(
    (mapInstance) => {
      mapRef.current = mapInstance;

      // Fit default view to India bounding box
      if (window.google) {
        const indiaBounds = new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(6.5, 68.0),
          new window.google.maps.LatLng(37.5, 97.5)
        );
        mapInstance.fitBounds(indiaBounds, 20);
      }

      // Empty map click listener: deselects single truck and returns to overview
      mapInstance.addListener("click", () => {
        if (selectedTruckIdRef.current !== null) {
          handleBackToOverview();
        }
      });
    },
    [handleBackToOverview]
  );

  const handleSaveKey = (e) => {
    e.preventDefault();
    if (customKeyInput.trim()) {
      localStorage.setItem("fleet_gmaps_key", customKeyInput.trim());
      setApiKey(customKeyInput.trim());
      setShowKeyModal(false);
      window.location.reload();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col p-4 sm:p-6 lg:h-screen lg:flex-row lg:gap-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      {/* Sidebar: Vehicle & GPS Telemetry */}
      <div className="flex w-full flex-col gap-4 overflow-y-auto apple-card p-5 lg:w-96 lg:shrink-0">
        <div className="flex items-center justify-between border-b border-black/[0.06] pb-4 dark:border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[#34c759] dark:bg-[#30d158] animate-pulse" />
              <h1 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Live GPS Telemetry
              </h1>
            </div>
            <p className="text-[11px] text-[#86868b] mt-0.5 flex items-center gap-1">
              <span>Time-interpolated live fleet simulation</span>
              <button
                onClick={() => setShowSimulationModal(true)}
                className="text-[#0071e3] hover:underline dark:text-[#2997ff]"
                title="Telemetry details"
              >
                <Info size={12} />
              </button>
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                fetchFleetTelemetry();
                if (selectedTruckIdRef.current) {
                  fetchSelectedTruckTelemetry(selectedTruckIdRef.current);
                }
              }}
              disabled={isRefreshing}
              className="apple-btn-secondary p-2 text-xs rounded-xl"
              title="Refresh GPS positions"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Mode Status & "Back to Fleet Overview" Button */}
        {selectedTruckId ? (
          <div className="flex items-center justify-between rounded-xl bg-[#0071e3]/10 p-2.5 dark:bg-[#2997ff]/15">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0071e3] dark:text-[#2997ff]">
              <span className="h-2 w-2 rounded-full bg-[#0071e3] dark:bg-[#2997ff] animate-pulse" />
              <span>Isolated Trip Mode</span>
            </div>
            <button
              id="sidebar-back-to-overview-btn"
              onClick={handleBackToOverview}
              className="apple-btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 text-[#1d1d1f] dark:text-[#f5f5f7]"
              title="Return to fleet overview (Esc)"
            >
              <ChevronLeft size={13} />
              <span>Fleet Overview</span>
              <kbd className="hidden sm:inline-block ml-1 text-[10px] text-[#86868b]">Esc</kbd>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/[0.04] text-xs">
            <div className="flex items-center gap-2 text-[#86868b]">
              <Layers size={13} />
              <span>Fleet Overview Active</span>
            </div>
            <span className="text-[11px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              {fleetList.length} Vehicles Online
            </span>
          </div>
        )}

        {/* Missing API Key Notice */}
        {!apiKey && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-[#ff9500] dark:text-[#ff9f0a]">
            <div className="flex items-start gap-2">
              <Key size={14} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Google Maps API Key</span>
                <p className="mt-1 text-[11px] leading-relaxed text-[#86868b]">
                  Add <code className="bg-black/[0.05] dark:bg-white/[0.1] px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> in <code className="bg-black/[0.05] dark:bg-white/[0.1] px-1 rounded">.env</code> or configure below:
                </p>
                <button
                  onClick={() => setShowKeyModal(true)}
                  className="apple-btn-primary mt-2 text-[11px] py-1 px-3"
                >
                  Configure Key
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selected Truck Detail Card (Strictly synchronized with map popup) */}
        {activeTruck ? (
          <div className="space-y-3 rounded-2xl bg-black/[0.02] p-4 border border-black/[0.06] text-xs dark:bg-white/[0.02] dark:border-white/[0.06]">
            {/* Header with Truck Reg & Simulated Badge */}
            <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <h3 className="font-bold text-sm text-[#1d1d1f] dark:text-[#f5f5f7] font-mono">
                  {activeTruck.truck_registration || `Truck #${activeTruck.truck_id}`}
                </h3>
                <p className="text-[10px] text-[#86868b]">
                  Trip #{activeTruck.trip_id || "—"} • <span className="capitalize">{activeTruck.trip_status || activeTruck.state}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-[#0071e3] dark:bg-blue-400/15 dark:text-[#2997ff]">
                <Radio size={10} className="animate-pulse" /> Live Telemetry
              </span>
            </div>

            {/* Assigned Driver */}
            <div className="rounded-xl bg-white dark:bg-[#161618] p-3 border border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#86868b]">
                <User size={12} /> Assigned Driver
              </div>
              {activeTruck.driver ? (
                <div className="grid grid-cols-1 gap-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#86868b]">Name:</span>
                    <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {activeTruck.driver.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#86868b]">Phone:</span>
                    <a
                      href={`tel:${activeTruck.driver.phone}`}
                      className="font-mono text-[#0071e3] hover:underline dark:text-[#2997ff] flex items-center gap-1"
                    >
                      <Phone size={10} />
                      {activeTruck.driver.phone || "—"}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#86868b]">License:</span>
                    <span className="font-mono text-[10px] bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-[#1d1d1f] dark:text-[#f5f5f7]">
                      {activeTruck.driver.license_number || "Verified"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#86868b]">No driver assigned to this trip.</p>
              )}
            </div>

            {/* Origin & Destination Corridor */}
            <div className="rounded-xl bg-white dark:bg-[#161618] p-3 border border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#86868b]">
                <span>Corridor</span>
                <span className="font-mono font-normal">
                  {activeTruck.total_distance_km ? `${activeTruck.total_distance_km} km` : "—"}
                </span>
              </div>
              <div className="flex items-start gap-2 pt-0.5">
                <div className="flex flex-col items-center mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-[#34c759]" />
                  <span className="h-4 w-0.5 bg-black/[0.1] dark:bg-white/[0.2]" />
                  <span className="h-2 w-2 rounded-full bg-[#ff3b30]" />
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <p className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                    {activeTruck.origin || "Pickup Hub"}
                  </p>
                  <p className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                    {activeTruck.destination || "Delivery Terminal"}
                  </p>
                </div>
              </div>
            </div>

            {/* Speedometer Gauge & Telemetry Status */}
            <SpeedometerGauge
              currentSpeed={activeTruck.speed_kmph ?? activeTruck.current_speed ?? 0}
              avgSpeed={activeTruck.avg_speed_kmph ?? activeTruck.average_speed_kmph ?? 45}
              maxSpeed={activeTruck.max_speed_kmph ?? 80}
              state={activeTruck.state || activeTruck.trip_status || "in_transit"}
              isSimulated={activeTruck.is_simulated ?? true}
            />

            {/* Live Model ETA & Remaining Distance */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white dark:bg-[#161618] p-2.5 border border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-1.5 text-[10px] text-[#86868b]">
                  <Clock size={11} /> Live Model ETA
                </div>
                <p className="mt-1 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                  {activeTruck.eta || "In Transit"}
                </p>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#161618] p-2.5 border border-black/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-1.5 text-[10px] text-[#86868b]">
                  <MapPin size={11} /> Remaining
                </div>
                <p className="mt-1 text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                  {activeTruck.distance_remaining_km != null ? `${activeTruck.distance_remaining_km} km` : "—"}
                </p>
              </div>
            </div>

            {/* Trip Progress Bar */}
            <div className="rounded-xl bg-white dark:bg-[#161618] p-3 border border-black/[0.06] dark:border-white/[0.08] space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#86868b]">Trip Progress:</span>
                <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  {activeTruck.progress_percentage != null ? `${activeTruck.progress_percentage}%` : "0%"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-[#0071e3] dark:bg-[#2997ff] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, activeTruck.progress_percentage || 0))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#86868b] pt-0.5">
                <span>{activeTruck.distance_travelled_km || 0} km travelled</span>
                <span>{activeTruck.distance_remaining_km || 0} km remaining</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Fleet Vehicles List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
              All Fleet Vehicles ({fleetList.length})
            </span>
            {selectedTruckId && (
              <button
                onClick={handleBackToOverview}
                className="text-[10px] text-[#0071e3] hover:underline dark:text-[#2997ff] font-medium"
              >
                Clear Selection
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
            {fleetList.length === 0 ? (
              <p className="text-xs text-[#86868b] py-2">No trucks with telemetry found.</p>
            ) : (
              fleetList.map((truck) => {
                const isSelected = selectedTruckId === truck.truck_id;
                const statusColor =
                  truck.state === "in_transit"
                    ? "bg-[#34c759] dark:bg-[#30d158]"
                    : truck.state === "completed"
                    ? "bg-[#0071e3] dark:bg-[#2997ff]"
                    : "bg-[#86868b]";

                return (
                  <button
                    key={truck.truck_id}
                    onClick={() => handleSelectTruck(truck.truck_id)}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-[#0071e3] bg-[#0071e3]/10 dark:border-[#2997ff] dark:bg-[#2997ff]/15"
                        : "border-black/[0.06] hover:border-black/[0.15] dark:border-white/[0.06] dark:hover:border-white/[0.15]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                          isSelected
                            ? "bg-[#0071e3] text-white dark:bg-[#2997ff] dark:text-black"
                            : "bg-black/[0.04] text-[#6e6e73] dark:bg-white/[0.08] dark:text-[#86868b]"
                        }`}
                      >
                        <Truck size={14} />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                          {truck.truck_registration || `Truck #${truck.truck_id}`}
                        </p>
                        <p className="text-[10px] text-[#86868b] truncate">
                          {truck.driver?.name ? `Driver: ${truck.driver.name}` : "Driver unassigned"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-[#86868b]">
                        {truck.state === "in_transit"
                          ? `${truck.progress_percentage}%`
                          : truck.state}
                      </span>
                      <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="apple-card p-3 text-xs text-[#86868b] space-y-1.5">
          <p className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] mb-1">Map Legend</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#34c759]" />
            <span>Pickup (P)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ff3b30]" />
            <span>Destination (D)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-4 rounded-full bg-[#0071e3] dark:bg-[#2997ff]" />
            <span>Travelled Road Corridor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-4 rounded-full bg-[#86868b] opacity-50" />
            <span>Remaining Road Corridor</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between text-xs text-[#86868b] pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (2.5s)
          </label>

          <button
            onClick={() => setShowKeyModal(true)}
            className="text-xs text-[#0071e3] hover:underline dark:text-[#2997ff]"
          >
            Configure Key
          </button>
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="relative min-h-[450px] flex-1 apple-card p-2 overflow-hidden flex flex-col">
        {/* Floating Map Mode Header */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-white/90 p-2 shadow-lg backdrop-blur-md border border-black/[0.08] dark:bg-[#1c1c1e]/90 dark:border-white/[0.1] text-xs">
            {selectedTruckId && activeTruck ? (
              <div className="flex items-center gap-2.5">
                <button
                  id="floating-back-to-overview-btn"
                  onClick={handleBackToOverview}
                  className="apple-btn-secondary py-1 px-2.5 text-[11px] flex items-center gap-1 rounded-lg"
                  title="Return to fleet overview (Esc)"
                >
                  <ChevronLeft size={12} />
                  <span>Fleet Overview</span>
                </button>
                <div className="h-3.5 w-[1px] bg-black/[0.1] dark:bg-white/[0.15]" />
                <div>
                  <span className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Selected Truck: {activeTruck.truck_registration || `Truck #${activeTruck.truck_id}`}
                  </span>
                  <span className="block text-[10px] text-[#86868b]">
                    {activeTruck.origin} → {activeTruck.destination}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#34c759] animate-pulse" />
                <span className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Fleet Overview ({fleetList.length} Vehicles Online)
                </span>
                <span className="text-[10px] text-[#86868b]">
                  Click any truck to isolate its route corridor
                </span>
              </div>
            )}
          </div>
        </div>

        {!apiKey ? (
          <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-black/[0.015] p-6 text-center dark:bg-white/[0.01]">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0071e3]/10 text-[#0071e3] mb-4 dark:bg-[#2997ff]/15 dark:text-[#2997ff]">
              <MapPin size={28} />
            </div>
            <h2 className="text-base font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Interactive Google Maps Surface
            </h2>
            <p className="mt-1.5 max-w-sm text-xs text-[#6e6e73] dark:text-[#86868b]">
              Provide your Google Maps API key to render vector polylines, breadcrumb GPS history, and turn-by-turn road geometry.
            </p>
            <button
              onClick={() => setShowKeyModal(true)}
              className="apple-btn-primary mt-5 text-xs"
            >
              Configure API Key
            </button>
          </div>
        ) : !isLoaded ? (
          <div className="flex h-full w-full items-center justify-center text-[#86868b]">
            <div className="text-center">
              <RefreshCw size={24} className="animate-spin mx-auto text-[#0071e3] dark:text-[#2997ff] mb-2" />
              <p className="text-xs">Loading Google Maps Engine...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <AlertTriangle size={32} className="text-red-500 mb-2" />
            <h4 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              Google Maps Loading Error
            </h4>
            <p className="text-xs text-red-500 mt-1 max-w-sm">
              {loadError.message || "Invalid Google Maps API Key or restricted permissions."}
            </p>
            <button
              onClick={() => setShowKeyModal(true)}
              className="mt-4 text-xs font-semibold text-[#0071e3] hover:underline dark:text-[#2997ff]"
            >
              Update API Key
            </button>
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={containerStyle}
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
                strictBounds: true,
              },
              minZoom: 4,
            }}
          />
        )}
      </div>

      {/* Telemetry Architecture Info Modal */}
      {showSimulationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#0071e3] dark:text-[#2997ff]" />
                <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Deterministic Telemetry Architecture
                </h3>
              </div>
              <button
                onClick={() => setShowSimulationModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 text-xs leading-relaxed text-[#6e6e73] dark:text-[#86868b] space-y-2">
              <p>
                Because real IoT hardware GPS trackers are not connected in this local environment, positions are calculated using a <strong>deterministic server-side time interpolation algorithm</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Route Alignment:</strong> Vehicle coordinates move strictly along the real road polyline computed by Google Routes / OSRM.
                </li>
                <li>
                  <strong>Time-Indexed:</strong> Elapsed time is calculated from the trip departure timestamp (<code className="bg-black/[0.05] dark:bg-white/[0.1] px-1 rounded">trip.start_time</code>) and server UTC clock.
                </li>
                <li>
                  <strong>Realistic Speed:</strong> Travel progresses at a heavy-commercial average speed of 45 km/h.
                </li>
                <li>
                  <strong>Progress & ETA:</strong> Automatically calculates remaining distance and estimated arrival time.
                </li>
              </ul>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowSimulationModal(false)}
                className="apple-btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md apple-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <h3 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                Google Maps API Key
              </h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mt-3 text-xs text-[#6e6e73] dark:text-[#86868b]">
              Enter your Google Maps JavaScript API key. It will be stored in your browser session.
            </p>

            <form onSubmit={handleSaveKey} className="mt-4">
              <input
                type="text"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="apple-input font-mono text-xs"
                required
              />

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="apple-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="apple-btn-primary text-xs"
                >
                  Save & Reload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
