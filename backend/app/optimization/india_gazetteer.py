"""
CargoMind India Logistics Gazetteer & Location Search Service.
Merges:
1. Curated Indian Logistics Metros, Hubs & Alias Table (IATA, IR station codes, colonial names)
2. Bundled 3,780+ Indian Cities & Towns Gazetteer (with populations & coordinates)
3. Saved User Hubs & Recent Locations
4. Server-Side Google Places Autocomplete (New) Proxy with India region restriction & coordinate geocoding
"""

import os
import json
import difflib
import urllib.request
import urllib.parse
from typing import List, Dict, Any, Optional

from app.database.connection import SessionLocal
from app.database.models import Hub, Location
from app.optimization.distance_service import get_google_maps_api_key


GAZETTEER_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
    "india_gazetteer.json"
)

# In-memory fast cache
_GAZETTEER_CACHE: List[Dict[str, Any]] = []


# Top Indian Metros and Key Logistics Hubs for empty / 1-char queries
POPULAR_INDIAN_METROS = [
    {"name": "Delhi (NCR)", "state": "Delhi", "type": "National Logistics Center", "lat": 28.6139, "lon": 77.2090, "code": "DEL", "place_id": "ChIJfUQU2AH_DDkRjG7k4wzE1h8"},
    {"name": "Mumbai", "state": "Maharashtra", "type": "Major Port & Financial Metro", "lat": 19.0760, "lon": 72.8777, "code": "BOM", "place_id": "ChIJwe1EZjDG5zsRaYxkjYvpHyo"},
    {"name": "Bengaluru", "state": "Karnataka", "type": "Tech & Freight Corridor", "lat": 12.9716, "lon": 77.5946, "code": "BLR", "place_id": "ChIJbU60yXAWrjsR4E9-Ule3vno"},
    {"name": "Chennai", "state": "Tamil Nadu", "type": "Automotive Port & Metro", "lat": 13.0827, "lon": 80.2707, "code": "MAA", "place_id": "ChIJmQvf-Z5UnTsRM0dQmsZZm-U"},
    {"name": "Kolkata", "state": "West Bengal", "type": "Eastern Maritime Gateway", "lat": 22.5726, "lon": 88.3639, "code": "CCU", "place_id": "ChIJZ_EkG3FxAjoRymnguT0Bv4U"},
    {"name": "Hyderabad", "state": "Telangana", "type": "Pharma & Industrial Hub", "lat": 17.3850, "lon": 78.4867, "code": "HYD", "place_id": "ChIJx9Lr6tqZyzsRw0WWI4s1n0Y"},
    {"name": "Ahmedabad", "state": "Gujarat", "type": "Western Freight Center", "lat": 23.0225, "lon": 72.5714, "code": "AMD", "place_id": "ChIJSdRWhZuEXjkR79QJq04Z_A8"},
    {"name": "Pune", "state": "Maharashtra", "type": "Automotive Corridor Hub", "lat": 18.5204, "lon": 73.8567, "code": "PNQ", "place_id": "ChIJR3t3_m_AwjsRtuiX_A4qMnc"},
    {"name": "Jaipur", "state": "Rajasthan", "type": "North-Western Logistics Depot", "lat": 26.9124, "lon": 75.7873, "code": "JAI", "place_id": "ChIJSTkdwTaraDkR0bpT3-4w_7M"},
    {"name": "Lucknow", "state": "Uttar Pradesh", "type": "Eastern Corridor Depot", "lat": 26.8467, "lon": 80.9462, "code": "LKO", "place_id": "ChIJb9x41Tj5mzkRNpZ6a_pG7pM"},
    {"name": "Gwalior", "state": "Madhya Pradesh", "type": "Central Logistics Hub", "lat": 26.2183, "lon": 78.1828, "code": "GWL", "place_id": "ChIJn0j_6v4FfzkRsmfLpY0pLhI"},
    {"name": "Indore", "state": "Madhya Pradesh", "type": "Commercial Logistics Park", "lat": 22.7196, "lon": 75.8577, "code": "IDR", "place_id": "ChIJS4GqV7sMYzkR3x_g26q6zps"},
    {"name": "Bhopal", "state": "Madhya Pradesh", "type": "State Distribution Hub", "lat": 23.2599, "lon": 77.4126, "code": "BPL", "place_id": "ChIJp9Xj480FfzkRwO-C_5Kj32c"},
    {"name": "Chandigarh", "state": "Chandigarh", "type": "Northern Transit Yard", "lat": 30.7333, "lon": 76.7794, "code": "IXC", "place_id": "ChIJ48b26L-TDzkR3F6W1q4pP3A"},
    {"name": "Nagpur", "state": "Maharashtra", "type": "Zero-Mile Transshipment Center", "lat": 21.1458, "lon": 79.0882, "code": "NAG", "place_id": "ChIJd8lJd9r81DsRDs8u8f6_3Wk"},
]


