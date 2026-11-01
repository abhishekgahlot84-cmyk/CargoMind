from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.optimization.multi_day_scheduler import schedule_multi_day_trip
from app.optimization.driver_rotation import build_driver_rotation_schedule
from app.database.connection import get_db
from app.database.models import (
    Trip,
    Order,
    Driver,
    Truck,
    TripDriverAssignment,
    User,
)
from app.routes.auth import get_current_user_optional

router = APIRouter(
    prefix="/trips",
    tags=["Trips"]
)
class DriverAssignmentCreate(BaseModel):
    driver_id: int
    segment_start_km: float = Field(ge=0)
    segment_end_km: float = Field(gt=0)
    start_time: datetime
    end_time: datetime

class AutomaticDriverAllocation(BaseModel):
    start_datetime: datetime

class TripTruckUpdate(BaseModel):
    truck_id: int = Field(gt=0)

@router.patch("/{trip_id}/truck")
def update_trip_truck(
    trip_id: int,
    request: TripTruckUpdate,
    db: Session = Depends(get_db),
):
    # 1. Find the trip.
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found",
        )

    # 2. Do not change the truck after driver
    # rotation assignments have been saved.
    existing_assignment = db.query(
        TripDriverAssignment
    ).filter(
        TripDriverAssignment.trip_id == trip_id
    ).first()

    if existing_assignment:
        raise HTTPException(
            status_code=409,
            detail=(
                "Trip already has driver assignments. "
                "Truck cannot be changed."
            ),
        )

    # 3. Find the order and its company.
    order = db.query(Order).filter(
        Order.id == trip.order_id
    ).first()

    if not order or not order.company_id:
        raise HTTPException(
            status_code=409,
            detail="Trip order is not linked to a company.",
        )

    # 4. Find the requested truck.
    truck = db.query(Truck).filter(
        Truck.id == request.truck_id
    ).first()

    if not truck:
        raise HTTPException(
            status_code=404,
            detail="Truck not found",
        )

    # 5. Verify company ownership.
    if truck.company_id != order.company_id:
        raise HTTPException(
            status_code=409,
            detail="Truck must belong to the order's company.",
        )

    # 6. Verify truck capacity.
    if (truck.capacity or 0) < (order.weight or 0):
        raise HTTPException(
            status_code=409,
            detail="Truck capacity is insufficient for this order.",
        )

    # 7. Check whether another active trip reserves this truck.
    active_statuses = ["planned", "in_progress"]

    busy_trip = db.query(Trip).filter(
        Trip.truck_id == truck.id,
        Trip.id != trip.id,
        Trip.status.in_(active_statuses),
    ).first()

    if busy_trip:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Truck is already reserved by trip "
                f"{busy_trip.id}."
            ),
        )

    # 8. Update and commit.
    old_truck_id = trip.truck_id
    trip.truck_id = truck.id

    try:
        db.commit()
        db.refresh(trip)
    except Exception:
        db.rollback()
        raise

    # Release the old truck only if no other active trip uses it.
    if old_truck_id != truck.id:
        old_truck = db.query(Truck).filter(
            Truck.id == old_truck_id
        ).first()

        if old_truck:
            other_old_truck_trip = db.query(Trip).filter(
                Trip.truck_id == old_truck_id,
                Trip.status.in_(active_statuses),
            ).first()

            if not other_old_truck_trip:
                old_truck.status = "available"
                db.commit()

    # Mark the new truck as assigned for an active trip.
    if trip.status in active_statuses:
        truck.status = "assigned"
        db.commit()

    return {
        "message": "Trip truck updated successfully",
        "trip_id": trip.id,
        "old_truck_id": old_truck_id,
        "new_truck_id": trip.truck_id,
        "order_id": trip.order_id,
        "company_id": order.company_id,
    }


#     # 1. Check that the truck exists
#     truck = db.query(Truck).filter(
#         Truck.id == truck_id
#     ).first()

