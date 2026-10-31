"""
Deterministic Speed & Duty-Compliance Model for CargoMind.
Implements a pure mathematical function modeling continuous vehicle movement,
driver rest compliance breaks (e.g. 30 min break every 4.5 h of continuous driving),
live cumulative distance interpolation along road polylines, and dynamic ETA calculations.
Zero side-effects; completely unit tested.
"""

import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple, Union


DEFAULT_REST_RULES = {
    "drive_interval_hours": 4.5,   # 4.5 hours continuous driving before mandatory rest
    "break_duration_hours": 0.5,   # 30 minutes mandatory rest
}


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two coordinates in kilometers."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2.0) ** 2
    return R * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def interpolate_position_along_polyline(
    coordinates: List[List[float]],
    target_km: float,
    total_km: float
) -> Tuple[float, float]:
    """
    Interpolates exact (lat, lon) coordinates along a GeoJSON [[lon, lat], ...] road polyline
    at target_km cumulative distance. Guarantees positions never depart the paved road.
    """
    if not coordinates:
        return (0.0, 0.0)
    if len(coordinates) == 1 or target_km <= 0.0:
        return (float(coordinates[0][1]), float(coordinates[0][0]))

    # Calculate cumulative distance for each segment
    segment_lengths: List[float] = []
    cumulative: List[float] = [0.0]

    for i in range(len(coordinates) - 1):
        p1 = coordinates[i]
        p2 = coordinates[i + 1]
        dist = haversine_distance_km(float(p1[1]), float(p1[0]), float(p2[1]), float(p2[0]))
        segment_lengths.append(dist)
        cumulative.append(cumulative[-1] + dist)

    poly_total = cumulative[-1]
    if poly_total <= 0.0:
        return (float(coordinates[0][1]), float(coordinates[0][0]))

    scale = (poly_total / total_km) if (total_km and total_km > 0.0) else 1.0
    effective_target = min(poly_total, target_km * scale)

    # Locate segment
    for i in range(len(segment_lengths)):
        c_start = cumulative[i]
        c_end = cumulative[i + 1]
        if c_start <= effective_target <= c_end:
            seg_len = c_end - c_start
            if seg_len <= 1e-6:
                return (float(coordinates[i][1]), float(coordinates[i][0]))
            fraction = (effective_target - c_start) / seg_len
            p_start = coordinates[i]
            p_end = coordinates[i + 1]
            lat = float(p_start[1]) + fraction * (float(p_end[1]) - float(p_start[1]))
            lon = float(p_start[0]) + fraction * (float(p_end[0]) - float(p_start[0]))
            return (round(lat, 6), round(lon, 6))

    # At or beyond end of path
    last_pt = coordinates[-1]
    return (float(last_pt[1]), float(last_pt[0]))


def parse_datetime(dt_val: Union[datetime, str]) -> datetime:
    """Parses datetime object or ISO string into timezone-aware datetime (UTC by default)."""
    if isinstance(dt_val, datetime):
        return dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
    if isinstance(dt_val, str):
        cleaned = dt_val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    raise TypeError(f"Expected datetime or ISO string, got {type(dt_val)}")


