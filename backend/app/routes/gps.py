from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.optimization.road_route import get_road_route
from app.database.connection import get_db
from app.database.models import GPSTracking, Trip, Order, Truck, User
from app.routes.auth import get_current_user_optional
from math import radians, sin, cos, sqrt, atan2


router = APIRouter(
    prefix="/gps",
    tags=["GPS Tracking"]
)

def distance_to_segment_km(
    point_lat,
    point_lon,
    start_lat,
    start_lon,
    end_lat,
    end_lon
):
    """Shortest approximate distance from a GPS point to a route segment."""

    # Convert longitude differences to kilometres at this latitude.
    km_per_degree_lat = 111.32
    km_per_degree_lon = (
        111.32 * cos(radians(point_lat))
    )

    px = (point_lon - start_lon) * km_per_degree_lon
    py = (point_lat - start_lat) * km_per_degree_lat

    sx = 0.0
    sy = 0.0

    ex = (end_lon - start_lon) * km_per_degree_lon
    ey = (end_lat - start_lat) * km_per_degree_lat

    segment_length_squared = ex * ex + ey * ey

    if segment_length_squared == 0:
        return sqrt(px * px + py * py)

    # Project the GPS point onto the segment.
    t = (px * ex + py * ey) / segment_length_squared
    t = max(0.0, min(1.0, t))

    nearest_x = sx + t * ex
    nearest_y = sy + t * ey

    dx = px - nearest_x
    dy = py - nearest_y

    return sqrt(dx * dx + dy * dy)


@router.post("/")
def create_gps_record(
    truck_id: int,
    latitude: float,
    longitude: float,
    speed: float = 0,
    timestamp: str = "",
    db: Session = Depends(get_db)
):
    # Validate GPS coordinates
    if not -90 <= latitude <= 90:
        raise HTTPException(
            status_code=400,
            detail="Latitude must be between -90 and 90"
        )

    if not -180 <= longitude <= 180:
        raise HTTPException(
            status_code=400,
            detail="Longitude must be between -180 and 180"
        )

    if speed < 0:
        raise HTTPException(
            status_code=400,
            detail="Speed cannot be negative"
        )

    # Verify that the truck exists
    from app.database.models import Truck

    truck = db.query(Truck).filter(
        Truck.id == truck_id
    ).first()

    if not truck:
        raise HTTPException(
            status_code=404,
            detail="Truck not found"
        )

    # Generate a timestamp if none was supplied
    if not timestamp:
        timestamp = datetime.now(
            timezone.utc
        ).isoformat()

    gps_record = GPSTracking(
        truck_id=truck_id,
        latitude=str(latitude),
        longitude=str(longitude),
        speed=speed,
        timestamp=timestamp
    )

    try:
        db.add(gps_record)
        db.commit()
        db.refresh(gps_record)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save GPS record"
        )

    return {
        "message": "GPS record created successfully",
        "gps": {
            "id": gps_record.id,
            "truck_id": gps_record.truck_id,
            "latitude": float(gps_record.latitude),
            "longitude": float(gps_record.longitude),
            "speed": gps_record.speed,
            "timestamp": gps_record.timestamp
        }
    }

@router.get("/")
def get_gps_records(
    db: Session = Depends(get_db)
):
    records = db.query(GPSTracking).all()

    return records