#     if not truck:
#         raise HTTPException(
#             status_code=404,
#             detail=f"Truck ID {truck_id} not found"
#         )

#     # 2. Check that the driver exists
#     driver = db.query(Driver).filter(
#         Driver.id == driver_id
#     ).first()

#     if not driver:
#         raise HTTPException(
#             status_code=404,
#             detail=f"Driver ID {driver_id} not found"
#         )

#     # 3. Check that the order exists
#     order = db.query(Order).filter(
#         Order.id == order_id
#     ).first()

#     if not order:
#         raise HTTPException(
#             status_code=404,
#             detail=f"Order ID {order_id} not found"
#         )

#     # 4. Check whether the truck has an active or planned trip
#     active_statuses = ["planned", "in_progress"]

#     truck_busy = db.query(Trip).filter(
#         Trip.truck_id == truck_id,
#         Trip.status.in_(active_statuses)
#     ).first()

#     if truck_busy:
#         raise HTTPException(
#             status_code=409,
#             detail=(
#                 f"Truck ID {truck_id} is unavailable. "
#                 f"It already has trip ID {truck_busy.id} "
#                 f"with status '{truck_busy.status}'."
#             )
#         )

#     # 5. Check whether the driver has an active or planned trip
#     driver_busy = db.query(Trip).filter(
#         Trip.driver_id == driver_id,
#         Trip.status.in_(active_statuses)
#     ).first()

#     if driver_busy:
#         raise HTTPException(
#             status_code=409,
#             detail=(
#                 f"Driver ID {driver_id} is unavailable. "
#                 f"They already have trip ID {driver_busy.id} "
#                 f"with status '{driver_busy.status}'."
#             )
#         )

#     # 6. Create the trip only if both resources are available
#     trip = Trip(
#     truck_id=truck.id,
#     driver_id=driver.id,
#     order_id=order.id,
#     distance=distance,
#     estimated_time=estimated_time,
#     fuel_cost=fuel_cost,
#     status="planned",
#     daily_schedule=daily_schedule
# )

#     try:
#         db.add(trip)
#         db.commit()
#         db.refresh(trip)
#     except Exception:
#         db.rollback()
#         raise

#     return {
#         "message": "Trip created successfully",
#         "trip": {
#             "id": trip.id,
#             "truck_id": trip.truck_id,
#             "driver_id": trip.driver_id,
#             "order_id": trip.order_id,
#             "distance": trip.distance,
#             "estimated_time": trip.estimated_time,
#             "fuel_cost": trip.fuel_cost,
#             "status": trip.status
#         }
#     }