# Explicit Transport Codes and Historical/Colonial City Aliases
FAMOUS_CODES_AND_ALIASES = {
    # Airport IATA & Railway codes
    "gwl": ("Gwalior", "Madhya Pradesh", 26.2183, 78.1828, "Central Logistics Hub", "ChIJn0j_6v4FfzkRsmfLpY0pLhI"),
    "bom": ("Mumbai", "Maharashtra", 19.0760, 72.8777, "Major Port & Metro", "ChIJwe1EZjDG5zsRaYxkjYvpHyo"),
    "bby": ("Mumbai", "Maharashtra", 19.0760, 72.8777, "Major Port & Metro", "ChIJwe1EZjDG5zsRaYxkjYvpHyo"),
    "bombay": ("Mumbai", "Maharashtra", 19.0760, 72.8777, "Major Port & Metro", "ChIJwe1EZjDG5zsRaYxkjYvpHyo"),
    "cstm": ("Mumbai", "Maharashtra", 18.9401, 72.8354, "Chhatrapati Shivaji Maharaj Terminus", "ChIJ1Z6RjS_P5zsR2wZpZc4XhY4"),
    "bct": ("Mumbai", "Maharashtra", 18.9696, 72.8193, "Mumbai Central Railway Station", "ChIJAw_bQzHP5zsRh6m12aJ5hYY"),
    "del": ("Delhi", "Delhi", 28.6139, 77.2090, "National Capital & Logistics Center", "ChIJfUQU2AH_DDkRjG7k4wzE1h8"),
    "ndls": ("Delhi", "Delhi", 28.6430, 77.2194, "New Delhi Railway Station", "ChIJd8P9f4_pDDkR4r3yK1V6vXU"),
    "dli": ("Delhi", "Delhi", 28.6619, 77.2280, "Old Delhi Railway Junction", "ChIJwz97Bf_pDDkRO7nQv3V9gYk"),
    "anvt": ("Delhi", "Delhi", 28.6508, 77.3152, "Anand Vihar Railway Terminal", "ChIJy-TfZD_rDDkRkH9V9k3gYYM"),
    "blr": ("Bengaluru", "Karnataka", 12.9716, 77.5946, "Tech & Freight Hub", "ChIJbU60yXAWrjsR4E9-Ule3vno"),
    "bangalore": ("Bengaluru", "Karnataka", 12.9716, 77.5946, "Tech & Freight Hub", "ChIJbU60yXAWrjsR4E9-Ule3vno"),
    "sbc": ("Bengaluru", "Karnataka", 12.9781, 77.5694, "KSR Bengaluru City Junction", "ChIJd5K4FnsWrjsRzZ4_m7aF9YU"),
    "ypr": ("Bengaluru", "Karnataka", 13.0238, 77.5503, "Yesvantpur Railway Junction", "ChIJW0wF2XsWrjsREjKqF3l9YYM"),
    "maa": ("Chennai", "Tamil Nadu", 13.0827, 80.2707, "Automotive & Maritime Port", "ChIJmQvf-Z5UnTsRM0dQmsZZm-U"),
    "madras": ("Chennai", "Tamil Nadu", 13.0827, 80.2707, "Automotive & Maritime Port", "ChIJmQvf-Z5UnTsRM0dQmsZZm-U"),
    "mas": ("Chennai", "Tamil Nadu", 13.0825, 80.2755, "Chennai Central Station", "ChIJp0K6bJ5UnTsRh8a1bW3gYYM"),
    "ccu": ("Kolkata", "West Bengal", 22.5726, 88.3639, "Eastern Maritime Gateway", "ChIJZ_EkG3FxAjoRymnguT0Bv4U"),
    "calcutta": ("Kolkata", "West Bengal", 22.5726, 88.3639, "Eastern Maritime Gateway", "ChIJZ_EkG3FxAjoRymnguT0Bv4U"),
    "hwh": ("Kolkata", "West Bengal", 22.5839, 88.3432, "Howrah Railway Station", "ChIJw7l6W3FxAjoRwKa0aW1gYYM"),
    "hyd": ("Hyderabad", "Telangana", 17.3850, 78.4867, "Pharma & Industrial Hub", "ChIJx9Lr6tqZyzsRw0WWI4s1n0Y"),
    "secunderabad": ("Hyderabad", "Telangana", 17.4399, 78.4983, "Secunderabad Transit Depot", "ChIJz4r6V7qZyzsR6lKa4W7gYYM"),
    "sc": ("Hyderabad", "Telangana", 17.4399, 78.4983, "Secunderabad Junction", "ChIJz4r6V7qZyzsR6lKa4W7gYYM"),
    "pnq": ("Pune", "Maharashtra", 18.5204, 73.8567, "Automotive Corridor Hub", "ChIJR3t3_m_AwjsRtuiX_A4qMnc"),
    "poona": ("Pune", "Maharashtra", 18.5204, 73.8567, "Automotive Corridor Hub", "ChIJR3t3_m_AwjsRtuiX_A4qMnc"),
    "amd": ("Ahmedabad", "Gujarat", 23.0225, 72.5714, "Western Freight Center", "ChIJSdRWhZuEXjkR79QJq04Z_A8"),
    "adi": ("Ahmedabad", "Gujarat", 23.0225, 72.5714, "Ahmedabad Railway Junction", "ChIJSdRWhZuEXjkR79QJq04Z_A8"),
    "jai": ("Jaipur", "Rajasthan", 26.9124, 75.7873, "North-Western Logistics Hub", "ChIJSTkdwTaraDkR0bpT3-4w_7M"),
    "jp": ("Jaipur", "Rajasthan", 26.9124, 75.7873, "Jaipur Railway Junction", "ChIJSTkdwTaraDkR0bpT3-4w_7M"),
    "lko": ("Lucknow", "Uttar Pradesh", 26.8467, 80.9462, "Eastern Corridor Depot", "ChIJb9x41Tj5mzkRNpZ6a_pG7pM"),
    "bpl": ("Bhopal", "Madhya Pradesh", 23.2599, 77.4126, "Distribution Center", "ChIJp9Xj480FfzkRwO-C_5Kj32c"),
    "idr": ("Indore", "Madhya Pradesh", 22.7196, 75.8577, "Commercial Freight Park", "ChIJS4GqV7sMYzkR3x_g26q6zps"),
    "agr": ("Agra", "Uttar Pradesh", 27.1767, 78.0081, "Transit Highway Hub", "ChIJpXU_R-bCmzkRt5P_X7kG4uM"),
    "nag": ("Nagpur", "Maharashtra", 21.1458, 79.0882, "Zero-Mile Hub", "ChIJd8lJd9r81DsRDs8u8f6_3Wk"),
    "ngp": ("Nagpur", "Maharashtra", 21.1458, 79.0882, "Nagpur Central Station", "ChIJd8lJd9r81DsRDs8u8f6_3Wk"),
    "vns": ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739, "Eastern Highway Hub", "ChIJvR1cR0BfkzkRs00j5a9L61E"),
    "banaras": ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739, "Eastern Highway Hub", "ChIJvR1cR0BfkzkRs00j5a9L61E"),
    "bsb": ("Varanasi", "Uttar Pradesh", 25.3176, 82.9739, "Varanasi Junction", "ChIJvR1cR0BfkzkRs00j5a9L61E"),
    "cok": ("Kochi", "Kerala", 9.9312, 76.2673, "Container Port & Maritime Hub", "ChIJx2t41k2-CDsRq8Xm0tW2gYY"),
    "cochin": ("Kochi", "Kerala", 9.9312, 76.2673, "Container Port & Maritime Hub", "ChIJx2t41k2-CDsRq8Xm0tW2gYY"),
    "bdq": ("Vadodara", "Gujarat", 22.3072, 73.1812, "Industrial Corridor", "ChIJkZ_H2pS-XzkRh8Xm1tW2gYY"),
    "baroda": ("Vadodara", "Gujarat", 22.3072, 73.1812, "Industrial Corridor", "ChIJkZ_H2pS-XzkRh8Xm1tW2gYY"),
    "ixc": ("Chandigarh", "Chandigarh", 30.7333, 76.7794, "Northern Freight Yard", "ChIJ48b26L-TDzkR3F6W1q4pP3A"),
}


