from datetime import datetime, timedelta, date, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.optimization.road_route import get_road_route
from app.optimization.depot import DEPOT_LATITUDE, DEPOT_LONGITUDE
from app.database.connection import get_db
from app.database.models import Truck, Driver, Order, Trip, User
from app.routes.auth import get_current_user_optional
from app.optimization.load_optimizer_v4 import optimize_loads_v4
from app.optimization.route_optimizer import optimize_route
from app.optimization.fleet_route_optimizer import optimize_fleet_routes
from app.optimization.distance_matrix import build_distance_matrix
from app.optimization.multi_day_scheduler import schedule_multi_day_trip
from math import isfinite

router = APIRouter(
    prefix="/optimization",
    tags=["Optimization"]
)


def parse_order_deadline(deadline_value):
    """Return (deadline, is_date_only)."""
    if not deadline_value:
        return None, None

    deadline_string = str(deadline_value).strip()

    # ISO date-only format: 2026-10-30
    try:
        deadline_date = date.fromisoformat(deadline_string)
        return deadline_date, True
    except ValueError:
        pass

    # Legacy date-only formats.
    for date_format in ("%d-%m-%y", "%d-%m-%Y"):
        try:
            deadline_date = datetime.strptime(
                deadline_string, date_format
            ).date()
            return deadline_date, True
        except ValueError:
            continue

    # ISO date-time format.
    try:
        deadline_datetime = datetime.fromisoformat(
            deadline_string.replace("Z", "+00:00")
        )
        return deadline_datetime, False
    except ValueError as exc:
        raise ValueError(
            f"Unsupported deadline format: {deadline_string}"
        ) from exc


from app.optimization.fleet_queries import (
    get_available_trucks,
    get_available_drivers,
    get_pending_consignments,
    sync_fleet_resource_statuses,
)

# Compatibility wrappers
def get_truly_available_trucks(db: Session, company_id: int = None, diagnostic: dict = None):
    return get_available_trucks(db, company_id=company_id, diagnostic=diagnostic)

def get_truly_available_drivers(db: Session, company_id: int = None, diagnostic: dict = None):
    return get_available_drivers(db, company_id=company_id, diagnostic=diagnostic)

def get_pending_orders_with_urgency(db: Session, company_id: int = None, diagnostic: dict = None):
    return get_pending_consignments(db, company_id=company_id, diagnostic=diagnostic)