@router.get("/simulation/fleet")
def get_fleet_simulated_locations(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Return real-time simulated positions, driver info, and trip progress
    for all vehicles across the user's fleet workspace.
    """
    from app.optimization.gps_simulator import compute_simulated_truck_position

    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None

    trucks = db.query(Truck).filter((Truck.company_id == comp_id) | (Truck.user_id == user_id)).all()
    fleet_telemetry = []
    for truck in trucks:
        sim = compute_simulated_truck_position(truck.id, db)
        fleet_telemetry.append(sim)

    return fleet_telemetry


@router.get("/simulation/{truck_id}")
def get_simulated_truck_location(
    truck_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Deterministic time-interpolated live position, driver data, and ETA
    for a single vehicle.
    """
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found or does not belong to your company")

    from app.optimization.gps_simulator import compute_simulated_truck_position
    return compute_simulated_truck_position(truck_id, db)


@router.get("/{truck_id}")
def get_truck_location(
    truck_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found or does not belong to your company")

    record = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.desc())
        .first()
    )

    if not record:
        from app.optimization.gps_simulator import compute_simulated_truck_position
        sim = compute_simulated_truck_position(truck_id, db)
        if sim.get("current_position"):
            return {
                "truck_id": truck_id,
                "latitude": str(sim["current_position"]["lat"]),
                "longitude": str(sim["current_position"]["lng"]),
                "speed": sim.get("speed_kmph", 0),
                "timestamp": sim.get("server_time", datetime.now(timezone.utc).isoformat()),
                "is_simulated": True
            }
        raise HTTPException(
            status_code=404,
            detail="GPS record not found for this truck"
        )

    return {
        "truck_id": record.truck_id,
        "latitude": record.latitude,
        "longitude": record.longitude,
        "speed": record.speed,
        "timestamp": record.timestamp,
        "is_simulated": False
    }