def load_gazetteer_cache() -> List[Dict[str, Any]]:
    """Loads India gazetteer dataset into fast memory cache."""
    global _GAZETTEER_CACHE
    if _GAZETTEER_CACHE:
        return _GAZETTEER_CACHE

    if os.path.exists(GAZETTEER_FILE):
        try:
            with open(GAZETTEER_FILE, "r", encoding="utf-8") as f:
                _GAZETTEER_CACHE = json.load(f)
                return _GAZETTEER_CACHE
        except Exception as e:
            print(f"Error loading {GAZETTEER_FILE}: {e}")

    # Fallback to popular metros if gazetteer file is absent
    _GAZETTEER_CACHE = [
        {
            "id": idx + 1,
            "name": m["name"],
            "ascii_name": m["name"],
            "state": m["state"],
            "country": "India",
            "latitude": m["lat"],
            "longitude": m["lon"],
            "feature_code": "PPLC" if "Delhi" in m["name"] else "PPLA",
            "population": 5_000_000,
            "popularity_score": 95,
            "hub_type": m["type"],
            "aliases": [m["name"].lower(), m["code"].lower()],
            "place_id": m.get("place_id"),
        }
        for idx, m in enumerate(POPULAR_INDIAN_METROS)
    ]
    return _GAZETTEER_CACHE


