"""
GPS Simulator Service for CargoMind.
Provides deterministic, server-side live position interpolation strictly along
verified Indian highway polylines using the pure speed model.
Never falls back to straight lines.
Clearly tags simulated telemetry.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.database.models import Trip, Truck, Driver, Order
from app.optimization.depot import DEPOT_LATITUDE, DEPOT_LONGITUDE
from app.optimization.speed_model import (
    calculate_speed_and_progress,
    haversine_distance_km,
    interpolate_position_along_polyline,
)


def compute_simulated_truck_position(
    truck_id: int,
    db: Session,
    company_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Compute real-time deterministic position for a vehicle using server-side time interpolation
    and driver duty compliance speed model.
    Interpolates strictly along the stored road polyline (by cumulative distance).
    Handles: not-started, in-transit, on-break, completed, and idle states.
    Clearly marked as simulated telemetry.
    """
    truck = db.query(Truck).filter(Truck.id == truck_id).first()
    if not truck:
        return {"status": "truck_not_found", "truck_id": truck_id}

    truck_max_speed = float(getattr(truck, "max_speed_kmph", 80.0) or 80.0)
    truck_avg_speed = float(getattr(truck, "avg_speed_kmph", 45.0) or 45.0)

    # Find active trip for this truck
    trip = (
        db.query(Trip)
        .filter(
            Trip.truck_id == truck_id,
            Trip.status.in_(["planned", "in_progress", "in_trip", "completed"])
        )
        .order_by(Trip.id.desc())
        .first()
    )

    now = datetime.now(timezone.utc)

    # Check for handovers on this trip and switch to relay driver if handover time has arrived
    active_driver_id = trip.driver_id if trip else None
    handover_info = None

    if trip:
        from app.database.models import DriverHandover
        handovers = db.query(DriverHandover).filter(
            DriverHandover.trip_id == trip.id
        ).order_by(DriverHandover.id.asc()).all()

        for ho in handovers:
            is_past_handover = False
            if ho.actual_handover_time or ho.status == "executed":
                is_past_handover = True
            elif ho.planned_handover_time:
                try:
                    ho_dt = datetime.fromisoformat(ho.planned_handover_time.replace("Z", "+00:00"))
                    if ho_dt.tzinfo is None:
                        ho_dt = ho_dt.replace(tzinfo=timezone.utc)
                    if now >= ho_dt:
                        is_past_handover = True
                        if ho.status == "planned":
                            ho.status = "executed"
                            ho.actual_handover_time = ho.planned_handover_time
                            trip.driver_id = ho.incoming_driver_id
                            try:
                                db.commit()
                            except Exception:
                                db.rollback()
                except Exception:
                    pass

            if is_past_handover and ho.incoming_driver_id:
                active_driver_id = ho.incoming_driver_id
                handover_info = {
                    "handover_id": ho.id,
                    "hub_name": ho.hub.name if ho.hub else "Corridor Hub",
                    "switched_at": ho.actual_handover_time or ho.planned_handover_time,
                    "relay_driver_id": ho.incoming_driver_id,
                }

    driver = db.query(Driver).filter(Driver.id == active_driver_id).first() if active_driver_id else None
    if not driver:
        driver = db.query(Driver).filter(Driver.status == "available").first()

    driver_wellness_score = getattr(driver, "wellness_score", 85) or 85
    driver_data = {
        "id": driver.id if driver else None,
        "name": driver.name if driver else "Assigned Fleet Driver",
        "phone": (driver.phone if driver and driver.phone else "+91 98765 43210"),
        "license_number": (driver.license_number if driver and driver.license_number else "DL-COMMERCIAL-01"),
        "wellness_score": driver_wellness_score,
        "wellness_band": "good" if driver_wellness_score >= 80 else ("fair" if driver_wellness_score >= 60 else "needs_rest"),
        "is_relay_driver": handover_info is not None,
        "handover_info": handover_info,
    }

    # If no active trip, vehicle is parked at central depot
    if not trip:
        return {
            "status": "idle",
            "state": "idle",
            "is_simulated": True,
            "simulated": True,
            "truck_id": truck.id,
            "truck_registration": truck.registration_number,
            "driver": driver_data,
            "trip_id": None,
            "trip_status": "idle",
            "origin": "Central Depot (Gwalior)",
            "destination": "Depot Parking",
            "pickup_coordinates": {"lat": DEPOT_LATITUDE, "lng": DEPOT_LONGITUDE},
            "delivery_coordinates": {"lat": DEPOT_LATITUDE, "lng": DEPOT_LONGITUDE},
            "current_position": {"lat": DEPOT_LATITUDE, "lng": DEPOT_LONGITUDE},
            "route_polyline": [[DEPOT_LONGITUDE, DEPOT_LATITUDE]],
            "start_time": None,
            "server_time": now.isoformat(),
            "speed_kmph": 0.0,
            "current_speed": 0.0,
            "average_speed_kmph": truck_avg_speed,
            "avg_speed_kmph": truck_avg_speed,
            "max_speed_kmph": truck_max_speed,
            "distance_travelled_km": 0.0,
            "distance_remaining_km": 0.0,
            "total_distance_km": 0.0,
            "progress_percentage": 0.0,
            "progress": 0.0,
            "eta": "Parked at Depot",
        }

    order = db.query(Order).filter(Order.id == trip.order_id).first() if trip.order_id else None

    # Retrieve or build planned route polyline
    coordinates = []
    if trip.planned_route and isinstance(trip.planned_route, dict):
        coordinates = trip.planned_route.get("coordinates", [])

    p_lat = float(order.pickup_latitude) if (order and order.pickup_latitude) else DEPOT_LATITUDE
    p_lon = float(order.pickup_longitude) if (order and order.pickup_longitude) else DEPOT_LONGITUDE
    d_lat = float(order.delivery_latitude) if (order and order.delivery_latitude) else DEPOT_LATITUDE + 1.0
    d_lon = float(order.delivery_longitude) if (order and order.delivery_longitude) else DEPOT_LONGITUDE + 1.0

    if not coordinates:
        try:
            from app.optimization.road_route import get_road_route
            road_data = get_road_route(p_lat, p_lon, d_lat, d_lon)
            if road_data and road_data.get("coordinates"):
                coordinates = road_data["coordinates"]
                trip.planned_route = road_data
                if road_data.get("distance_km"):
                    trip.distance = int(road_data["distance_km"])
                db.commit()
        except Exception as exc:
            print(f"Could not compute highway road route for trip {trip.id}: {exc}")
            # Note: Do not fall back to straight line.
            coordinates = []

    total_dist = float(trip.distance or 0)
    if total_dist <= 0:
        if coordinates:
            # Calculate from polyline cumulative
            total_dist = sum(
                haversine_distance_km(coordinates[i][1], coordinates[i][0], coordinates[i+1][1], coordinates[i+1][0])
                for i in range(len(coordinates) - 1)
            )
        else:
            total_dist = haversine_distance_km(p_lat, p_lon, d_lat, d_lon)
        trip.distance = int(total_dist)
        db.commit()

    # Parse start time
    start_dt = None
    if trip.start_time:
        try:
            start_dt = datetime.fromisoformat(trip.start_time.replace("Z", "+00:00"))
        except Exception:
            pass

    if not start_dt:
        # Default start time: 1.5 hours ago for demo transit
        start_dt = now - timedelta(hours=1.5)
        trip.start_time = start_dt.isoformat()
        db.commit()

    # Use truck's configured avg cruising speed as primary
    trip_speed_override = None
    if getattr(trip, "average_speed_kmph", None) and float(trip.average_speed_kmph) != 45.0 and float(trip.average_speed_kmph) != truck_avg_speed:
        trip_speed_override = float(trip.average_speed_kmph)

    # Calculate live telemetry using pure speed model
    metrics = calculate_speed_and_progress(
        truck_avg_speed_kmph=truck_avg_speed,
        truck_max_speed_kmph=truck_max_speed,
        trip_start_time=start_dt,
        server_time=now,
        total_distance_km=total_dist,
        road_polyline=coordinates,
        trip_speed_override=trip_speed_override,
    )

    # Position fallback if coordinates empty or not started
    if metrics["current_position"]:
        curr_pos = metrics["current_position"]
    elif coordinates:
        curr_pos = {"lat": float(coordinates[0][1]), "lng": float(coordinates[0][0])}
    else:
        curr_pos = {"lat": p_lat, "lng": p_lon}

    return {
        "status": "success",
        "state": metrics["state"],
        "is_simulated": True,
        "simulated": True,
        "truck_id": truck.id,
        "truck_registration": truck.registration_number,
        "driver": driver_data,
        "trip_id": trip.id,
        "trip_status": trip.status,
        "origin": order.pickup_location if order else "Origin Hub",
        "destination": order.delivery_location if order else "Destination Terminal",
        "pickup_coordinates": {"lat": p_lat, "lng": p_lon},
        "delivery_coordinates": {"lat": d_lat, "lng": d_lon},
        "current_position": curr_pos,
        "route_polyline": coordinates,
        "start_time": start_dt.isoformat(),
        "server_time": now.isoformat(),
        "speed_kmph": metrics["current_speed_kmph"],
        "current_speed": metrics["current_speed_kmph"],
        "average_speed_kmph": metrics["avg_speed_kmph"],
        "avg_speed_kmph": metrics["avg_speed_kmph"],
        "max_speed_kmph": metrics["max_speed_kmph"],
        "base_speed_kmph": metrics["base_speed_kmph"],
        "distance_travelled_km": metrics["distance_travelled_km"],
        "distance_remaining_km": metrics["distance_remaining_km"],
        "total_distance_km": metrics["total_distance_km"],
        "progress_percentage": metrics["progress_percentage"],
        "progress": metrics["progress_percentage"],
        "eta": metrics["eta_formatted"],
        "eta_iso": metrics["eta"],
        "total_breaks_count": metrics["total_breaks_count"],
    }