def calculate_speed_and_progress(
    truck_avg_speed_kmph: float,
    truck_max_speed_kmph: float,
    trip_start_time: Union[datetime, str],
    server_time: Union[datetime, str],
    total_distance_km: float,
    road_polyline: Optional[List[List[float]]] = None,
    trip_speed_override: Optional[float] = None,
    rest_rules: Optional[Dict[str, float]] = DEFAULT_REST_RULES,
) -> Dict[str, Any]:
    """
    Pure mathematical speed, progress, and live telemetry function.

    Formula:
      - base_speed = min(truck_avg_speed_kmph, truck_max_speed_kmph)
      - If trip_speed_override is supplied, base_speed = min(trip_speed_override, truck_max_speed_kmph)
      - moving_hours = elapsed_hours - total_break_hours_elapsed
      - distance_travelled_km = min(total_distance_km, moving_hours * base_speed)
      - remaining_km = max(0.0, total_distance_km - distance_travelled_km)
      - progress_% = (distance_travelled_km / total_distance_km) * 100.0
      - ETA = start_time + total_driving_hours + total_mandatory_breaks

    States:
      - 'not_started': server_time < trip_start_time (current_speed = 0)
      - 'in_transit': vehicle is actively moving (current_speed = base_speed)
      - 'on_break': vehicle is paused for mandatory driver rest (current_speed = 0)
      - 'completed': vehicle has reached destination (current_speed = 0)
    """
    # 1. Speed validations
    if truck_avg_speed_kmph is None or truck_max_speed_kmph is None:
        raise ValueError("truck_avg_speed_kmph and truck_max_speed_kmph must not be None.")
    if truck_avg_speed_kmph <= 0 or truck_max_speed_kmph <= 0:
        raise ValueError("Truck speeds must be strictly positive (> 0).")
    if truck_avg_speed_kmph > truck_max_speed_kmph:
        raise ValueError(
            f"Average speed ({truck_avg_speed_kmph} km/h) cannot exceed maximum speed ({truck_max_speed_kmph} km/h)."
        )

    # 2. Base speed determination
    if trip_speed_override is not None and trip_speed_override > 0:
        base_speed = min(float(trip_speed_override), float(truck_max_speed_kmph))
    else:
        base_speed = min(float(truck_avg_speed_kmph), float(truck_max_speed_kmph))

    # 3. Time parsing
    start_dt = parse_datetime(trip_start_time)
    server_dt = parse_datetime(server_time)
    elapsed_seconds = (server_dt - start_dt).total_seconds()
    elapsed_hours = elapsed_seconds / 3600.0

    total_dist = max(0.0, float(total_distance_km))

    # 4. Total driving hours needed for entire trip
    total_driving_hours_needed = (total_dist / base_speed) if base_speed > 0 else 0.0

    # 5. Rest / Compliance configuration
    drive_interval = 4.5
    break_duration = 0.5
    has_breaks = bool(rest_rules and rest_rules.get("drive_interval_hours") and rest_rules.get("break_duration_hours"))
    if has_breaks:
        drive_interval = float(rest_rules["drive_interval_hours"])
        break_duration = float(rest_rules["break_duration_hours"])
    cycle_duration = (drive_interval + break_duration) if has_breaks else 1e9

    # Calculate total breaks needed for entire trip
    if has_breaks and total_driving_hours_needed > 0:
        total_breaks_count = max(0, math.floor((total_driving_hours_needed - 1e-5) / drive_interval))
    else:
        total_breaks_count = 0
    total_break_hours_trip = total_breaks_count * break_duration

    # Overall trip duration from departure to arrival
    total_trip_duration_hours = total_driving_hours_needed + total_break_hours_trip
    eta_dt = start_dt + timedelta(hours=total_trip_duration_hours)

    # 6. Evaluate State & Movement
    if total_dist <= 0:
        state = "completed"
        current_speed = 0.0
        distance_travelled = 0.0
        distance_remaining = 0.0
        progress_percentage = 100.0
    elif elapsed_hours < 0:
        state = "not_started"
        current_speed = 0.0
        distance_travelled = 0.0
        distance_remaining = total_dist
        progress_percentage = 0.0
    elif elapsed_hours >= total_trip_duration_hours:
        state = "completed"
        current_speed = 0.0
        distance_travelled = total_dist
        distance_remaining = 0.0
        progress_percentage = 100.0
    else:
        # In progress: determine if currently driving or on break
        if has_breaks:
            num_cycles = math.floor(elapsed_hours / cycle_duration)
            time_in_cycle = elapsed_hours - (num_cycles * cycle_duration)

            if time_in_cycle < drive_interval:
                state = "in_transit"
                current_speed = base_speed
                moving_hours = (num_cycles * drive_interval) + time_in_cycle
            else:
                state = "on_break"
                current_speed = 0.0
                moving_hours = (num_cycles + 1) * drive_interval
        else:
            state = "in_transit"
            current_speed = base_speed
            moving_hours = elapsed_hours

        distance_travelled = min(total_dist, round(moving_hours * base_speed, 3))
        distance_remaining = max(0.0, round(total_dist - distance_travelled, 3))
        progress_percentage = round((distance_travelled / total_dist) * 100.0, 2)

    # 7. Coordinate interpolation along polyline
    current_position = None
    if road_polyline and len(road_polyline) > 0:
        curr_lat, curr_lng = interpolate_position_along_polyline(
            road_polyline,
            distance_travelled,
            total_dist
        )
        current_position = {"lat": curr_lat, "lng": curr_lng}

    return {
        "state": state,
        "current_speed_kmph": round(current_speed, 1),
        "base_speed_kmph": round(base_speed, 1),
        "avg_speed_kmph": round(truck_avg_speed_kmph, 1),
        "max_speed_kmph": round(truck_max_speed_kmph, 1),
        "distance_travelled_km": round(distance_travelled, 2),
        "distance_remaining_km": round(distance_remaining, 2),
        "total_distance_km": round(total_dist, 2),
        "progress_percentage": round(progress_percentage, 1),
        "eta": eta_dt.isoformat(),
        "eta_formatted": eta_dt.strftime("%I:%M %p, %b %d"),
        "total_breaks_count": total_breaks_count,
        "current_position": current_position,
        "is_simulated": True,
    }