@router.get("/")
def get_all_trips(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = (
        db.query(Trip)
        .outerjoin(Truck, Trip.truck_id == Truck.id)
        .outerjoin(Driver, Trip.driver_id == Driver.id)
        .outerjoin(Order, Trip.order_id == Order.id)
    )

    # Admins or default fleet org see all recorded trips (e.g. Trip 11)
    if current_user and getattr(current_user, "role", "") != "admin" and getattr(current_user, "company_id", 1) not in (None, 1):
        query = query.filter(
            (Truck.company_id == current_user.company_id) | (Truck.company_id == None) | (Order.company_id == current_user.company_id)
        )

    trips = query.order_by(Trip.id.desc()).all()

    result = []
    for trip in trips:
        t_dict = {
            "id": trip.id,
            "truck_id": trip.truck_id,
            "driver_id": trip.driver_id,
            "order_id": trip.order_id,
            "distance": trip.distance,
            "distance_km": trip.distance,
            "estimated_time": trip.estimated_time,
            "fuel_cost": trip.fuel_cost,
            "status": trip.status,
            "start_time": trip.start_time,
            "average_speed_kmph": trip.average_speed_kmph,
            "truck_registration": trip.truck.registration_number if trip.truck else f"Truck #{trip.truck_id}",
            "truck_capacity": trip.truck.capacity if trip.truck else None,
            "driver_name": trip.driver.name if trip.driver else f"Driver #{trip.driver_id}",
            "driver_phone": trip.driver.phone if trip.driver else None,
            "pickup_location": trip.order.pickup_location if trip.order else "Origin Hub",
            "delivery_location": trip.order.delivery_location if trip.order else "Destination Terminal",
            "order_weight": trip.order.weight if trip.order else None,
        }
        result.append(t_dict)

    return result

@router.get("/truck/{truck_id}")
def get_trips_by_truck(
    truck_id: int,
    db: Session = Depends(get_db)
):
    truck = (
        db.query(Truck)
        .filter(Truck.id == truck_id)
        .first()
    )

    if not truck:
        raise HTTPException(
            status_code=404,
            detail="Truck not found"
        )

    trips = (
        db.query(Trip)
        .filter(Trip.truck_id == truck_id)
        .all()
    )

    return trips

@router.get("/driver/{driver_id}")
def get_trips_by_driver(
    driver_id: int,
    db: Session = Depends(get_db)
):
    driver = (
        db.query(Driver)
        .filter(Driver.id == driver_id)
        .first()
    )

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    trips = (
        db.query(Trip)
        .filter(Trip.driver_id == driver_id)
        .all()
    )

    return trips

@router.get("/order/{order_id}")
def get_trips_by_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    trips = (
        db.query(Trip)
        .filter(Trip.order_id == order_id)
        .all()
    )

    return trips

@router.get("/{trip_id}")
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db)
):
    trip = (
        db.query(Trip)
        .filter(Trip.id == trip_id)
        .first()
    )

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    return trip


@router.post("/auto-allocate")
def auto_allocate_trip(
    order_id: int,
    db: Session = Depends(get_db)
):
    active_statuses = ["planned", "in_progress"]

    # 1. Verify order exists
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=404,
            detail=f"Order ID {order_id} not found"
        )

    # 2. Check if order already has an active trip
    existing_trip = db.query(Trip).filter(Trip.order_id == order_id).first()
    if existing_trip:
        raise HTTPException(
            status_code=409,
            detail=f"Order {order_id} already allocated to trip #{existing_trip.id} ({existing_trip.status})"
        )

    # 3. Find busy trucks
    busy_truck_ids = {
        row[0] for row in db.query(Trip.truck_id).filter(Trip.status.in_(active_statuses)).distinct().all()
    }

    # 4. Find available truck with matching company and capacity
    trucks = db.query(Truck).filter(Truck.status == "available").all()
    eligible_trucks = [
        t for t in trucks
        if t.id not in busy_truck_ids
        and (t.capacity or 0) >= (order.weight or 0)
        and (t.company_id == order.company_id or not order.company_id)
    ]
    if not eligible_trucks:
        # Fallback without company filter if company is default
        eligible_trucks = [
            t for t in trucks
            if t.id not in busy_truck_ids
            and (t.capacity or 0) >= (order.weight or 0)
        ]

    if not eligible_trucks:
        raise HTTPException(
            status_code=409,
            detail=f"No available truck with capacity >= {order.weight} kg found."
        )

    # 5. Find busy drivers
    busy_driver_ids = {
        row[0] for row in db.query(Trip.driver_id).filter(Trip.status.in_(active_statuses)).distinct().all()
    }

    # 6. Find available driver
    drivers = db.query(Driver).filter(Driver.status == "available").all()
    eligible_drivers = [
        d for d in drivers
        if d.id not in busy_driver_ids
        and (d.company_id == order.company_id or not order.company_id)
    ]
    if not eligible_drivers:
        eligible_drivers = [d for d in drivers if d.id not in busy_driver_ids]

    if not eligible_drivers:
        raise HTTPException(
            status_code=409,
            detail="No available driver found for allocation."
        )

    selected_truck = eligible_trucks[0]
    selected_driver = eligible_drivers[0]

    # Calculate distance and estimated time
    dist_km = float(order.distance_km) if order.distance_km and order.distance_km > 0 else 100.0
    est_hours = max(1.0, round(dist_km / 50.0, 1))
    fuel_cost = int(dist_km * 15)  # estimated base fuel

    schedule_res = schedule_multi_day_trip(
        distance_km=dist_km,
        estimated_time_hours=est_hours,
        daily_working_hours=8,
        rest_hours=9,
    )

    # Try road route coordinates if coordinates exist
    planned_route_data = None
    if order.pickup_latitude and order.pickup_longitude and order.delivery_latitude and order.delivery_longitude:
        try:
            from app.optimization.road_route import get_road_route
            planned_route_data = get_road_route(
                float(order.pickup_latitude),
                float(order.pickup_longitude),
                float(order.delivery_latitude),
                float(order.delivery_longitude),
            )
        except Exception:
            planned_route_data = None

    new_trip = Trip(
        truck_id=selected_truck.id,
        driver_id=selected_driver.id,
        order_id=order.id,
        distance=round(float(dist_km), 2),
        estimated_time=int(est_hours),
        fuel_cost=fuel_cost,
        status="planned",
        daily_schedule=schedule_res["daily_schedule"],
        planned_route=planned_route_data,
    )

    try:
        db.add(new_trip)
        # Update order status to assigned
        order.status = "assigned"
        # Update truck and driver status to assigned
        selected_truck.status = "assigned"
        selected_driver.status = "assigned"
        db.commit()
        db.refresh(new_trip)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database allocation failed: {str(e)}")

    return {
        "message": "Trip allocated successfully",
        "trip": {
            "id": new_trip.id,
            "truck_id": new_trip.truck_id,
            "driver_id": new_trip.driver_id,
            "order_id": new_trip.order_id,
            "status": new_trip.status,
            "distance": new_trip.distance,
            "daily_schedule": new_trip.daily_schedule,
            "truck_registration": selected_truck.registration_number,
            "driver_name": selected_driver.name,
        }
    }


