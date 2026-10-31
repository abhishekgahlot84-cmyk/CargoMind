import os
import math
import requests
from typing import Optional, Dict, Any, Tuple
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

# In-memory cache for computed distances and travel durations
# Key: normalized tuple of coordinates or place IDs -> Dict with distance_km, duration_minutes, polyline, source
_DISTANCE_CACHE: Dict[Tuple, Dict[str, Any]] = {}


def get_google_maps_api_key() -> Optional[str]:
    """Retrieve Google Maps / Routes API key from environment variables."""
    key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_ROUTES_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def is_google_routes_configured() -> bool:
    """Return True if a server-side Google API key is configured."""
    return get_google_maps_api_key() is not None


def compute_route_distance(
    origin_lat: Optional[float] = None,
    origin_lon: Optional[float] = None,
    origin_place_id: Optional[str] = None,
    dest_lat: Optional[float] = None,
    dest_lon: Optional[float] = None,
    dest_place_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate real driving road distance (km), estimated duration (minutes),
    and route geometry via Google Routes API (v2), with fallback to OSRM.
    Never returns hardcoded 0 or 100.
    Raises HTTPException if distance cannot be computed.
    """
    # 1. Validation
    has_origin_coords = (
        origin_lat is not None and origin_lon is not None and
        -90 <= origin_lat <= 90 and -180 <= origin_lon <= 180
    )
    has_dest_coords = (
        dest_lat is not None and dest_lon is not None and
        -90 <= dest_lat <= 90 and -180 <= dest_lon <= 180
    )
    has_origin_place = bool(origin_place_id and str(origin_place_id).strip())
    has_dest_place = bool(dest_place_id and str(dest_place_id).strip())

    if not ((has_origin_coords or has_origin_place) and (has_dest_coords or has_dest_place)):
        raise HTTPException(
            status_code=400,
            detail="Valid origin and destination coordinates or place IDs must be provided."
        )

    # 2. Check Cache
    cache_key = (
        round(origin_lat, 4) if origin_lat is not None else origin_place_id,
        round(origin_lon, 4) if origin_lon is not None else None,
        round(dest_lat, 4) if dest_lat is not None else dest_place_id,
        round(dest_lon, 4) if dest_lon is not None else None,
    )
    if cache_key in _DISTANCE_CACHE:
        cached = _DISTANCE_CACHE[cache_key].copy()
        cached["cached"] = True
        return cached

    # 3. Attempt Google Routes API (Directions v2)
    api_key = get_google_maps_api_key()
    google_error = None

    if api_key:
        try:
            # Build origin spec
            if has_origin_place and not has_origin_coords:
                origin_spec = {"placeId": origin_place_id}
            else:
                origin_spec = {"location": {"latLng": {"latitude": float(origin_lat), "longitude": float(origin_lon)}}}

            # Build destination spec
            if has_dest_place and not has_dest_coords:
                dest_spec = {"placeId": dest_place_id}
            else:
                dest_spec = {"location": {"latLng": {"latitude": float(dest_lat), "longitude": float(dest_lon)}}}

            url = "https://routes.googleapis.com/directions/v2:computeRoutes"
            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            }
            payload = {
                "origin": origin_spec,
                "destination": dest_spec,
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_UNAWARE",
            }

            resp = requests.post(url, headers=headers, json=payload, timeout=12)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes", [])
                if routes:
                    r = routes[0]
                    dist_meters = float(r.get("distanceMeters", 0))
                    duration_str = r.get("duration", "0s").rstrip("s")
                    duration_sec = float(duration_str) if duration_str else 0.0

                    distance_km = round(dist_meters / 1000.0, 1)
                    duration_minutes = round(duration_sec / 60.0, 1)
                    encoded_polyline = r.get("polyline", {}).get("encodedPolyline", "")

                    if distance_km > 0:
                        res = {
                            "distance_km": distance_km,
                            "duration_minutes": duration_minutes,
                            "estimated_travel_hours": round(duration_minutes / 60.0, 2),
                            "encoded_polyline": encoded_polyline,
                            "source": "google_routes",
                            "status": "success",
                        }
                        _DISTANCE_CACHE[cache_key] = res
                        return res
            else:
                google_error = f"Google Routes HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as e:
            google_error = str(e)

    # 4. Fallback to OSRM Driving Engine if coords are available
    if has_origin_coords and has_dest_coords:
        try:
            from app.optimization.road_route import get_road_route
            osrm_res = get_road_route(origin_lat, origin_lon, dest_lat, dest_lon)
            if osrm_res and osrm_res.get("distance_km", 0) > 0:
                dist_km = round(float(osrm_res["distance_km"]), 1)
                dur_mins = round(float(osrm_res.get("duration_minutes", dist_km / 50.0 * 60)), 1)
                res = {
                    "distance_km": dist_km,
                    "duration_minutes": dur_mins,
                    "estimated_travel_hours": round(dur_mins / 60.0, 2),
                    "coordinates": osrm_res.get("coordinates", []),
                    "source": "osrm_fallback",
                    "status": "success",
                }
                _DISTANCE_CACHE[cache_key] = res
                return res
        except Exception as osrm_err:
            raise HTTPException(
                status_code=502,
                detail=f"Distance calculation failed. Google Routes: {google_error or 'unavailable'}; OSRM: {str(osrm_err)}. Please verify locations."
            )

    # 5. If neither worked
    raise HTTPException(
        status_code=502,
        detail=f"Unable to compute driving distance between the specified locations ({google_error or 'missing valid coordinates'})."
    )
