"""
Server-side Road Routing Service for CargoMind.
Primary Engine: Google Routes API v2 (ComputeRoutes with regionCode="IN").
Fallback Engine: Open Road Routing (HTTP OSRM) with Siliguri corridor routing.
Guarantees that all computed route polylines follow actual paved highways,
are strictly constrained within Indian national borders, and pass Survey of India
boundary validation before being stored or dispatched.
NEVER falls back to straight lines.
"""

import math
import os
import requests
from fastapi import HTTPException
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

from app.optimization.india_boundary import (
    is_point_inside_india,
    validate_polyline_inside_india,
)

load_dotenv()

GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
SILIGURI_CORRIDOR_WAYPOINT = {"lat": 26.7271, "lng": 88.4283}
NH27_BIHAR_WAYPOINT = {"lat": 25.7796, "lng": 87.4753}  # Purnia / NH-27 corridor south of Nepal


def get_google_maps_api_key() -> str:
    """Retrieve Google Maps API key from environment."""
    key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    if not key:
        load_dotenv()
        key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    return key


def decode_google_polyline(encoded: str) -> List[List[float]]:
    """
    Decodes a Google encoded polyline string into a list of GeoJSON [lon, lat] coordinates.
    Zero external dependencies, fast and deterministic.
    """
    if not encoded:
        return []

    index, lat, lng = 0, 0, 0
    coordinates: List[List[float]] = []
    length = len(encoded)

    while index < length:
        # Decode Latitude
        b, shift, result = 0, 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Decode Longitude
        b, shift, result = 0, 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        # Store as [longitude, latitude] following GeoJSON convention
        coordinates.append([round(lng * 1e-5, 6), round(lat * 1e-5, 6)])

    return coordinates