@router.post("/")
def create_trip(
    truck_id: int,
    driver_id: int,
    order_id: int,
    distance: float = 0.0,
    estimated_time: int = 0,
    fuel_cost: int = 0,
    db: Session = Depends(get_db)
):
    active_statuses = ["planned", "in_progress"]

    # 1. Verify the order exists
    order = db.query(Order).filter(
        Order.id == order_id
    ).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail=f"Order ID {order_id} not found"
        )

    # 2. Do not allocate an order that already has a trip
    existing_trip = db.query(Trip).filter(
        Trip.order_id == order_id
    ).first()

    if existing_trip:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Order {order_id} already has trip "
                f"ID {existing_trip.id} with status "
                f"'{existing_trip.status}'."
            )
        )

    # 3. Find trucks already reserved by active trips
    busy_truck_ids = db.query(
        Trip.truck_id
    ).filter(
        Trip.status.in_(active_statuses)
    ).distinct().all()

    busy_truck_ids = {
        row[0] for row in busy_truck_ids
    }

    # 4. Find drivers already reserved by active trips
    busy_driver_ids = db.query(
        Trip.driver_id
    ).filter(
        Trip.status.in_(active_statuses)
    ).distinct().all()

    busy_driver_ids = {
        row[0] for row in busy_driver_ids
    }

    # 5. Select an available truck with enough capacity
    trucks = db.query(Truck).all()

    available_trucks = [
        truck for truck in trucks
        if truck.id not in busy_truck_ids
        and (truck.capacity or 0) >= (order.weight or 0)
    ]

    if not available_trucks:
        raise HTTPException(
            status_code=409,
            detail=(
                "No available truck has sufficient capacity "
                "for this order."
            )
        )

    # 6. Select an available driver
    drivers = db.query(Driver).all()

    available_drivers = [
        driver for driver in drivers
        if driver.id not in busy_driver_ids
    ]

    if not available_drivers:
        raise HTTPException(
            status_code=409,
            detail="No available driver found."
        )

    # 7. Allocate the first eligible truck and driver
    truck = available_trucks[0]
    driver = available_drivers[0]

        # 8. Generate the daily schedule automatically
    if estimated_time <= 0:
        raise HTTPException(
            status_code=400,
            detail="estimated_time must be greater than zero."
        )

    schedule_result = schedule_multi_day_trip(
        distance_km=distance,
        estimated_time_hours=estimated_time,
        daily_working_hours=8,
        rest_hours=9,
    )

    daily_schedule = schedule_result["daily_schedule"]

    trip = Trip(
        truck_id=truck.id,
        driver_id=driver.id,
        order_id=order.id,
        distance=distance,
        estimated_time=estimated_time,
        fuel_cost=fuel_cost,
        status="planned",
        daily_schedule=daily_schedule
    )

    try:
        db.add(trip)
        db.commit()
        db.refresh(trip)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Trip automatically allocated successfully",
        "trip": {
            "id": trip.id,
            "truck_id": trip.truck_id,
            "driver_id": trip.driver_id,
            "order_id": trip.order_id,
            "status": trip.status,
            "daily_schedule": trip.daily_schedule
        }
    }