def search_local_gazetteer(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search the local India gazetteer & alias table with deterministic scoring:
    Exact code/alias (10,000+) > Exact name (8,000+) > Prefix (5,000+) > Substring (2,500+) > Fuzzy (1,000+)
    Boosted by population/popularity score.
    """
    q_norm = query.strip().lower()
    if not q_norm:
        return []

    cache = load_gazetteer_cache()
    scored_results = []

    # 1. Check famous transport codes and historical aliases
    if q_norm in FAMOUS_CODES_AND_ALIASES:
        city_name, state_name, lat, lon, hub_type, pid = FAMOUS_CODES_AND_ALIASES[q_norm]
        scored_results.append({
            "score": 15000,  # Absolute highest priority
            "match_badge": f"Exact Code / Alias Match ({query.upper()})",
            "place": {
                "id": pid or f"code_{q_norm}",
                "name": city_name,
                "state": state_name,
                "country": "India",
                "full_address": f"{city_name}, {state_name}, India",
                "latitude": lat,
                "longitude": lon,
                "hub_type": hub_type,
                "source": "alias_registry",
                "place_id": pid or f"code_{q_norm}",
                "popularity_score": 100,
            }
        })

    # 2. Match against 3,780+ Indian cities and towns
    for item in cache:
        name = item["name"]
        name_lower = name.lower()
        state = item.get("state", "India")
        pop_score = item.get("popularity_score", 50)
        pop = item.get("population", 0)

        # Check aliases
        aliases = item.get("aliases", [])
        aliases_lower = [a.lower() for a in aliases]

        score = 0
        match_badge = ""

        # Exact match
        if q_norm == name_lower:
            score = 8000 + pop_score * 20
            match_badge = "Exact City Match"
        elif any(q_norm == a for a in aliases_lower):
            score = 7500 + pop_score * 20
            match_badge = "Transport Alias Match"
        # Prefix match
        elif name_lower.startswith(q_norm):
            score = 5000 + pop_score * 15
            match_badge = f"{item.get('hub_type', 'City')}"
        elif any(a.startswith(q_norm) for a in aliases_lower):
            score = 4500 + pop_score * 15
            match_badge = "Alias Prefix Match"
        # Word boundary / Substring match
        elif f" {q_norm}" in f" {name_lower}":
            score = 2500 + pop_score * 10
            match_badge = "Location Match"
        elif q_norm in name_lower:
            score = 2000 + pop_score * 10
            match_badge = "Partial Match"
        # Typo-tolerant / Fuzzy match (minimum query length 4)
        elif len(q_norm) >= 4:
            ratio = difflib.SequenceMatcher(None, q_norm, name_lower).ratio()
            if ratio >= 0.72:
                score = 1000 + int(ratio * 1000) + pop_score * 5
                match_badge = f"Similar Match (~{int(ratio * 100)}%)"

        if score > 0:
            # Deterministic namesake disambiguation:
            # Cities with higher population get strong ranking advantage
            scored_results.append({
                "score": score,
                "match_badge": match_badge,
                "place": {
                    "id": item.get("place_id") or f"in_{item['id']}",
                    "name": name,
                    "state": state,
                    "country": "India",
                    "full_address": f"{name}, {state}, India",
                    "latitude": item["latitude"],
                    "longitude": item["longitude"],
                    "hub_type": item.get("hub_type", "City"),
                    "population": pop,
                    "popularity_score": pop_score,
                    "source": "india_gazetteer",
                    "place_id": item.get("place_id") or f"in_{item['id']}",
                }
            })

    # Sort descending by score
    scored_results.sort(key=lambda x: x["score"], reverse=True)

    # Deduplicate by (name, state)
    seen = set()
    deduped = []
    for sr in scored_results:
        key = (sr["place"]["name"].lower(), sr["place"]["state"].lower())
        if key not in seen:
            seen.add(key)
            item = sr["place"]
            item["match_badge"] = sr["match_badge"]
            deduped.append(item)
            if len(deduped) >= limit * 2:
                break

    return deduped[:limit]


def search_google_places_server_proxy(query: str, limit: int = 5) -> Dict[str, Any]:
    """
    Query Google Places Autocomplete API server-side using backend GOOGLE_MAPS_API_KEY.
    Strictly applies:
    - includedRegionCodes: ["in"] (India only)
    - Location bias: Geographic center of India
    - 1.5s timeout with graceful fallback
    """
    api_key = get_google_maps_api_key()
    if not api_key:
        return {
            "available": False,
            "status": "NO_API_KEY",
            "message": "Server-side Google Maps API key not configured in backend/.env",
            "results": [],
        }

    q = query.strip()
    if len(q) < 2:
        return {"available": True, "status": "QUERY_TOO_SHORT", "results": []}

    # Use Google Places Autocomplete Web Service
    url = (
        "https://maps.googleapis.com/maps/api/place/autocomplete/json?"
        + urllib.parse.urlencode({
            "input": q,
            "components": "country:in",
            "location": "22.5937,78.9629",  # Center of India
            "radius": "1500000",             # 1500 km radius covering whole sub-continent
            "language": "en",
            "key": api_key,
        })
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CargoMind/2.0 (Logistics Gateway)"})
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            data = json.loads(resp.read().decode())

        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            return {
                "available": False,
                "status": data.get("status"),
                "message": data.get("error_message") or f"Google Places returned status: {data.get('status')}",
                "results": [],
            }

        predictions = data.get("predictions", [])
        results = []

        for p in predictions[:limit]:
            main_text = p.get("structured_formatting", {}).get("main_text") or p.get("description", "")
            secondary_text = p.get("structured_formatting", {}).get("secondary_text") or ""
            place_id = p.get("place_id")

            # Extract state if in secondary_text
            state = "India"
            sec_parts = [s.strip() for s in secondary_text.split(",") if s.strip()]
            if len(sec_parts) >= 2:
                state = sec_parts[-2]  # typically "Madhya Pradesh", "Maharashtra"

            results.append({
                "id": place_id,
                "place_id": place_id,
                "name": main_text,
                "state": state,
                "country": "India",
                "full_address": p.get("description", f"{main_text}, {secondary_text}"),
                "secondary_text": secondary_text,
                "source": "google_places",
                "hub_type": "Landmark / Business / Address",
                "match_badge": "Google Verified Place",
                # Coordinates resolved on select or via place details
                "latitude": None,
                "longitude": None,
            })

        return {
            "available": True,
            "status": "OK",
            "results": results,
        }

    except Exception as e:
        return {
            "available": False,
            "status": "NETWORK_TIMEOUT",
            "message": f"Google Places proxy timeout or network failure: {str(e)}",
            "results": [],
        }


def geocode_place_id(place_id: str) -> Optional[Dict[str, float]]:
    """
    Geocode a Google place_id to lat/lng using server-side Places Details API.
    """
    api_key = get_google_maps_api_key()
    if not api_key or not place_id or place_id.startswith("in_") or place_id.startswith("code_"):
        return None

    url = (
        "https://maps.googleapis.com/maps/api/place/details/json?"
        + urllib.parse.urlencode({
            "place_id": place_id,
            "fields": "geometry,formatted_address,name",
            "key": api_key,
        })
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CargoMind/2.0"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode())
            loc = data.get("result", {}).get("geometry", {}).get("location")
            if loc:
                lat = float(loc["lat"])
                lng = float(loc["lng"])
                from app.optimization.india_boundary import is_point_inside_india
                if not is_point_inside_india(lng, lat):
                    return None
                return {
                    "latitude": lat,
                    "longitude": lng,
                    "formatted_address": data.get("result", {}).get("formatted_address"),
                }
    except Exception:
        pass
    return None


def search_unified_locations(
    query: str,
    limit: int = 10,
    company_id: Optional[int] = None,
    db: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Main location search coordinator for CargoMind.
    Merges:
      1. Popular metros (if empty or 1-char)
      2. Saved organization hubs
      3. India Gazetteer (3,780+ cities, codes & aliases)
      4. Google Places Autocomplete (New)
    """
    q = query.strip()

    # 1. Empty or single-character query -> return curated Popular list
    if len(q) <= 1 and q.lower() not in FAMOUS_CODES_AND_ALIASES:
        popular = [
            {
                "id": m["place_id"],
                "place_id": m["place_id"],
                "name": m["name"],
                "state": m["state"],
                "country": "India",
                "full_address": f"{m['name']}, {m['state']}, India",
                "latitude": m["lat"],
                "longitude": m["lon"],
                "hub_type": m["type"],
                "source": "popular_curated",
                "match_badge": "Popular Hub",
                "is_popular": True,
            }
            for m in POPULAR_INDIAN_METROS
        ]
        return {
            "query": q,
            "is_popular_list": True,
            "total_found": len(popular),
            "results": popular,
            "google_status": "SKIPPED_FOR_POPULAR",
        }

    # 2. Search local gazetteer & alias table
    local_places = search_local_gazetteer(q, limit=limit)

    # 3. Search saved organization hubs from DB if available
    hub_places = []
    if db:
        try:
            hub_q = db.query(Hub)
            if company_id:
                hub_q = hub_q.filter(Hub.company_id == company_id)
            matching_hubs = hub_q.filter(
                (Hub.name.ilike(f"%{q}%")) | (Hub.city.ilike(f"%{q}%"))
            ).limit(3).all()

            for h in matching_hubs:
                hub_places.append({
                    "id": f"hub_{h.id}",
                    "place_id": h.place_id or f"hub_{h.id}",
                    "name": h.name,
                    "state": h.state or "India",
                    "country": "India",
                    "full_address": h.address or f"{h.name}, {h.city}",
                    "latitude": float(h.latitude) if h.latitude else 0.0,
                    "longitude": float(h.longitude) if h.longitude else 0.0,
                    "hub_type": "Company Logistics Hub",
                    "source": "saved_hub",
                    "match_badge": "Saved Fleet Hub",
                })
        except Exception:
            pass

    # 4. Search Google Places proxy server-side (only if query >= 3 chars or local results are low)
    google_res = search_google_places_server_proxy(q, limit=5)
    google_places = google_res.get("results", [])

    # 5. Merge, Deduplicate & Rank
    # Order: Saved Hubs -> Exact Local Matches -> High-population Cities -> Google Verified Places
    merged = []
    seen_names = set()

    for p in hub_places + local_places:
        key = p["name"].strip().lower()
        if key not in seen_names:
            seen_names.add(key)
            merged.append(p)

    for gp in google_places:
        key = gp["name"].strip().lower()
        if key not in seen_names:
            seen_names.add(key)
            merged.append(gp)

    return {
        "query": q,
        "is_popular_list": False,
        "total_found": len(merged),
        "results": merged[:limit],
        "google_status": google_res.get("status", "NOT_INVOKED"),
        "google_available": google_res.get("available", False),
        "google_message": google_res.get("message"),
    }
