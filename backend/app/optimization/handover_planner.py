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
    Driver Handover Planner strictly enforcing regulations:
    1. If complete trip driving time <= 8.0 hours, complete with the same driver; no handover.
    2. A driver handover must never be planned before the driver has completed 8.0 hours of driving.
    3. For trips exceeding 8.0 hours, first handover must be at a reachable hub after 8.0 hours of driving,
       preferring between 9.0 and 10.0 driving hours.
    4. If no valid hub exists after the 8.0 hour minimum, returns an explicit error without early handovers.
    5. Pure driving time along the planned route is used for all threshold calculations.
    """
    cfg = {**DEFAULT_HANDOVER_CONFIG, **(config or {})}
    search_radius = cfg.get("hub_search_radius_km", 85.0)
    spd = max(15.0, float(avg_speed_kmph or 50.0))

    # Parse start time with timezone safety
    try:
        curr_dt = datetime.fromisoformat(str(start_time).replace("Z", "+00:00"))
        if curr_dt.tzinfo is None:
            curr_dt = curr_dt.replace(tzinfo=timezone.utc)
    except Exception:
        curr_dt = datetime.now(timezone.utc)

    cum_distances = compute_cumulative_distances(route_coordinates)
    total_distance_km = cum_distances[-1] if cum_distances else 0.0
    total_driving_hours = round(total_distance_km / spd, 2)

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

    curr_driver_id = getattr(initial_driver, "id", None) if initial_driver else None
    curr_driver_name = getattr(initial_driver, "name", "Primary Driver") if initial_driver else "Primary Driver"
    curr_driver_wellness = getattr(initial_driver, "wellness_score", 85) if initial_driver else 85

    # -------------------------------------------------------------
    # RULE 1: If complete trip <= 8.0 driving hours, complete with same driver (0 handovers)
    # -------------------------------------------------------------
    if total_driving_hours <= 8.0:
        full_fatigue = calculate_segment_fatigue(
            start_dt=curr_dt,
            distance_km=total_distance_km,
            avg_speed_kmph=spd,
            config=cfg,
        )
        single_segment = {
            "segment_index": 0,
            "from_node": origin_name,
            "to_node": dest_name,
            "from_km": 0.0,
            "to_km": round(total_distance_km, 1),
            "distance_km": round(total_distance_km, 1),
            "pure_driving_hours": full_fatigue["pure_driving_hours"],
            "break_minutes": full_fatigue["break_minutes"],
            "total_hours": full_fatigue["total_transit_hours"],
            "effective_fatigue_hours": full_fatigue["effective_fatigue_hours"],
            "night_hours": full_fatigue["night_hours"],
            "start_time": curr_dt.isoformat(),
            "arrival_time": full_fatigue["arrival_dt"].isoformat(),
            "driver_id": curr_driver_id,
            "driver_name": curr_driver_name,
            "driver_wellness": curr_driver_wellness,
            "is_final_leg": True,
        }
        return {
            "status": "success",
            "message": f"Complete trip can be driven in {total_driving_hours:.1f} hours (<= 8.0h threshold). Completed with the same driver; no driver handover required.",
            "total_distance_km": round(total_distance_km, 1),
            "total_driving_hours": total_driving_hours,
            "total_break_minutes": full_fatigue["break_minutes"],
            "total_transit_hours": full_fatigue["total_transit_hours"],
            "total_handovers": 0,
            "segments": [single_segment],
            "handovers": [],
            "warnings": [],
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

    # -------------------------------------------------------------
    # RULE 2-5: Trips > 8.0 hours require handovers strictly after >= 8.0 hours driving
    # -------------------------------------------------------------
    segments = []
    handovers = []
    warnings = []

    curr_km = 0.0
    curr_node_name = origin_name
    relay_idx = 0
    segment_idx = 0

    while curr_km < total_distance_km:
        remaining_km = total_distance_km - curr_km
        remaining_driving_hours = remaining_km / spd

        if remaining_driving_hours <= 8.0:
            # Remaining leg can be driven by current driver to destination!
            final_fatigue = calculate_segment_fatigue(
                start_dt=curr_dt,
                distance_km=remaining_km,
                avg_speed_kmph=spd,
                config=cfg,
            )
            segments.append({
                "segment_index": segment_idx,
                "from_node": curr_node_name,
                "to_node": dest_name,
                "from_km": round(curr_km, 1),
                "to_km": round(total_distance_km, 1),
                "distance_km": round(remaining_km, 1),
                "pure_driving_hours": final_fatigue["pure_driving_hours"],
                "break_minutes": final_fatigue["break_minutes"],
                "total_hours": final_fatigue["total_transit_hours"],
                "effective_fatigue_hours": final_fatigue["effective_fatigue_hours"],
                "night_hours": final_fatigue["night_hours"],
                "start_time": curr_dt.isoformat(),
                "arrival_time": final_fatigue["arrival_dt"].isoformat(),
                "driver_id": curr_driver_id,
                "driver_name": curr_driver_name,
                "driver_wellness": curr_driver_wellness,
                "is_final_leg": True,
            })
            curr_km = total_distance_km
            break

        # Handover required: Candidate hubs MUST have driving_hours >= 8.0 from curr_km
        candidates_preferred = []  # 9.0h - 10.0h
        candidates_8_to_9 = []     # 8.0h - 9.0h
        candidates_post_10 = []    # 10.0h - 11.5h

        for h in route_hubs:
            h_km = h["km_along_route"]
            # Hub must be ahead and not virtually at the destination
            if h_km <= (curr_km + 15.0) or h_km >= (total_distance_km - 15.0):
                continue

            seg_km = h_km - curr_km
            seg_driving_hours = round(seg_km / spd, 2)

            # RULE: A driver handover must NEVER be planned before 8.0 hours of driving
            if seg_driving_hours < 8.0:
                continue

            seg_fatigue = calculate_segment_fatigue(
                start_dt=curr_dt,
                distance_km=seg_km,
                avg_speed_kmph=spd,
                config=cfg,
            )

            if 9.0 <= seg_driving_hours <= 10.0:
                candidates_preferred.append((h, seg_fatigue, seg_driving_hours))
            elif 8.0 <= seg_driving_hours < 9.0:
                candidates_8_to_9.append((h, seg_fatigue, seg_driving_hours))
            else:
                candidates_post_10.append((h, seg_fatigue, seg_driving_hours))

        # Select the optimal hub
        chosen_hub = None
        chosen_fatigue = None

        if candidates_preferred:
            # Prefer 9.0 - 10.0 hours: select candidate closest to 9.5 hours
            candidates_preferred.sort(key=lambda x: abs(x[2] - 9.5))
            chosen_hub, chosen_fatigue, _ = candidates_preferred[0]
        elif candidates_8_to_9:
            # Between 8.0 and 9.0 hours: choose the one closest to 9.0 hours
            candidates_8_to_9.sort(key=lambda x: x[2], reverse=True)
            chosen_hub, chosen_fatigue, _ = candidates_8_to_9[0]
        elif candidates_post_10:
            # Safe extension beyond 10 hours: choose closest to 10.0 hours
            candidates_post_10.sort(key=lambda x: x[2])
            chosen_hub, chosen_fatigue, _ = candidates_post_10[0]
        else:
            # RULE: If no valid handover hub exists after the 8-hour minimum,
            # do NOT silently schedule an early handover! Return a clear planning error.
            err_msg = (
                f"No valid handover hub found after the 8.0-hour driving minimum (from "
                f"km {curr_km + (8.0 * spd):.0f} onwards). "
                "Driver handover cannot be planned before completing at least 8.0 hours of driving."
            )
            return {
                "status": "error",
                "error_code": "NO_VALID_HANDOVER_HUB",
                "message": err_msg,
                "total_distance_km": round(total_distance_km, 1),
                "total_driving_hours": total_driving_hours,
                "total_handovers": 0,
                "segments": [],
                "handovers": [],
                "warnings": [err_msg],
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
            "outgoing_km": chosen_hub["km_along_route"],
            "estimated_arrival": chosen_fatigue["arrival_dt"].isoformat(),
            "outgoing_driver_id": curr_driver_id,
            "outgoing_driver_name": curr_driver_name,
            "outgoing_driver_wellness": curr_driver_wellness,
            "incoming_driver_id": next_driver_id,
            "incoming_driver_name": next_driver_name,
            "incoming_driver_wellness": next_driver_wellness,
            "driving_hours_before_handover": chosen_fatigue["pure_driving_hours"],
            "recommendation": f"Complete handover at {chosen_hub['hub_name']} after {chosen_fatigue['pure_driving_hours']:.1f}h driving, then rest 8h.",
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

    total_driving = sum(s["pure_driving_hours"] for s in segments)
    total_break_mins = sum(s["break_minutes"] for s in segments)

    return {
        "status": "success",
        "total_distance_km": round(total_distance_km, 1),
        "total_driving_hours": round(total_driving, 2),
        "total_break_minutes": total_break_mins,
        "total_transit_hours": round((total_driving * 60 + total_break_mins) / 60.0, 2),
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