# daily_schedule: list[dict] | None = Body(
#     default=None,
#     example=[
#         {"day": 1, "hours": 10},
#         {"day": 2, "hours": 10},
#         {"day": 3, "hours": 4}
#     ]
# ),

@router.put("/{trip_id}/status")
def update_trip_status(
    trip_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    allowed_statuses = [
        "planned",
        "in_progress",
        "completed",
        "cancelled"
    ]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid trip status"
        )

    valid_transitions = {
        "planned": ["in_progress", "cancelled"],
        "in_progress": ["completed", "cancelled"],
        "completed": [],
        "cancelled": []
    }

    if status not in valid_transitions.get(trip.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition: {trip.status} -> {status}"
        )

    # Update trip status
    trip.status = status

    # Find other trips reserving this truck
    active_statuses = ["planned", "in_progress"]

    other_truck_trip = db.query(Trip).filter(
        Trip.truck_id == trip.truck_id,
        Trip.id != trip.id,
        Trip.status.in_(active_statuses)
    ).first()

    # Find other trips reserving this driver
    other_driver_trip = db.query(Trip).filter(
        Trip.driver_id == trip.driver_id,
        Trip.id != trip.id,
        Trip.status.in_(active_statuses)
    ).first()

    # Update truck availability
    truck = db.query(Truck).filter(
        Truck.id == trip.truck_id
    ).first()

    if truck:
        truck.status = (
            "assigned" if other_truck_trip else "available"
        )

    # Update driver availability
    driver = db.query(Driver).filter(
        Driver.id == trip.driver_id
    ).first()

    if driver:
        driver.status = (
            "busy" if other_driver_trip else "available"
        )

    # Synchronize order status
    order = db.query(Order).filter(
        Order.id == trip.order_id
    ).first()

    if order:
        if status == "in_progress":
            order.status = "in_progress"
        elif status == "completed":
            order.status = "completed"
            # Increment truck service counters upon trip completion
            if trip.truck:
                trip.truck.trips_since_service = (trip.truck.trips_since_service or 0) + 1
                trip.truck.km_since_service = (trip.truck.km_since_service or 0.0) + float(trip.distance or 0.0)
        elif status == "cancelled":
            order.status = "pending"

    try:
        db.commit()
        db.refresh(trip)
    except Exception:
        db.rollback()
        raise