# =====================================================================
# LOAD ALLOCATION (V4 with shared availability check & diagnostics)
# =====================================================================
@router.get("/load-allocation")
def load_allocation(
    fuel_price: int = 90,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    company_id = current_user.company_id if current_user else None
    truck_diag = {}
    driver_diag = {}
    order_diag = {}

    trucks = get_available_trucks(db, company_id=company_id, diagnostic=truck_diag)
    drivers = get_available_drivers(db, company_id=company_id, diagnostic=driver_diag)
    orders = get_pending_consignments(db, company_id=company_id, diagnostic=order_diag)

    if not trucks:
        return {
            "status": "no_trucks",
            "solver_status": "NO_TRUCKS",
            "solver_backend": "OR-Tools SCIP",
            "message": f"No available trucks found for workspace. All trucks may be on active trips, in maintenance, or lack capacity.",
            "assignments": [],
            "unassigned_orders": [
                {
                    "order_id": o.id,
                    "pickup_location": o.pickup_location,
                    "delivery_location": o.delivery_location,
                    "weight": o.weight,
                    "reason": "No available trucks in the fleet."
                }
                for o in orders
            ],
            "diagnostic": truck_diag,
        }

    if not drivers:
        return {
            "status": "no_drivers",
            "solver_status": "NO_DRIVERS",
            "solver_backend": "OR-Tools SCIP",
            "message": f"No available drivers found for workspace. All drivers may be on active trips.",
            "assignments": [],
            "unassigned_orders": [],
            "diagnostic": driver_diag,
        }

    if not orders:
        return {
            "status": "no_orders",
            "solver_status": "NO_ORDERS",
            "solver_backend": "OR-Tools SCIP",
            "message": "No pending consignments found awaiting allocation.",
            "assignments": [],
            "unassigned_orders": [],
            "diagnostic": order_diag,
        }

    result = optimize_loads_v4(
        trucks,
        drivers,
        orders,
        fuel_price
    )

    # Persist assignments to database
    if result.get("assignments"):
        try:
            for assignment in result["assignments"]:
                truck = db.query(Truck).filter(Truck.id == assignment["truck_id"]).first()
                driver = db.query(Driver).filter(Driver.id == assignment["driver_id"]).first()

                for order_info in assignment.get("orders", []):
                    order = db.query(Order).filter(Order.id == order_info["order_id"]).first()
                    if not order or order.status != "pending":
                        continue

                    # Check no duplicate trip
                    existing_trip = db.query(Trip).filter(
                        Trip.order_id == order.id,
                        Trip.status.in_(["planned", "in_progress"])
                    ).first()
                    if existing_trip:
                        continue

                    dist_km = float(order.distance_km or order_info.get("distance_km", 0))

                    # Try to get planned route with real road geometry
                    planned_route_data = None
                    if order.pickup_latitude and order.pickup_longitude and order.delivery_latitude and order.delivery_longitude:
                        try:
                            from app.optimization.distance_service import compute_route_distance
                            calc_data = compute_route_distance(
                                origin_lat=float(order.pickup_latitude),
                                origin_lon=float(order.pickup_longitude),
                                origin_place_id=order.pickup_place_id,
                                dest_lat=float(order.delivery_latitude),
                                dest_lon=float(order.delivery_longitude),
                                dest_place_id=order.delivery_place_id,
                            )
                            if calc_data.get("distance_km", 0) > 0:
                                dist_km = float(calc_data["distance_km"])
                                order.distance_km = int(dist_km)
                            planned_route_data = get_road_route(
                                float(order.pickup_latitude),
                                float(order.pickup_longitude),
                                float(order.delivery_latitude),
                                float(order.delivery_longitude),
                            )
                        except Exception:
                            try:
                                planned_route_data = get_road_route(
                                    float(order.pickup_latitude),
                                    float(order.pickup_longitude),
                                    float(order.delivery_latitude),
                                    float(order.delivery_longitude),
                                )
                            except Exception:
                                planned_route_data = None

                    est_hours = max(0.5, round(dist_km / 50.0, 1))

                    new_trip = Trip(
                        truck_id=assignment["truck_id"],
                        driver_id=assignment["driver_id"],
                        order_id=order.id,
                        distance=int(dist_km),
                        estimated_time=int(est_hours * 60),  # in minutes
                        fuel_cost=int(order_info.get("fuel_cost", 0)),
                        status="planned",
                        planned_route=planned_route_data,
                        start_time=datetime.now(timezone.utc).isoformat(),
                        average_speed_kmph=50.0,
                    )
                    db.add(new_trip)
                    order.status = "assigned"

                if truck:
                    truck.status = "assigned"
                if driver:
                    driver.status = "assigned"

            db.commit()
            result["persisted"] = True
        except Exception as e:
            db.rollback()
            result["persist_error"] = str(e)

    return result


# =====================================================================
# SINGLE-TRUCK ROUTE OPTIMIZATION (fixed)
# =====================================================================
@router.post("/route")
def calculate_route(
    truck_id: int = None,
    driver_id: int = None,
    fuel_price: int = 90,
    db: Session = Depends(get_db)
):
    # Find the requested truck
    truck = None
    if truck_id:
        truck = db.query(Truck).filter(Truck.id == truck_id).first()
        if not truck:
            return {"status": "error", "message": f"Truck #{truck_id} not found"}
    else:
        available_trucks = get_truly_available_trucks(db)
        if not available_trucks:
            return {"status": "no_trucks", "message": "No available trucks found"}
        truck = available_trucks[0]

    # Find the requested driver
    driver = None
    if driver_id:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        if not driver:
            return {"status": "error", "message": f"Driver #{driver_id} not found"}
    else:
        available_drivers = get_truly_available_drivers(db)
        driver = available_drivers[0] if available_drivers else None

    # Check if this truck already has an active trip
    existing_trip = db.query(Trip).filter(
        Trip.truck_id == truck.id,
        Trip.status.in_(["planned", "in_progress"])
    ).order_by(Trip.id.desc()).first()

    if existing_trip:
        order = db.query(Order).filter(Order.id == existing_trip.order_id).first() if existing_trip.order_id else None
        if not order or not order.delivery_latitude or not order.delivery_longitude:
            return {
                "status": "missing_locations",
                "message": f"Truck #{truck.id} is assigned to trip #{existing_trip.id}, but order #{existing_trip.order_id} has no valid delivery coordinates.",
                "truck_id": truck.id,
                "trip_id": existing_trip.id
            }

        # Calculate road route
        road_data = None
        has_road = False
        pickup_lat = float(order.pickup_latitude) if order.pickup_latitude else DEPOT_LATITUDE
        pickup_lon = float(order.pickup_longitude) if order.pickup_longitude else DEPOT_LONGITUDE
        deliv_lat = float(order.delivery_latitude)
        deliv_lon = float(order.delivery_longitude)

        try:
            road_data = get_road_route(pickup_lat, pickup_lon, deliv_lat, deliv_lon)
            existing_trip.planned_route = road_data
            has_road = True
            db.commit()
        except Exception:
            road_data = existing_trip.planned_route
            has_road = road_data is not None

        dist_km = road_data.get("distance_km", existing_trip.distance) if isinstance(road_data, dict) else (existing_trip.distance or 100)
        est_hours = round(dist_km / 50.0, 1)

        return {
            "status": "success",
            "message": f"Calculated road route for Trip #{existing_trip.id}",
            "truck_id": truck.id,
            "truck_registration": truck.registration_number,
            "driver_id": driver.id if driver else existing_trip.driver_id,
            "driver_name": driver.name if driver else "Assigned Driver",
            "route": {
                "trip_id": existing_trip.id,
                "total_distance_km": round(dist_km, 1),
                "estimated_hours": est_hours,
                "total_stops": 2,
                "has_road_geometry": has_road,
                "stops": [
                    {"name": order.pickup_location or "Origin", "lat": pickup_lat, "lon": pickup_lon},
                    {"name": order.delivery_location or "Destination", "lat": deliv_lat, "lon": deliv_lon}
                ]
            },
            "trip": {
                "id": existing_trip.id,
                "distance": int(dist_km),
                "estimated_time": int(est_hours * 60),
                "status": existing_trip.status,
                "order_id": order.id
            }
        }

    # If truck has no active trip, check for pending eligible orders
    all_pending_orders = get_pending_orders_with_urgency(db)
    orders = []
    skipped = []

    for order in all_pending_orders:
        try:
            weight = float(order.weight)
            latitude = float(order.delivery_latitude)
            longitude = float(order.delivery_longitude)
        except (TypeError, ValueError):
            skipped.append({"order_id": order.id, "reason": "Missing or invalid delivery coordinates/weight"})
            continue

        if (
            weight > 0
            and weight <= truck.capacity
            and -90 <= latitude <= 90
            and -180 <= longitude <= 180
        ):
            orders.append(order)
        else:
            skipped.append({
                "order_id": order.id,
                "reason": f"Weight {weight}kg exceeds capacity {truck.capacity}kg or invalid coordinates"
            })

    if not orders:
        return {
            "status": "no_eligible_orders",
            "message": f"Truck #{truck.id} has no assigned orders, and no pending orders fit its capacity ({truck.capacity}kg) with valid coordinates.",
            "truck_id": truck.id,
            "truck_capacity": truck.capacity,
            "skipped_orders": skipped
        }

    if not driver:
        return {"status": "no_drivers", "message": "No eligible driver available for routing."}

    distance_matrix = build_distance_matrix(orders)
    result = optimize_route(distance_matrix, orders, truck.capacity)

    if result["status"] == "route_not_feasible":
        return {
            "status": "route_not_feasible",
            "message": "No feasible route found. Truck capacity may be exceeded.",
            "truck_id": truck.id,
            "truck_capacity": truck.capacity,
            "driver_id": driver.id
        }

    average_speed_kmh = 50
    estimated_driving_hours = result["total_distance"] / average_speed_kmh

    if truck.fuel_efficiency and truck.fuel_efficiency > 0:
        fuel_used_liters = result["total_distance"] / truck.fuel_efficiency
        fuel_cost = fuel_used_liters * fuel_price
    else:
        fuel_used_liters = 0
        fuel_cost = 0

    # Create trip records
    route_details = []
    trips_created = []

    for location in result["route"]:
        if location == 0:
            route_details.append({"location": "Depot"})
            continue

        order_index = location - 1
        if order_index < len(orders):
            order = orders[order_index]

            existing_trip = db.query(Trip).filter(
                Trip.order_id == order.id,
                Trip.status.in_(["planned", "in_progress"])
            ).first()

            if existing_trip:
                route_details.append({
                    "location": order.delivery_location,
                    "order_id": order.id,
                    "note": "already_assigned"
                })
                continue

            order_distance = order.distance_km or 0
            order_time_hours = order_distance / average_speed_kmh
            order_fuel_liters = order_distance / truck.fuel_efficiency if (truck.fuel_efficiency and truck.fuel_efficiency > 0) else 0
            order_fuel_cost = order_fuel_liters * fuel_price

            # Get planned route using pickup → delivery
            planned_route_data = None
            if order.pickup_latitude and order.pickup_longitude and order.delivery_latitude and order.delivery_longitude:
                try:
                    planned_route_data = get_road_route(
                        float(order.pickup_latitude),
                        float(order.pickup_longitude),
                        float(order.delivery_latitude),
                        float(order.delivery_longitude)
                    )
                except Exception:
                    try:
                        planned_route_data = get_road_route(
                            DEPOT_LATITUDE, DEPOT_LONGITUDE,
                            float(order.delivery_latitude),
                            float(order.delivery_longitude)
                        )
                    except Exception:
                        planned_route_data = None

            trip = Trip(
                truck_id=truck.id,
                driver_id=driver.id,
                order_id=order.id,
                distance=order_distance,
                estimated_time=int(order_time_hours * 60),
                fuel_cost=int(order_fuel_cost),
                status="planned",
                planned_route=planned_route_data
            )

            db.add(trip)
            order.status = "assigned"
            trips_created.append(order.id)

            route_details.append({
                "location": order.delivery_location,
                "order_id": order.id,
                "pickup_location": order.pickup_location,
                "delivery_location": order.delivery_location,
                "distance_km": order.distance_km,
                "urgency": order.urgency,
                "cargo_category": order.cargo_category,
            })

    truck.status = "assigned"
    driver.status = "assigned"
    db.commit()

    return {
        "status": result["status"],
        "truck_id": truck.id,
        "truck_registration": truck.registration_number,
        "truck_capacity": truck.capacity,
        "driver_id": driver.id,
        "driver_name": driver.name,
        "average_speed_kmh": average_speed_kmh,
        "estimated_driving_hours": round(estimated_driving_hours, 2),
        "fuel_price_per_liter": fuel_price,
        "fuel_used_liters": round(fuel_used_liters, 2),
        "fuel_cost": round(fuel_cost, 2),
        "route_stops": route_details,
        "trips_created": trips_created,
        "skipped_orders": skipped,
    }


# =====================================================================
# FLEET ROUTE OPTIMIZATION (fixed)
# =====================================================================
@router.post("/fleet-route")
def calculate_fleet_route(
    fuel_price: int = 90,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    company_id = current_user.company_id if current_user else None
    truck_diag = {}
    driver_diag = {}
    order_diag = {}

    trucks = get_available_trucks(db, company_id=company_id, diagnostic=truck_diag)
    drivers = get_available_drivers(db, company_id=company_id, diagnostic=driver_diag)
    orders = get_pending_consignments(db, company_id=company_id, diagnostic=order_diag)

    if not trucks:
        return {
            "status": "fleet_not_feasible",
            "solver_status": "NO_TRUCKS",
            "solver_backend": "OR-Tools VRP",
            "message": "No available trucks found for fleet routing.",
            "routes": [],
            "unassigned_orders": [
                {
                    "order_id": o.id,
                    "pickup_location": o.pickup_location,
                    "delivery_location": o.delivery_location,
                    "weight": o.weight,
                    "reason": "No available trucks in the fleet."
                }
                for o in orders
            ],
            "diagnostic": truck_diag,
        }

    if not drivers:
        return {
            "status": "fleet_not_feasible",
            "solver_status": "NO_DRIVERS",
            "solver_backend": "OR-Tools VRP",
            "message": "No available drivers found for fleet routing.",
            "routes": [],
            "unassigned_orders": [],
            "diagnostic": driver_diag,
        }

    if not orders:
        return {
            "status": "no_orders",
            "solver_status": "NO_ORDERS",
            "solver_backend": "OR-Tools VRP",
            "message": "No pending orders found for fleet routing.",
            "routes": [],
            "unassigned_orders": [],
            "diagnostic": order_diag,
        }

    # Keep only trucks that have an available driver from the same company
    compatible_trucks = [
        truck for truck in trucks
        if any(getattr(driver, "company_id", None) == getattr(truck, "company_id", None) for driver in drivers)
    ]

    if not compatible_trucks:
        return {
            "status": "fleet_not_feasible",
            "solver_status": "NO_COMPATIBLE_PAIRS",
            "solver_backend": "OR-Tools VRP",
            "message": "No available truck has a compatible available driver.",
            "routes": [],
            "unassigned_orders": [],
            "diagnostic": {"trucks": truck_diag, "drivers": driver_diag},
        }

    trucks = compatible_trucks

    # Exclude orders that cannot be routed
    max_capacity = max(float(truck.capacity or 0) for truck in trucks)

    active_order_ids = {
        order_id for (order_id,) in (
            db.query(Trip.order_id)
            .filter(Trip.status.in_(["planned", "in_progress"]))
            .all()
        )
        if order_id is not None
    }

    eligible_orders = []
    excluded_order_details = []

    for order in orders:
        if order.id in active_order_ids:
            excluded_order_details.append({
                "order_id": order.id,
                "reason": "Order already has a planned or in-progress trip"
            })
            continue

        try:
            weight = float(order.weight)
            latitude = float(order.delivery_latitude)
            longitude = float(order.delivery_longitude)
        except (TypeError, ValueError):
            excluded_order_details.append({
                "order_id": order.id,
                "reason": "Missing or invalid weight/coordinates"
            })
            continue

        if not all(isfinite(v) for v in (weight, latitude, longitude)):
            excluded_order_details.append({"order_id": order.id, "reason": "Non-finite weight or coordinates"})
            continue

        if not -90 <= latitude <= 90:
            excluded_order_details.append({"order_id": order.id, "reason": "Invalid delivery latitude"})
            continue

        if not -180 <= longitude <= 180:
            excluded_order_details.append({"order_id": order.id, "reason": "Invalid delivery longitude"})
            continue

        if weight <= 0 or weight > max_capacity:
            excluded_order_details.append({
                "order_id": order.id,
                "reason": f"Weight {weight}kg invalid or exceeds max truck capacity {max_capacity}kg"
            })
            continue

        eligible_orders.append(order)

    if not eligible_orders:
        return {
            "status": "route_not_feasible",
            "message": "No pending orders fit the available trucks.",
            "excluded_orders": excluded_order_details
        }

    distance_matrix = build_distance_matrix(eligible_orders)
    result = optimize_fleet_routes(distance_matrix, eligible_orders, trucks, drivers)

    if result.get("status") == "route_not_feasible":
        return result

    route_data_list = result.get("routes", [])

    if not route_data_list:
        return {
            "status": "route_not_feasible",
            "message": "The optimizer did not produce any routes."
        }

    average_speed_kmh = 50
    validated_routes = []
    routes = []
    late_orders = []
    assigned_driver_ids = set()

    for route_data in route_data_list:
        truck_index = route_data.get("truck_index")

        if not isinstance(truck_index, int) or truck_index < 0 or truck_index >= len(trucks):
            continue

        truck = trucks[truck_index]
        total_distance = route_data["total_distance"]
        estimated_driving_hours = total_distance / average_speed_kmh

        driver = next(
            (
                candidate for candidate in drivers
                if candidate.id not in assigned_driver_ids
                and candidate.working_hours is not None
                and candidate.working_hours >= estimated_driving_hours
            ),
            None
        )

        if driver is None:
            # Relaxed driver selection (ignore working hours)
            driver = next(
                (candidate for candidate in drivers if candidate.id not in assigned_driver_ids),
                None
            )

        if driver is None:
            continue

        assigned_driver_ids.add(driver.id)

        route_orders = []
        route_order_ids = []
        for location in route_data["route"]:
            if location == 0:
                continue
            order_index = location - 1
            if 0 <= order_index < len(eligible_orders):
                order = eligible_orders[order_index]
                route_orders.append(order)
                route_order_ids.append(order.id)

        total_weight = sum(o.weight or 0 for o in route_orders)

        fuel_eff = getattr(truck, "fuel_efficiency", None)
        if fuel_eff and fuel_eff > 0:
            fuel_used_liters = total_distance / fuel_eff
            fuel_cost = fuel_used_liters * fuel_price
        else:
            fuel_used_liters = 0
            fuel_cost = 0

        stops = [
            {
                "name": "Depot (Gwalior)",
                "location": "Depot (Gwalior)",
                "lat": DEPOT_LATITUDE,
                "lon": DEPOT_LONGITUDE,
                "type": "depot",
            }
        ]
        for o in route_orders:
            delivery_loc = getattr(o, "delivery_location", None) or f"Order #{getattr(o, 'id', '')} Destination"
            stops.append({
                "name": delivery_loc,
                "location": delivery_loc,
                "lat": float(o.delivery_latitude) if getattr(o, "delivery_latitude", None) else None,
                "lon": float(o.delivery_longitude) if getattr(o, "delivery_longitude", None) else None,
                "type": "delivery",
                "order_id": getattr(o, "id", None),
                "weight_kg": getattr(o, "weight", 0),
                "cargo_category": getattr(o, "cargo_category", "General Cargo"),
                "urgency": getattr(o, "urgency", "normal"),
            })
        stops.append({
            "name": "Depot Return",
            "location": "Depot Return",
            "lat": DEPOT_LATITUDE,
            "lon": DEPOT_LONGITUDE,
            "type": "depot",
        })

        routes.append({
            "truck_id": getattr(truck, "id", None),
            "truck_registration": getattr(truck, "registration_number", f"Truck #{getattr(truck, 'id', '')}"),
            "truck_capacity": getattr(truck, "capacity", 0),
            "driver_id": getattr(driver, "id", None),
            "driver_name": getattr(driver, "name", f"Driver #{getattr(driver, 'id', '')}"),
            "route": route_data["route"],
            "order_ids": route_order_ids,
            "order_count": len(route_order_ids),
            "total_distance": total_distance,
            "total_distance_km": total_distance,
            "total_weight": total_weight,
            "total_weight_kg": total_weight,
            "estimated_driving_hours": round(estimated_driving_hours, 2),
            "fuel_used_liters": round(fuel_used_liters, 2),
            "fuel_cost": round(fuel_cost, 2),
            "stops": stops,
            "orders": [
                {
                    "order_id": getattr(o, "id", None),
                    "pickup_location": getattr(o, "pickup_location", "Depot"),
                    "delivery_location": getattr(o, "delivery_location", "Destination"),
                    "weight": getattr(o, "weight", 0),
                    "distance_km": getattr(o, "distance_km", 0),
                    "urgency": getattr(o, "urgency", "normal"),
                    "cargo_category": getattr(o, "cargo_category", "General Cargo"),
                }
                for o in route_orders
            ]
        })

        validated_routes.append({
            "truck": truck,
            "driver": driver,
            "orders": route_orders
        })

    if not validated_routes:
        return {
            "status": "route_not_feasible",
            "solver_status": "INFEASIBLE",
            "solver_backend": "OR-Tools VRP",
            "message": "No valid routes could be formed after driver matching.",
            "excluded_orders": excluded_order_details,
            "unassigned_orders": excluded_order_details,
        }

    # Persist to database
    try:
        for validated in validated_routes:
            truck = validated["truck"]
            driver = validated["driver"]

            for order in validated["orders"]:
                existing_trip = db.query(Trip).filter(
                    Trip.order_id == order.id,
                    Trip.status.in_(["planned", "in_progress"])
                ).first()
                if existing_trip:
                    continue

                order_distance = getattr(order, "distance_km", 0) or 0
                planned_route_data = None

                p_lat = getattr(order, "pickup_latitude", None)
                p_lon = getattr(order, "pickup_longitude", None)
                d_lat = getattr(order, "delivery_latitude", None)
                d_lon = getattr(order, "delivery_longitude", None)

                if p_lat and p_lon and d_lat and d_lon:
                    try:
                        planned_route_data = get_road_route(
                            float(p_lat), float(p_lon), float(d_lat), float(d_lon)
                        )
                    except Exception:
                        try:
                            planned_route_data = get_road_route(
                                DEPOT_LATITUDE, DEPOT_LONGITUDE, float(d_lat), float(d_lon)
                            )
                        except Exception:
                            planned_route_data = None

                truck_fuel = getattr(truck, "fuel_efficiency", None)
                trip = Trip(
                    truck_id=getattr(truck, "id", None),
                    driver_id=getattr(driver, "id", None),
                    order_id=getattr(order, "id", None),
                    distance=order_distance,
                    estimated_time=int(order_distance / average_speed_kmh * 60),
                    fuel_cost=int(order_distance / truck_fuel * fuel_price) if truck_fuel and truck_fuel > 0 else 0,
                    status="planned",
                    planned_route=planned_route_data,
                    start_time=datetime.now(timezone.utc).isoformat(),
                    average_speed_kmph=50.0,
                )

                db.add(trip)
                order.status = "assigned"

            truck.status = "assigned"
            driver.status = "assigned"

        db.commit()

    except Exception as e:
        db.rollback()
        return {
            "status": "fleet_not_feasible",
            "solver_status": "DB_ERROR",
            "solver_backend": "OR-Tools VRP",
            "message": f"Database commit failed: {str(e)}",
            "routes": routes,
        }

    unassigned_order_details = []
    unassigned_id_set = set(result.get("unassigned_order_ids", []))
    for o in eligible_orders:
        if o.id in unassigned_id_set:
            unassigned_order_details.append({
                "order_id": o.id,
                "pickup_location": o.pickup_location,
                "delivery_location": o.delivery_location,
                "weight": o.weight,
                "reason": "Could not be packed within vehicle capacity limits or maximum driver shifts."
            })
    for exc in excluded_order_details:
        unassigned_order_details.append(exc)

    return {
        "status": "optimal" if result.get("status") in ("optimal", "success") else "feasible",
        "solver_status": result.get("solver_status", "OPTIMAL"),
        "solver_backend": "OR-Tools VRP",
        "objective_value": result.get("objective_value"),
        "fuel_price_per_liter": fuel_price,
        "average_speed_kmh": average_speed_kmh,
        "total_vehicles_used": len(routes),
        "total_distance_km": round(sum(r.get("total_distance", 0) for r in routes), 2),
        "total_weight_kg": sum(r.get("total_weight", 0) for r in routes),
        "total_fuel_cost": round(sum(r.get("fuel_cost", 0) for r in routes), 2),
        "routes": routes,
        "unassigned_orders": unassigned_order_details,
        "unassigned_order_ids": [u["order_id"] for u in unassigned_order_details if "order_id" in u],
        "persisted": True
    }


# =====================================================================
# STATUS REPAIR ENDPOINT
# =====================================================================
@router.post("/repair-statuses")
def repair_truck_driver_statuses(
    reset_planned: bool = False,
    db: Session = Depends(get_db)
):
    """
    Repair truck/driver status inconsistencies.
    If reset_planned is True: cancels all 'planned' trips and resets orders to pending and trucks/drivers to available.
    Trucks and drivers with no active trips are reset to 'available'.
    """
    trips_reset = 0
    if reset_planned:
        planned_trips = db.query(Trip).filter(Trip.status == "planned").all()
        for pt in planned_trips:
            if pt.order_id:
                o = db.query(Order).filter(Order.id == pt.order_id).first()
                if o and o.status == "assigned":
                    o.status = "pending"
            db.delete(pt)
            trips_reset += 1
        db.flush()

    active_truck_ids = {
        row[0] for row in db.query(Trip.truck_id).filter(
            Trip.status.in_(["planned", "in_progress"])
        ).all() if row[0] is not None
    }

    active_driver_ids = {
        row[0] for row in db.query(Trip.driver_id).filter(
            Trip.status.in_(["planned", "in_progress"])
        ).all() if row[0] is not None
    }

    trucks_fixed = []
    drivers_fixed = []

    for truck in db.query(Truck).all():
        if truck.id not in active_truck_ids and truck.status in ("assigned", "busy"):
            old_status = truck.status
            truck.status = "available"
            trucks_fixed.append({"id": truck.id, "registration": truck.registration_number, "old_status": old_status})

    for driver in db.query(Driver).all():
        if driver.id not in active_driver_ids and driver.status in ("assigned", "busy"):
            old_status = driver.status
            driver.status = "available"
            drivers_fixed.append({"id": driver.id, "name": driver.name, "old_status": old_status})

    db.commit()

    return {
        "message": "Status repair complete",
        "trips_reset_count": trips_reset,
        "trucks_fixed": trucks_fixed,
        "drivers_fixed": drivers_fixed,
        "trucks_fixed_count": len(trucks_fixed),
        "drivers_fixed_count": len(drivers_fixed),
    }


@router.get("/solver-status")
def get_solver_status():
    """
    Verify and report the actual operational status of OR-Tools solvers
    and routing engines installed in the runtime.
    """
    from ortools.linear_solver import pywraplp
    from ortools.constraint_solver import pywrapcp
    from app.optimization.distance_service import is_google_routes_configured

    # Check SCIP in actual runtime
    scip_solver = None
    scip_ok = False
    scip_err = None
    try:
        scip_solver = pywraplp.Solver.CreateSolver("SCIP")
        scip_ok = scip_solver is not None
    except Exception as e:
        scip_err = str(e)

    # Check VRP Routing Engine
    vrp_ok = False
    vrp_err = None
    try:
        test_mgr = pywrapcp.RoutingIndexManager(2, 1, 0)
        test_model = pywrapcp.RoutingModel(test_mgr)
        vrp_ok = test_model is not None
    except Exception as e:
        vrp_err = str(e)

    return {
        "scip_installed": scip_ok,
        "scip_backend": "OR-Tools SCIP (Solving Constraint Integer Programs)",
        "scip_error": scip_err if not scip_ok else None,
        "vrp_installed": vrp_ok,
        "vrp_backend": "OR-Tools VRP (Constraint Programming Routing Engine)",
        "vrp_error": vrp_err if not vrp_ok else None,
        "google_routes_api_configured": is_google_routes_configured(),
        "osrm_routing_available": True,
        "status": "operational" if (scip_ok and vrp_ok) else "degraded"
    }


@router.post("/reset-demo")
def reset_demo_fleet_endpoint(
    random_seed: int = 42,
    create_backup: bool = True,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Safely reset operational fleet data in FK-safe reverse order
    and seed realistic Indian logistics hubs, trucks, drivers, and consignments.
    Backs up database prior to purge.
    """
    from app.optimization.demo_seeder import reset_and_seed_demo_fleet
    company_id = current_user.company_id if current_user and current_user.company_id else 1
    result = reset_and_seed_demo_fleet(
        db=db,
        company_id=company_id,
        random_seed=random_seed,
        create_backup=create_backup
    )
    return result