def _request_google_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    api_key: str,
    via_waypoints: Optional[List[Dict[str, float]]] = None,
    via_waypoint: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Helper to call Google Routes API ComputeRoutes v2 with regionCode='IN'."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    }

    payload: Dict[str, Any] = {
        "origin": {
            "location": {"latLng": {"latitude": start_lat, "longitude": start_lon}}
        },
        "destination": {
            "location": {"latLng": {"latitude": end_lat, "longitude": end_lon}}
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "regionCode": "IN",
    }

    wps = via_waypoints or ([via_waypoint] if via_waypoint else [])
    if wps:
        payload["intermediates"] = [
            {
                "location": {
                    "latLng": {
                        "latitude": wp["lat"],
                        "longitude": wp["lng"],
                    }
                }
            }
            for wp in wps
        ]

    response = requests.post(GOOGLE_ROUTES_URL, headers=headers, json=payload, timeout=15)
    data = response.json()

    if response.status_code != 200 or "routes" not in data or not data["routes"]:
        err_msg = data.get("error", {}).get("message") or response.text or "Unknown Google Routes error"
        raise RuntimeError(f"Google Routes API: {err_msg}")

    route = data["routes"][0]
    distance_meters = route.get("distanceMeters", 0)
    duration_str = route.get("duration", "0s")

    try:
        duration_seconds = float(duration_str.rstrip("s"))
    except ValueError:
        duration_seconds = 0.0

    encoded_polyline = route.get("polyline", {}).get("encodedPolyline", "")
    if not encoded_polyline:
        raise RuntimeError("Google Routes returned an empty road polyline.")

    coordinates = decode_google_polyline(encoded_polyline)
    if not coordinates:
        raise RuntimeError("Failed to decode highway geometry from Google Routes API.")

    duration_min = round(duration_seconds / 60.0, 1)
    return {
        "distance_km": round(distance_meters / 1000.0, 2),
        "duration_minutes": duration_min,
        "duration_hours": round(duration_min / 60.0, 2),
        "coordinates": coordinates,
        "provider": "google_routes_v2",
    }


def _request_osrm_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    via_waypoints: Optional[List[Dict[str, float]]] = None,
    via_waypoint: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """Fallback road routing engine using OSRM HTTP endpoint."""
    wps = via_waypoints or ([via_waypoint] if via_waypoint else [])
    if wps:
        via_str = ";".join(f"{wp['lng']},{wp['lat']}" for wp in wps)
        url = (
            f"http://router.project-osrm.org/route/v1/driving/"
            f"{start_lon},{start_lat};{via_str};{end_lon},{end_lat}"
            f"?overview=full&geometries=geojson&steps=false"
        )
    else:
        url = (
            f"http://router.project-osrm.org/route/v1/driving/"
            f"{start_lon},{start_lat};{end_lon},{end_lat}"
            f"?overview=full&geometries=geojson&steps=false"
        )

    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise RuntimeError(f"OSRM routing failed: {data.get('code')}")

    route = data["routes"][0]
    geometry = route.get("geometry") or {}
    coordinates = geometry.get("coordinates", [])

    if not coordinates or len(coordinates) < 2:
        raise RuntimeError("OSRM returned invalid route coordinates.")

    dist_km = round(float(route["distance"]) / 1000.0, 2)
    duration_min = round(float(route["duration"]) / 60.0, 1)

    return {
        "distance_km": dist_km,
        "duration_minutes": duration_min,
        "duration_hours": round(duration_min / 60.0, 2),
        "coordinates": coordinates,
        "provider": "osrm_highway",
    }


def get_road_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> Dict[str, Any]:
    """
    Retrieve authentic road-route geometry strictly inside India.
    1. Validates that origin and destination lie inside India.
    2. Calls Google Routes API (primary) with regionCode='IN'.
    3. Seamlessly falls back to OSRM road geometry if Google Routes API quota is reached.
    4. Validates that all sampled polyline points stay inside India.
    5. If route leaves Indian borders, retries via the Siliguri corridor (connecting North-East).
    6. NEVER falls back to straight lines. Rejects any invalid trip with an explicit error.
    """
    # 1. Coordinate range check
    if not (-90 <= start_lat <= 90 and -90 <= end_lat <= 90 and -180 <= start_lon <= 180 and -180 <= end_lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid start or destination coordinates.")

    # 2. Origin & destination must be inside India
    if not is_point_inside_india(start_lon, start_lat):
        raise HTTPException(
            status_code=400,
            detail=f"Origin coordinates ({start_lat:.4f}, {start_lon:.4f}) are outside Indian territory. All trips must start inside India.",
        )
    if not is_point_inside_india(end_lon, end_lat):
        raise HTTPException(
            status_code=400,
            detail=f"Destination coordinates ({end_lat:.4f}, {end_lon:.4f}) are outside Indian territory. All trips must end inside India.",
        )

    api_key = get_google_maps_api_key()
    route_data = None
    last_error = None

    # 3. Try Primary: Google Routes API
    if api_key:
        try:
            route_data = _request_google_route(start_lat, start_lon, end_lat, end_lon, api_key)
        except Exception as exc:
            last_error = exc

    # 4. Fallback: OSRM Highway Engine
    if not route_data:
        try:
            route_data = _request_osrm_route(start_lat, start_lon, end_lat, end_lon)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Road-routing services unavailable. Primary Google error: {last_error}; Fallback error: {exc}",
            )

    # 5. Validate polyline points against India boundary
    is_valid, violating_points = validate_polyline_inside_india(route_data["coordinates"])

    # 6. If it leaves India, attempt retry via intermediate Indian waypoints (Siliguri corridor / NH-27)
    if not is_valid:
        candidate_waypoint_sets = [
            [SILIGURI_CORRIDOR_WAYPOINT],
            [NH27_BIHAR_WAYPOINT, SILIGURI_CORRIDOR_WAYPOINT],
        ]
        for wp_set in candidate_waypoint_sets:
            retry_route = None
            if api_key:
                try:
                    retry_route = _request_google_route(
                        start_lat,
                        start_lon,
                        end_lat,
                        end_lon,
                        api_key,
                        via_waypoints=wp_set,
                    )
                except Exception:
                    pass

            if not retry_route:
                try:
                    retry_route = _request_osrm_route(
                        start_lat,
                        start_lon,
                        end_lat,
                        end_lon,
                        via_waypoints=wp_set,
                    )
                except Exception:
                    pass

            if retry_route:
                retry_valid, _ = validate_polyline_inside_india(retry_route["coordinates"])
                if retry_valid:
                    return retry_route

        # If still invalid, reject with clear explanation
        sample_viol = violating_points[0] if violating_points else (0, 0)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Computed road route departs Indian territory at ({sample_viol[1]:.4f}, {sample_viol[0]:.4f}). "
                "All CargoMind freight trips must remain strictly inside Indian sovereign roads."
            ),
        )

    return route_data