@router.delete("/{trip_id}")
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db)
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    truck_id = trip.truck_id
    driver_id = trip.driver_id
    order_id = trip.order_id

    # Reset order status back to pending
    if order_id:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order and order.status in ("assigned", "in_progress"):
            order.status = "pending"

    db.delete(trip)
    db.flush()

    active_statuses = ["planned", "in_progress"]
    other_truck = db.query(Trip).filter(
        Trip.truck_id == truck_id,
        Trip.status.in_(active_statuses)
    ).first()
    if truck_id:
        truck = db.query(Truck).filter(Truck.id == truck_id).first()
        if truck:
            truck.status = "assigned" if other_truck else "available"

    other_driver = db.query(Trip).filter(
        Trip.driver_id == driver_id,
        Trip.status.in_(active_statuses)
    ).first()
    if driver_id:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        if driver:
            driver.status = "busy" if other_driver else "available"

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": f"Trip #{trip_id} deleted successfully",
        "order_id": order_id
    }

    return {
        "message": "Trip status updated successfully",
        "trip_id": trip.id,
        "truck_id": trip.truck_id,
        "driver_id": trip.driver_id,
        "trip_status": trip.status,
        "truck_status": truck.status if truck else None,
        "driver_status": driver.status if driver else None,
        "order_status": order.status if order else None
    }


@router.post("/{trip_id}/driver-assignments")
def create_driver_assignment(
    trip_id: int,
    assignment_data: DriverAssignmentCreate,
    db: Session = Depends(get_db)
):
    # 1. Check that the trip exists
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    # 2. Validate the segment boundaries
    if trip.distance is None or trip.distance <= 0:
        raise HTTPException(
            status_code=400,
            detail="Trip must have a positive distance"
        )
        existing_trip_assignments = db.query(TripDriverAssignment).filter(
        TripDriverAssignment.trip_id == trip_id
    ).first()

        if existing_trip_assignments:
         raise HTTPException(
            status_code=409,
            detail=(
                "This trip already has driver assignments. "
                "Review or remove them before running auto-allocation again."
            ),
        )

    if assignment_data.segment_end_km <= assignment_data.segment_start_km:
        raise HTTPException(
            status_code=400,
            detail="Segment end must be greater than segment start"
        )

    if assignment_data.segment_end_km > trip.distance:
        raise HTTPException(
            status_code=400,
            detail="Segment cannot exceed the trip distance"
        )

    if assignment_data.end_time <= assignment_data.start_time:
        raise HTTPException(
            status_code=400,
            detail="End time must be after start time"
        )

    # 3. Check that the driver exists and is available
    driver = db.query(Driver).filter(
        Driver.id == assignment_data.driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    if driver.status != "available":
        raise HTTPException(
            status_code=409,
            detail="Driver is not marked as available"
        )

    # 4. Prevent overlapping segments for the same driver
    existing_assignments = db.query(
        TripDriverAssignment
    ).filter(
        TripDriverAssignment.driver_id == driver.id,
        TripDriverAssignment.status.in_(["planned", "in_progress"])
    ).all()

    for existing in existing_assignments:
      existing_start = datetime.fromisoformat(existing.start_time)
      existing_end = datetime.fromisoformat(existing.end_time)

    if (
        assignment_data.start_time < existing_end
        and assignment_data.end_time > existing_start
    ):
        raise HTTPException(
            status_code=409,
            detail="Driver already has an overlapping assignment"
        )
    # 5. Prevent overlapping distance segments on this trip
    trip_assignments = db.query(
        TripDriverAssignment
    ).filter(
        TripDriverAssignment.trip_id == trip_id,
        TripDriverAssignment.status.in_(["planned", "in_progress"])
    ).all()

    for existing in trip_assignments:
        if (
            assignment_data.segment_start_km < existing.segment_end_km
            and assignment_data.segment_end_km > existing.segment_start_km
        ):
            raise HTTPException(
                status_code=409,
                detail="This distance segment is already assigned"
            )

    # 6. Save the assignment
    assignment = TripDriverAssignment(
        trip_id=trip_id,
        driver_id=driver.id,
        segment_start_km=assignment_data.segment_start_km,
        segment_end_km=assignment_data.segment_end_km,
        start_time=assignment_data.start_time.isoformat(),
        end_time=assignment_data.end_time.isoformat(),
        status="planned"
    )

    try:
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Driver assigned to trip segment successfully",
        "assignment": {
            "id": assignment.id,
            "trip_id": assignment.trip_id,
            "driver_id": assignment.driver_id,
            "segment_start_km": assignment.segment_start_km,
            "segment_end_km": assignment.segment_end_km,
            "start_time": assignment.start_time,
            "end_time": assignment.end_time,
            "status": assignment.status
        }
    }


