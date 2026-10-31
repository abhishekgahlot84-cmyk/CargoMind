import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin,
  Loader2,
  Navigation,
  CheckCircle2,
  AlertCircle,
  Building2,
  Plane,
  Train,
  Anchor,
  Sparkles,
} from "lucide-react";
import api from "../services/api";

export default function PlaceAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search Indian city, town, airport/rail code (e.g. GWL, BOM, DEL, Morena)...",
  required = false,
  className = "",
  label = "",
}) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [isPopularList, setIsPopularList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSelected, setIsSelected] = useState(Boolean(value));
  const [errorMsg, setErrorMsg] = useState("");
  const [googleNotice, setGoogleNotice] = useState("");

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Sync external value
  useEffect(() => {
    setQuery(value || "");
    if (value) {
      setIsSelected(true);
    }
  }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cancel any active request on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Fetch locations from backend API with debouncing and cancellation
  const fetchLocations = useCallback(async (searchText) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await api.get("/locations/search", {
        params: { q: searchText, limit: 10 },
        signal: abortControllerRef.current.signal,
      });

      const data = res.data || {};
      const results = Array.isArray(data.results) ? data.results : [];
      setSuggestions(results);
      setIsPopularList(Boolean(data.is_popular_list));

      if (data.google_message && !data.google_available && results.length > 0) {
        setGoogleNotice("Verified Indian Gazetteer (offline fallback active)");
      } else {
        setGoogleNotice("");
      }

      setShowDropdown(true);
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }
      console.warn("Location search API failed:", err);
      setErrorMsg("Location service unavailable. Check network or server connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle keystrokes with 250ms debounce
  function handleInputChange(e) {
    const text = e.target.value;
    setQuery(text);
    setIsSelected(false);
    setErrorMsg("");
    setSelectedIndex(-1);

    if (onChange) {
      onChange(text);
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchLocations(text);
    }, 250);
  }

  // Focus handler: if empty, show popular freight hubs
  function handleFocus() {
    if (!query || query.trim().length <= 1) {
      fetchLocations(query || "");
    } else if (suggestions.length > 0) {
      setShowDropdown(true);
    }
  }

  // Keyboard navigation: Up, Down, Enter, Escape
  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        selectPlace(suggestions[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  // Select place and propagate verified coordinates
  async function selectPlace(item) {
    setLoading(true);
    setShowDropdown(false);
    setQuery(item.name);
    setIsSelected(true);
    setErrorMsg("");

    try {
      let finalLat = item.latitude;
      let finalLon = item.longitude;
      let finalAddress = item.full_address || `${item.name}, ${item.state}, India`;

      // If coordinates are missing (e.g. raw Google Place prediction), resolve via geocode proxy
      if ((finalLat == null || finalLon == null) && item.place_id) {
        try {
          const geoRes = await api.get("/locations/geocode", {
            params: { place_id: item.place_id },
          });
          if (geoRes.data?.latitude != null && geoRes.data?.longitude != null) {
            finalLat = geoRes.data.latitude;
            finalLon = geoRes.data.longitude;
            if (geoRes.data.formatted_address) {
              finalAddress = geoRes.data.formatted_address;
            }
          }
        } catch (geoErr) {
          console.warn("Place geocoding fallback error:", geoErr);
        }
      }

      if (finalLat == null || finalLon == null) {
        setErrorMsg(`Unable to resolve GPS coordinates for ${item.name}. Please select a verified city.`);
        setIsSelected(false);
        setLoading(false);
        return;
      }

      // Validate coordinates are inside India
      const latNum = Number(finalLat);
      const lonNum = Number(finalLon);
      if (latNum < 6.5 || latNum > 37.5 || lonNum < 68.0 || lonNum > 97.5) {
        setErrorMsg(`Selected location (${item.name}) is outside Indian territory. CargoMind operates exclusively within India.`);
        setIsSelected(false);
        setLoading(false);
        return;
      }

      const placePayload = {
        name: item.name,
        address: finalAddress,
        latitude: finalLat,
        longitude: finalLon,
        lat: finalLat,
        lon: finalLon,
        place_id: item.place_id || item.id,
        state: item.state,
      };

      if (onChange) {
        onChange(item.name);
      }
      if (onPlaceSelect) {
        onPlaceSelect(placePayload);
      }
    } catch (err) {
      console.error("Failed to select place:", err);
      setErrorMsg("Failed to select location. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Highlight matched substring
  function renderHighlightedText(text, highlight) {
    if (!highlight || !text) return text;
    const cleanHighlight = highlight.trim().toLowerCase();
    const index = text.toLowerCase().indexOf(cleanHighlight);
    if (index === -1) return text;

    return (
      <>
        {text.slice(0, index)}
        <strong className="text-[#0071e3] font-semibold underline decoration-[#0071e3]/30 dark:text-[#2997ff]">
          {text.slice(index, index + cleanHighlight.length)}
        </strong>
        {text.slice(index + cleanHighlight.length)}
      </>
    );
  }

  function getIconForType(hubType, isAlias) {
    if (isAlias) return <Navigation size={14} className="text-[#0071e3] dark:text-[#2997ff]" />;
    if (!hubType) return <MapPin size={14} className="text-[#86868b]" />;
    const ht = hubType.toLowerCase();
    if (ht.includes("port") || ht.includes("maritime")) return <Anchor size={14} className="text-[#0071e3] dark:text-[#2997ff]" />;
    if (ht.includes("airport")) return <Plane size={14} className="text-[#af52de] dark:text-[#bf5af2]" />;
    if (ht.includes("rail") || ht.includes("station")) return <Train size={14} className="text-[#ff9500] dark:text-[#ff9f0a]" />;
    if (ht.includes("metro") || ht.includes("capital")) return <Building2 size={14} className="text-[#34c759] dark:text-[#30d158]" />;
    return <MapPin size={14} className="text-[#86868b]" />;
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-medium text-[#1d1d1f] dark:text-[#f5f5f7] block mb-1">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {/* Absolutely positioned icon strictly at left: 12px; top: 50%; transform: translateY(-50%) */}
        <div
          className="pointer-events-none absolute z-10 flex items-center justify-center text-[#86868b]"
          style={{
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "20px",
            height: "20px",
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin text-[#0071e3] dark:text-[#2997ff]" />
          ) : (
            <MapPin
              size={16}
              className={isSelected ? "text-[#34c759] dark:text-[#30d158]" : "text-[#86868b]"}
            />
          )}
        </div>

        {/* Input box with paddingLeft of 44px (>= 40px) */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          style={{ paddingLeft: "44px" }}
          className={`apple-input apple-input-with-icon pr-9 text-xs w-full transition ${
            isSelected
              ? "border-[#34c759]/40 focus:border-[#34c759] focus:ring-[#34c759]/20"
              : ""
          }`}
        />

        {isSelected && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <CheckCircle2 size={15} className="text-[#34c759] dark:text-[#30d158]" />
          </div>
        )}
      </div>

      {/* Dropdown Suggestions with high z-index (z-[70]) */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1.5 max-h-72 w-full min-w-[280px] overflow-y-auto rounded-2xl border border-black/[0.08] bg-white/98 p-1.5 shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:border-white/[0.1] dark:bg-[#1c1c1e]/98 dark:ring-white/10">
          {/* Header indicator */}
          <div className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#86868b] border-b border-black/[0.04] dark:border-white/[0.04] mb-1">
            <span className="flex items-center gap-1.5">
              {isPopularList ? (
                <>
                  <Sparkles size={11} className="text-[#0071e3] dark:text-[#2997ff]" />
                  Popular Freight Metros &amp; Hubs
                </>
              ) : (
                `India Gazetteer (${suggestions.length} places)`
              )}
            </span>
            {googleNotice && (
              <span className="text-[9px] lowercase text-[#86868b]">
                {googleNotice}
              </span>
            )}
          </div>

          {suggestions.length === 0 ? (
            <div className="px-4 py-4 text-center text-xs text-[#86868b]">
              No locations found across India matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            suggestions.map((item, idx) => {
              const isHighlighted = selectedIndex === idx;
              const isAlias = item.source === "alias_registry";

              return (
                <button
                  type="button"
                  key={item.id || idx}
                  onMouseDown={() => selectPlace(item)}
                  className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition ${
                    isHighlighted
                      ? "bg-[#0071e3]/10 text-[#0071e3] dark:bg-[#2997ff]/15 dark:text-[#2997ff]"
                      : "hover:bg-black/[0.04] text-[#1d1d1f] dark:hover:bg-white/[0.06] dark:text-[#f5f5f7]"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {getIconForType(item.hub_type, isAlias)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="font-semibold truncate text-[#1d1d1f] dark:text-[#f5f5f7]">
                        {renderHighlightedText(item.name, isPopularList ? "" : query)}
                      </p>
                      {item.match_badge && (
                        <span className="apple-badge bg-[#0071e3]/10 text-[#0071e3] text-[9px] dark:bg-[#2997ff]/20 dark:text-[#2997ff] shrink-0 font-medium">
                          {item.match_badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#86868b] truncate mt-0.5">
                      {item.state ? `${item.state}, India` : item.full_address}
                      {item.hub_type ? ` • ${item.hub_type}` : ""}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {errorMsg && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertCircle size={12} /> {errorMsg}
        </p>
      )}
    </div>
  );
}
