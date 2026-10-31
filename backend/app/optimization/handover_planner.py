"""
Driver Handover Planner for CargoMind.
Plans optimal driver relays along highway corridors adhering to regulatory limits:
- Max continuous driving per shift: 8.0 hours
- Mandatory break: 30 minutes every 4.5 hours of driving
- Night fatigue window (22:00 - 03:00): 1.25x fatigue multiplier against shift limit
- Minimum mandatory rest before next trip: 8.0 hours
- Corridor Hub proximity: within X km of road polyline (point-to-polyline distance)

Pure, deterministic, and fully unit-testable.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple


DEFAULT_HANDOVER_CONFIG: Dict[str, Any] = {
    "max_continuous_driving_hours": 8.0,
    "break_interval_hours": 4.5,
    "break_duration_minutes": 30,
    "night_window_start": 22,
    "night_window_end": 3,
    "night_fatigue_multiplier": 1.25,
    "min_rest_before_next_hours": 8.0,
    "hub_search_radius_km": 85.0,  # Accommodates expressways and ring roads around major logistics hubs
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2 +
        math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 4)


def _point_to_segment_distance(
    p_lat: float, p_lon: float,
    a_lat: float, a_lon: float,
    b_lat: float, b_lon: float
) -> Tuple[float, float]:
    """
    Computes distance in km from point P to line segment A-B,
    and returns (min_distance_km, projection_ratio_t).
    projection_ratio_t is in [0, 1].
    """
    # Flat-earth approximation is accurate for local segments < 100km
    dx = (b_lon - a_lon) * math.cos(math.radians((a_lat + b_lat) / 2.0))
    dy = b_lat - a_lat
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq <= 1e-12:
        return haversine_km(p_lat, p_lon, a_lat, a_lon), 0.0

    px = (p_lon - a_lon) * math.cos(math.radians((a_lat + p_lat) / 2.0))
    py = p_lat - a_lat

    t = max(0.0, min(1.0, (px * dx + py * dy) / seg_len_sq))
    proj_lat = a_lat + t * (b_lat - a_lat)
    proj_lon = a_lon + t * (b_lon - a_lon)

    dist = haversine_km(p_lat, p_lon, proj_lat, proj_lon)
    return dist, t


def compute_cumulative_distances(coordinates: List[List[float]]) -> List[float]:
    """
    Compute cumulative distance in km at each coordinate [lon, lat] along polyline.
    """
    if not coordinates:
        return []
    cum = [0.0]
    total = 0.0
    for i in range(len(coordinates) - 1):
        p1 = coordinates[i]
        p2 = coordinates[i + 1]
        step = haversine_km(p1[1], p1[0], p2[1], p2[0])
        total += step
        cum.append(round(total, 3))
    return cum


def find_hubs_on_route(
    coordinates: List[List[float]],
    cum_distances: List[float],
    hubs: List[Any],
    search_radius_km: float = 50.0,
) -> List[Dict[str, Any]]:
    """
    Identifies all hubs lying within search_radius_km of the route polyline,
    and determines their exact km mark along the route.
    """
    if not coordinates or len(coordinates) < 2 or not hubs:
        return []

    identified_hubs = []

    for hub in hubs:
        # Extract lat/lon from dict or model object
        h_lat = float(getattr(hub, "latitude", None) or (hub.get("latitude") if isinstance(hub, dict) else 0.0) or 0.0)
        h_lon = float(getattr(hub, "longitude", None) or (hub.get("longitude") if isinstance(hub, dict) else 0.0) or 0.0)
        h_id = getattr(hub, "id", None) or (hub.get("id") if isinstance(hub, dict) else None)
        h_name = getattr(hub, "name", None) or (hub.get("name") if isinstance(hub, dict) else "Corridor Hub")
        h_city = getattr(hub, "city", None) or (hub.get("city") if isinstance(hub, dict) else "")

        if h_lat == 0.0 and h_lon == 0.0:
            continue

        min_dist = float("inf")
        best_km = 0.0

        for i in range(len(coordinates) - 1):
            p1 = coordinates[i]
            p2 = coordinates[i + 1]
            seg_dist, t = _point_to_segment_distance(h_lat, h_lon, p1[1], p1[0], p2[1], p2[0])
            if seg_dist < min_dist:
                min_dist = seg_dist
                seg_start_km = cum_distances[i]
                seg_end_km = cum_distances[i + 1]
                best_km = seg_start_km + t * (seg_end_km - seg_start_km)

        if min_dist <= search_radius_km:
            identified_hubs.append({
                "hub_id": h_id,
                "hub_name": h_name,
                "city": h_city,
                "latitude": h_lat,
                "longitude": h_lon,
                "km_along_route": round(best_km, 2),
                "detour_km": round(min_dist, 2),
                "hub_obj": hub,
            })

    # Sort hubs sequentially along the route
    identified_hubs.sort(key=lambda x: x["km_along_route"])
    return identified_hubs


def calculate_segment_fatigue(
    start_dt: datetime,
    distance_km: float,
    avg_speed_kmph: float,
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Computes driving time, mandatory breaks, night hours (22:00-03:00),
    and effective fatigue hours (with 1.25x night multiplier).
    """
    spd = max(15.0, avg_speed_kmph)
    pure_driving_hours = distance_km / spd
    pure_driving_mins = pure_driving_hours * 60.0

    # 30-min break every 4.5h continuous driving
    break_interval_mins = config["break_interval_hours"] * 60.0
    num_breaks = int(pure_driving_mins // break_interval_mins)
    break_mins = num_breaks * config["break_duration_minutes"]

    total_transit_mins = pure_driving_mins + break_mins
    arrival_dt = start_dt + timedelta(minutes=total_transit_mins)

    # Step through driving minutes to accumulate night fatigue
    night_mult = config["night_fatigue_multiplier"]
    curr = start_dt
    step_m = 5.0
    night_driving_mins = 0.0
    effective_driving_mins = 0.0

    while curr < arrival_dt:
        hr = curr.hour
        is_night = (hr >= config["night_window_start"] or hr < config["night_window_end"])
        if is_night:
            night_driving_mins += step_m
            effective_driving_mins += (step_m * night_mult)
        else:
            effective_driving_mins += step_m
        curr += timedelta(minutes=step_m)

    effective_fatigue_hours = round(effective_driving_mins / 60.0, 2)
    night_hours = round(night_driving_mins / 60.0, 2)

    return {
        "pure_driving_hours": round(pure_driving_hours, 2),
        "break_minutes": int(break_mins),
        "total_transit_hours": round(total_transit_mins / 60.0, 2),
        "night_hours": night_hours,
        "effective_fatigue_hours": effective_fatigue_hours,
        "arrival_dt": arrival_dt,
    }


def plan_journey_handovers(
    route_coordinates: List[List[float]],
    start_time: str,
    avg_speed_kmph: float,
    hubs: List[Any],
    origin_name: str = "Origin",
    dest_name: str = "Destination",
    initial_driver: Optional[Any] = None,
    available_relay_drivers: Optional[List[Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Pure algorithmic planner.
    Walks forward along route, finding optimal handover hubs nearest to (but before)
    the 8h driver limit, assigning rested relay drivers ranked by wellness score.
    """
    cfg = {**DEFAULT_HANDOVER_CONFIG, **(config or {})}
    max_shift_hours = cfg["max_continuous_driving_hours"]
    search_radius = cfg["hub_search_radius_km"]

    # Parse start time
    try:
        curr_dt = datetime.fromisoformat(str(start_time).replace("Z", "+00:00"))
    except Exception:
        curr_dt = datetime.now(timezone.utc)

    cum_distances = compute_cumulative_distances(route_coordinates)
    total_distance_km = cum_distances[-1] if cum_distances else 0.0

    # Locate hubs along route
    route_hubs = find_hubs_on_route(
        coordinates=route_coordinates,
        cum_distances=cum_distances,
        hubs=hubs,
        search_radius_km=search_radius,
    )

    # Sort available relay drivers by wellness score descending
    relay_pool = []
    if available_relay_drivers:
        for d in available_relay_drivers:
            w = getattr(d, "wellness_score", 0) or 0
            relay_pool.append({
                "id": getattr(d, "id", None),
                "name": getattr(d, "name", "Relay Driver"),
                "wellness_score": w,
                "wellness_band": "good" if w >= 80 else ("fair" if w >= 60 else "needs_rest"),
                "rest_hours": getattr(d, "rest_hours", 0) or 0,
                "driver_obj": d,
            })
        relay_pool.sort(key=lambda x: x["wellness_score"], reverse=True)

    segments = []
    handovers = []
    warnings = []

    curr_km = 0.0
    curr_node_name = origin_name
    curr_driver_id = getattr(initial_driver, "id", None) if initial_driver else None
    curr_driver_name = getattr(initial_driver, "name", "Primary Driver") if initial_driver else "Primary Driver"
    curr_driver_wellness = getattr(initial_driver, "wellness_score", 85) if initial_driver else 85

    relay_idx = 0
    segment_idx = 0

    while curr_km < total_distance_km:
        remaining_km = total_distance_km - curr_km

        # Check if remaining journey can be completed without exceeding driver limit
        full_rem_fatigue = calculate_segment_fatigue(
            start_dt=curr_dt,
            distance_km=remaining_km,
            avg_speed_kmph=avg_speed_kmph,
            config=cfg,
        )

        if full_rem_fatigue["effective_fatigue_hours"] <= max_shift_hours:
            # Can complete entire remaining distance to destination!
            segments.append({
                "segment_index": segment_idx,
                "from_node": curr_node_name,
                "to_node": dest_name,
                "from_km": round(curr_km, 1),
                "to_km": round(total_distance_km, 1),
                "distance_km": round(remaining_km, 1),
                "pure_driving_hours": full_rem_fatigue["pure_driving_hours"],
                "break_minutes": full_rem_fatigue["break_minutes"],
                "total_hours": full_rem_fatigue["total_transit_hours"],
                "effective_fatigue_hours": full_rem_fatigue["effective_fatigue_hours"],
                "night_hours": full_rem_fatigue["night_hours"],
                "start_time": curr_dt.isoformat(),
                "arrival_time": full_rem_fatigue["arrival_dt"].isoformat(),
                "driver_id": curr_driver_id,
                "driver_name": curr_driver_name,
                "driver_wellness": curr_driver_wellness,
                "is_final_leg": True,
            })
            curr_km = total_distance_km
            curr_dt = full_rem_fatigue["arrival_dt"]
            break

        # Driver limit would be exceeded. Must find handover hub before limit!
        # Search candidate hubs between curr_km and destination reachable within 8h limit
        candidate_hubs = []
        for h in route_hubs:
            h_km = h["km_along_route"]
            # Must be ahead of current position and not virtually at the start or destination
            if h_km > (curr_km + 15.0) and h_km < (total_distance_km - 15.0):
                seg_fatigue = calculate_segment_fatigue(
                    start_dt=curr_dt,
                    distance_km=h_km - curr_km,
                    avg_speed_kmph=avg_speed_kmph,
                    config=cfg,
                )
                if seg_fatigue["effective_fatigue_hours"] <= max_shift_hours:
                    candidate_hubs.append((h, seg_fatigue))

        if candidate_hubs:
            # Pick hub nearest to the 8h limit (farthest forward compliant hub)
            chosen_hub, chosen_fatigue = candidate_hubs[-1]
        else:
            # No hub reachable before 8h limit! Flag warning and find nearest available alternative
            nearest_ahead = [h for h in route_hubs if h["km_along_route"] > (curr_km + 15.0)]
            if nearest_ahead:
                chosen_hub = nearest_ahead[0]
                chosen_fatigue = calculate_segment_fatigue(
                    start_dt=curr_dt,
                    distance_km=chosen_hub["km_along_route"] - curr_km,
                    avg_speed_kmph=avg_speed_kmph,
                    config=cfg,
                )
                warnings.append(
                    f"No hub available before the 8h limit between km {curr_km:.0f} and {chosen_hub['km_along_route']:.0f}. "
                    f"Nearest corridor hub is '{chosen_hub['hub_name']}' at km {chosen_hub['km_along_route']:.0f} "
                    f"({chosen_fatigue['effective_fatigue_hours']:.1f}h effective shift)."
                )
            else:
                # No hubs whatsoever ahead
                warnings.append(
                    f"No corridor hubs available along the route after km {curr_km:.0f}. "
                    "Mandatory rest stop recommended at highway transit facility."
                )
                # Cap segment at 8h driving distance
                safe_dist = avg_speed_kmph * max_shift_hours * 0.95
                chosen_fatigue = calculate_segment_fatigue(
                    start_dt=curr_dt,
                    distance_km=safe_dist,
                    avg_speed_kmph=avg_speed_kmph,
                    config=cfg,
                )
                chosen_hub = {
                    "hub_id": None,
                    "hub_name": f"Highway Rest Waypoint ({int(curr_km + safe_dist)} km)",
                    "city": "NH Transit Point",
                    "km_along_route": round(curr_km + safe_dist, 1),
                }

        # Select next rested relay driver (highest wellness score)
        next_driver_id = None
        next_driver_name = "Relay Driver"
        next_driver_wellness = 80

        if relay_pool:
            relay_driver = relay_pool[relay_idx % len(relay_pool)]
            relay_idx += 1
            next_driver_id = relay_driver["id"]
            next_driver_name = relay_driver["name"]
            next_driver_wellness = relay_driver["wellness_score"]

        # Record segment
        seg_distance = round(chosen_hub["km_along_route"] - curr_km, 1)
        segments.append({
            "segment_index": segment_idx,
            "from_node": curr_node_name,
            "to_node": chosen_hub["hub_name"],
            "from_km": round(curr_km, 1),
            "to_km": chosen_hub["km_along_route"],
            "distance_km": seg_distance,
            "pure_driving_hours": chosen_fatigue["pure_driving_hours"],
            "break_minutes": chosen_fatigue["break_minutes"],
            "total_hours": chosen_fatigue["total_transit_hours"],
            "effective_fatigue_hours": chosen_fatigue["effective_fatigue_hours"],
            "night_hours": chosen_fatigue["night_hours"],
            "start_time": curr_dt.isoformat(),
            "arrival_time": chosen_fatigue["arrival_dt"].isoformat(),
            "driver_id": curr_driver_id,
            "driver_name": curr_driver_name,
            "driver_wellness": curr_driver_wellness,
            "is_final_leg": False,
        })

        # Record scheduled handover event
        handovers.append({
            "handover_index": len(handovers),
            "hub_id": chosen_hub.get("hub_id"),
            "hub_name": chosen_hub.get("hub_name"),
            "city": chosen_hub.get("city"),
            "km_along_route": chosen_hub["km_along_route"],
            "estimated_arrival": chosen_fatigue["arrival_dt"].isoformat(),
            "outgoing_driver_id": curr_driver_id,
            "outgoing_driver_name": curr_driver_name,
            "outgoing_driver_wellness": curr_driver_wellness,
            "incoming_driver_id": next_driver_id,
            "incoming_driver_name": next_driver_name,
            "incoming_driver_wellness": next_driver_wellness,
            "recommendation": f"Complete handover at {chosen_hub['hub_name']}, then rest 8h.",
            "status": "planned",
        })

        # Advance state
        curr_km = chosen_hub["km_along_route"]
        curr_node_name = chosen_hub["hub_name"]
        curr_dt = chosen_fatigue["arrival_dt"] + timedelta(minutes=20)  # 20 min handover window
        curr_driver_id = next_driver_id
        curr_driver_name = next_driver_name
        curr_driver_wellness = next_driver_wellness
        segment_idx += 1

    total_driving_hours = sum(s["pure_driving_hours"] for s in segments)
    total_break_mins = sum(s["break_minutes"] for s in segments)

    return {
        "status": "success",
        "total_distance_km": round(total_distance_km, 1),
        "total_driving_hours": round(total_driving_hours, 2),
        "total_break_minutes": total_break_mins,
        "total_transit_hours": round((total_driving_hours * 60 + total_break_mins) / 60.0, 2),
        "total_handovers": len(handovers),
        "segments": segments,
        "handovers": handovers,
        "warnings": warnings,
        "corridor_hubs_available": [
            {
                "hub_id": h["hub_id"],
                "hub_name": h["hub_name"],
                "city": h["city"],
                "km_along_route": h["km_along_route"],
                "detour_km": h["detour_km"],
            }
            for h in route_hubs
        ],
        "config_applied": cfg,
    }