@router.get("/{truck_id}/history")
def get_truck_gps_history(
    truck_id: int,
    limit: int = 100,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve chronologically ordered historical GPS trail for a truck."""
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found or does not belong to your company")

    records = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.asc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": r.id,
            "truck_id": r.truck_id,
            "latitude": float(r.latitude),
            "longitude": float(r.longitude),
            "speed": r.speed,
            "timestamp": r.timestamp,
        }
        for r in records
    ]


@router.get("/{truck_id}/active-trip")
def get_truck_active_trip(
    truck_id: int,
    db: Session = Depends(get_db)
):
    gps_record = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.desc())
        .first()
    )

    trip = (
        db.query(Trip)
        .filter(
            Trip.truck_id == truck_id,
            Trip.status.in_(["planned", "in_progress"])
        )
        .order_by(Trip.id.desc())
        .first()
    )

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="No active trip found for this truck"
        )

    order = db.query(Order).filter(Order.id == trip.order_id).first() if trip.order_id else None

    # Auto-calculate and cache planned road route if missing and order has coordinates
    if trip.planned_route is None and order and order.pickup_latitude and order.delivery_latitude:
        try:
            from app.optimization.road_route import get_road_route
            route_data = get_road_route(
                float(order.pickup_latitude),
                float(order.pickup_longitude),
                float(order.delivery_latitude),
                float(order.delivery_longitude),
            )
            trip.planned_route = route_data
            db.commit()
            db.refresh(trip)
        except Exception:
            pass

    return {
        "truck_id": truck_id,
        "trip_id": trip.id,
        "order_id": trip.order_id,
        "latitude": gps_record.latitude if gps_record else None,
        "longitude": gps_record.longitude if gps_record else None,
        "speed": gps_record.speed if gps_record else 0,
        "timestamp": gps_record.timestamp if gps_record else None,
        "trip_status": trip.status,
        "distance_km": trip.distance,
        "estimated_time": trip.estimated_time,
        "planned_route": trip.planned_route,
        "order": {
            "pickup_location": order.pickup_location if order else None,
            "delivery_location": order.delivery_location if order else None,
            "weight": order.weight if order else None,
            "pickup_latitude": order.pickup_latitude if order else None,
            "pickup_longitude": order.pickup_longitude if order else None,
            "delivery_latitude": order.delivery_latitude if order else None,
            "delivery_longitude": order.delivery_longitude if order else None,
        } if order else None,
    }


@router.get("/{truck_id}/eta")
def get_truck_eta(
    truck_id: int,
    db: Session = Depends(get_db)
):
    # Get latest GPS location
    gps_record = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.desc())
        .first()
    )

    if not gps_record:
        raise HTTPException(
            status_code=404,
            detail="GPS record not found for this truck"
        )

    # Get active trip
    trip = (
        db.query(Trip)
        .filter(
            Trip.truck_id == truck_id,
            Trip.status == "in_progress"
        )
        .order_by(Trip.id.desc())
        .first()
    )

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="No active trip found for this truck"
        )

    # Get order
    order = (
        db.query(Order)
        .filter(Order.id == trip.order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found for this trip"
        )

    if (
        order.delivery_latitude is None
        or order.delivery_longitude is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Delivery coordinates are missing"
        )

    # Convert coordinates
    lat1 = radians(float(gps_record.latitude))
    lon1 = radians(float(gps_record.longitude))

    lat2 = radians(float(order.delivery_latitude))
    lon2 = radians(float(order.delivery_longitude))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    # Haversine formula
    a = (
        sin(dlat / 2) ** 2
        + cos(lat1)
        * cos(lat2)
        * sin(dlon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a)
    )

    earth_radius = 6371.0

    remaining_distance = earth_radius * c

    # Use current GPS speed
    speed = gps_record.speed

    if speed <= 0:
        speed = 50

    estimated_hours = remaining_distance / speed

    estimated_minutes = estimated_hours * 60

    return {
        "truck_id": truck_id,
        "trip_id": trip.id,
        "order_id": order.id,
        "current_speed_kmh": speed,
        "remaining_distance_km": round(
            remaining_distance,
            2
        ),
               "estimated_time_minutes": (
            max(1, round(estimated_minutes))
            if remaining_distance > 0
            else 0
        ),
        "estimated_time_hours": round(
            estimated_hours,
            2
        )
    }

@router.get("/{truck_id}/route-deviation")
def check_route_deviation(
    truck_id: int,
    deviation_limit_km: float = 0.5,
    db: Session = Depends(get_db)
):
    gps_record = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.desc())
        .first()
    )

    if not gps_record:
        raise HTTPException(
            status_code=404,
            detail="GPS record not found for this truck"
        )

    trip = (
        db.query(Trip)
        .filter(
            Trip.truck_id == truck_id,
            Trip.status.in_(["planned", "in_progress"])
        )
        .order_by(Trip.id.desc())
        .first()
    )

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="No active trip found for this truck"
        )

    order = (
        db.query(Order)
        .filter(Order.id == trip.order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if (
        order.delivery_latitude is None
        or order.delivery_longitude is None
    ):
        return {
            "truck_id": truck_id,
            "trip_id": trip.id,
            "status": "no_delivery_coordinates",
            "message": "Delivery coordinates missing",
            "deviation": {
                "deviated": False,
                "distance_from_route_km": 0.0,
                "threshold_km": deviation_limit_km
            }
        }

    try:
        current_lat = float(gps_record.latitude)
        current_lon = float(gps_record.longitude)
        delivery_lat = float(order.delivery_latitude)
        delivery_lon = float(order.delivery_longitude)
    except (TypeError, ValueError):
        return {
            "truck_id": truck_id,
            "trip_id": trip.id,
            "status": "invalid_coordinates",
            "message": "Invalid coordinates",
            "deviation": {
                "deviated": False,
                "distance_from_route_km": 0.0,
                "threshold_km": deviation_limit_km
            }
        }

    # Compare current GPS location with the ORIGINAL planned route.
    if not isinstance(trip.planned_route, dict) or not trip.planned_route.get("coordinates"):
        # Attempt to calculate road route if pickup & delivery coords exist
        if order.pickup_latitude and order.pickup_longitude and order.delivery_latitude and order.delivery_longitude:
            try:
                from app.optimization.road_route import get_road_route
                route_data = get_road_route(
                    float(order.pickup_latitude),
                    float(order.pickup_longitude),
                    float(order.delivery_latitude),
                    float(order.delivery_longitude),
                )
                trip.planned_route = route_data
                db.commit()
                db.refresh(trip)
            except Exception:
                pass

    coordinates = trip.planned_route.get("coordinates", []) if isinstance(trip.planned_route, dict) else []

    if not coordinates:
        return {
            "truck_id": truck_id,
            "trip_id": trip.id,
            "status": "no_planned_route",
            "message": "Planned route not yet computed",
            "deviation": {
                "deviated": False,
                "distance_from_route_km": 0.0,
                "threshold_km": deviation_limit_km
            }
        }

    current_lat = float(gps_record.latitude)
    current_lon = float(gps_record.longitude)


    # Find the shortest distance to any planned route segment.
    min_deviation_km = float("inf")

    if len(coordinates) == 1:
        route_lon, route_lat = coordinates[0]

        min_deviation_km = distance_to_segment_km(
            current_lat,
            current_lon,
            float(route_lat),
            float(route_lon),
            float(route_lat),
            float(route_lon)
        )
    else:
        for i in range(len(coordinates) - 1):
            start_lon, start_lat = coordinates[i]
            end_lon, end_lat = coordinates[i + 1]

            distance_km = distance_to_segment_km(
                current_lat,
                current_lon,
                float(start_lat),
                float(start_lon),
                float(end_lat),
                float(end_lon)
            )

            min_deviation_km = min(
                min_deviation_km,
                distance_km
            )

    is_deviated = min_deviation_km > deviation_limit_km


    for point in coordinates:
        route_lon, route_lat = float(point[0]), float(point[1])

        lat1 = radians(current_lat)
        lon1 = radians(current_lon)
        lat2 = radians(route_lat)
        lon2 = radians(route_lon)

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = (
            sin(dlat / 2) ** 2
            + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        )

        c = 2 * atan2(
            sqrt(a),
            sqrt(max(0.0, 1 - a))
        )

        distance_km = 6371.0 * c
        min_deviation_km = min(
            min_deviation_km,
            distance_km
        )

    is_deviated = min_deviation_km > deviation_limit_km

    return {
        "truck_id": truck_id,
        "trip_id": trip.id,
        "order_id": trip.order_id,
        "deviation_distance_km": round(min_deviation_km, 3),
        "deviation_limit_km": deviation_limit_km,
        "planned_route_distance_km": trip.planned_route.get(
            "distance_km"
        ),
        "route_points": len(coordinates),
        "status": "deviated" if is_deviated else "on_route"
    }


@router.get("/{truck_id}/direction")
def get_truck_direction(
    truck_id: int,
    db: Session = Depends(get_db)
):
    records = (
        db.query(GPSTracking)
        .filter(GPSTracking.truck_id == truck_id)
        .order_by(GPSTracking.id.desc())
        .limit(2)
        .all()
    )

    if len(records) < 2:
        raise HTTPException(
            status_code=404,
            detail="At least two GPS records are required"
        )

    current = records[0]
    previous = records[1]

    try:
        prev_lat = float(previous.latitude.strip())
        prev_lon = float(previous.longitude.strip())
        curr_lat = float(current.latitude.strip())
        curr_lon = float(current.longitude.strip())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail="GPS coordinates must be numeric"
        )

    if not (
        -90 <= prev_lat <= 90
        and -90 <= curr_lat <= 90
        and -180 <= prev_lon <= 180
        and -180 <= curr_lon <= 180
    ):
        raise HTTPException(
            status_code=400,
            detail="GPS coordinates are out of range"
        )

    north_south = curr_lat - prev_lat
    east_west = curr_lon - prev_lon

    # Ignore tiny changes caused by GPS measurement noise.
    threshold = 0.00001

    if abs(north_south) < threshold:
        north_south = 0

    # Handle longitude wrapping near the International Date Line.
    east_west = (
        (east_west + 180) % 360
    ) - 180

    if abs(east_west) < threshold:
        east_west = 0

    if north_south == 0 and east_west == 0:
        direction = "stationary_or_no_significant_change"
    else:
        parts = []

        if north_south > 0:
            parts.append("north")
        elif north_south < 0:
            parts.append("south")

        if east_west > 0:
            parts.append("east")
        elif east_west < 0:
            parts.append("west")

        direction = "-".join(parts)

    return {
        "truck_id": truck_id,
        "previous_gps_id": previous.id,
        "current_gps_id": current.id,
        "direction": direction,
        "latitude_change": round(
            curr_lat - prev_lat, 6
        ),
        "longitude_change": round(
            east_west, 6
        )
    }