@router.get("/{trip_id}/driver-assignments")
def get_trip_driver_assignments(
    trip_id: int,
    db: Session = Depends(get_db)
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    assignments = db.query(
        TripDriverAssignment
    ).filter(
        TripDriverAssignment.trip_id == trip_id
    ).order_by(
        TripDriverAssignment.segment_start_km
    ).all()

    return [
        {
            "id": assignment.id,
            "trip_id": assignment.trip_id,
            "driver_id": assignment.driver_id,
            "segment_start_km": assignment.segment_start_km,
            "segment_end_km": assignment.segment_end_km,
            "start_time": assignment.start_time,
            "end_time": assignment.end_time,
            "status": assignment.status
        }
        for assignment in assignments
    ]


@router.get("/drivers/{driver_id}/assignments")
def get_driver_assignments(
    driver_id: int,
    db: Session = Depends(get_db),
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found",
        )

    assignments = (
        db.query(TripDriverAssignment)
        .filter(
            TripDriverAssignment.driver_id == driver_id,
            TripDriverAssignment.status.in_(
                ["planned", "in_progress"]
            ),
        )
        .order_by(TripDriverAssignment.start_time)
        .all()
    )

    return [
        {
            "id": assignment.id,
            "trip_id": assignment.trip_id,
            "driver_id": assignment.driver_id,
            "segment_start_km": assignment.segment_start_km,
            "segment_end_km": assignment.segment_end_km,
            "start_time": assignment.start_time,
            "end_time": assignment.end_time,
            "status": assignment.status,
        }
        for assignment in assignments
    ]

@router.delete("/{trip_id}/driver-assignments/{assignment_id}")
def delete_trip_driver_assignment(
    trip_id: int,
    assignment_id: int,
    db: Session = Depends(get_db)
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    assignment = db.query(
        TripDriverAssignment
    ).filter(
        TripDriverAssignment.id == assignment_id,
        TripDriverAssignment.trip_id == trip_id
    ).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Driver assignment not found for this trip"
        )

    db.delete(assignment)
    db.commit()

    return {
        "message": "Driver assignment deleted successfully",
        "trip_id": trip_id,
        "assignment_id": assignment_id
    }

@router.post("/{trip_id}/auto-allocate-drivers")
def auto_allocate_drivers(
    trip_id: int,
    request: AutomaticDriverAllocation,
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip.distance is None or trip.distance <= 0:
        raise HTTPException(
            status_code=400,
            detail="Trip distance must be positive",
        )

    existing_trip_assignment = (
        db.query(TripDriverAssignment)
        .filter(TripDriverAssignment.trip_id == trip_id)
        .first()
    )

    if existing_trip_assignment:
        raise HTTPException(
            status_code=409,
            detail="This trip already has driver assignments.",
        )


    average_speed_kmh = 50.0
    daily_limit_hours = 8.0

    # Validate the trip's company.
    if not trip.order or not trip.order.company_id:
        raise HTTPException(
            status_code=409,
            detail="Trip's order is not linked to a company.",
        )

    trip_company_id = trip.order.company_id

    # Ensure the truck belongs to the same company.
    if (
        not trip.truck
        or trip.truck.company_id != trip_company_id
    ):
        raise HTTPException(
            status_code=409,
            detail="Trip's truck must belong to the trip's company.",
        )

    # Select available drivers from this company only.
    drivers = (
        db.query(Driver)
        .filter(
            Driver.status == "available",
            Driver.company_id == trip_company_id,
        )
        .order_by(
            Driver.working_hours.desc(),
            Driver.id.asc(),
        )
        .all()
    )

    # Include the primary driver if eligible and not already selected.
    primary_driver = (
        db.query(Driver)
        .filter(
            Driver.id == trip.driver_id,
            Driver.status == "available",
            Driver.company_id == trip_company_id,
        )
        .first()
    )

    if (
        primary_driver
        and all(d.id != primary_driver.id for d in drivers)
    ):
        drivers.append(primary_driver)

    if not drivers:
        raise HTTPException(
            status_code=409,
            detail="No available drivers found for this company.",
        )




    # Load existing assignments for conflict and daily-hour checks.
    existing_assignments_by_driver = {}
    existing_driving_hours_by_driver = {}

    try:
        for driver in drivers:
            existing_assignments = (
                db.query(TripDriverAssignment)
                .filter(
                    TripDriverAssignment.driver_id == driver.id,
                    TripDriverAssignment.status.in_(
                        ["planned", "in_progress"]
                    ),
                )
                .all()
            )

            windows = []
            driving_records = []

            for existing in existing_assignments:
                try:
                    existing_start = datetime.fromisoformat(
                        existing.start_time
                    )
                    existing_end = datetime.fromisoformat(
                        existing.end_time
                    )
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "An existing driver assignment "
                            "has an invalid time."
                        ),
                    )

                if existing_end <= existing_start:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "An existing driver assignment "
                            "has an invalid time range."
                        ),
                    )

                # Preserve the existing conflict-checking windows.
                windows.append(
                    (existing_start, existing_end)
                )

                # Calculate elapsed hours for the assignment.
                driving_records.append(
                    {
                        "start": existing_start,
                        "end": existing_end,
                        "hours": (
                            existing_end - existing_start
                        ).total_seconds() / 3600,
                    }
                )

            existing_assignments_by_driver[driver.id] = windows

            existing_driving_hours_by_driver[driver.id] = (
                driving_records
            )


        # Generate the rotation schedule.

        schedule = build_driver_rotation_schedule(
            distance_km=float(trip.distance),
            drivers=drivers,
            start_datetime=request.start_datetime,
            average_speed_kmh=average_speed_kmh,
            daily_limit_hours=daily_limit_hours,
            existing_assignments_by_driver=(
                existing_assignments_by_driver
            ),
            existing_driving_hours_by_driver=(
                existing_driving_hours_by_driver
            ),
        )

        if not schedule["complete"]:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Insufficient eligible driver hours.",
                    "trip_id": trip.id,
                    "distance_km": trip.distance,
                    "covered_distance_km": (
                        schedule["covered_distance_km"]
                    ),
                    "uncovered_distance_km": (
                        schedule["uncovered_distance_km"]
                    ),
                },
            )

        # Save the generated segments.
        assignments = []

        for item in schedule["assignments"]:
            assignment = TripDriverAssignment(
                trip_id=trip.id,
                driver_id=item["driver_id"],
                segment_start_km=item["segment_start_km"],
                segment_end_km=item["segment_end_km"],
                start_time=item["start_time"],
                end_time=item["end_time"],
                status="planned",
            )
            db.add(assignment)
            assignments.append(assignment)

        db.commit()

        for assignment in assignments:
            db.refresh(assignment)

            return {
                   "message": "Drivers allocated successfully",
                   "trip_id": trip.id,
                   "total_distance_km": trip.distance,
                   "assignments": [
                       {
                           "id": assignment.id,
                           "driver_id": assignment.driver_id,
                           "segment_start_km": assignment.segment_start_km,
                           "segment_end_km": assignment.segment_end_km,
                           "start_time": assignment.start_time,
                           "end_time": assignment.end_time,
                           "status": assignment.status,
                       }
                       for assignment in assignments
                   ],
               }

    except Exception:
        db.rollback()
        raise
