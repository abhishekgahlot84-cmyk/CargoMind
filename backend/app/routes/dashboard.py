from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import (
    Truck,
    Driver,
    Order,
    Trip,
    GPSTracking,
    User,
)
from app.routes.auth import get_current_user_optional


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)

@router.get("/summary")
def get_dashboard_summary(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    comp_id = current_user.company_id

    total_trucks = (
        db.query(Truck)
        .filter(Truck.company_id == comp_id)
        .count()
    )

    available_trucks = (
        db.query(Truck)
        .filter(Truck.company_id == comp_id, Truck.status == "available")
        .count()
    )

    assigned_trucks = (
        db.query(Truck)
        .filter(Truck.company_id == comp_id, Truck.status == "assigned")
        .count()
    )

    total_drivers = (
        db.query(Driver)
        .filter(Driver.company_id == comp_id)
        .count()
    )

    available_drivers = (
        db.query(Driver)
        .filter(Driver.company_id == comp_id, Driver.status == "available")
        .count()
    )

    busy_drivers = (
        db.query(Driver)
        .filter(Driver.company_id == comp_id, Driver.status == "busy")
        .count()
    )

    pending_orders = (
        db.query(Order)
        .filter(Order.company_id == comp_id, Order.status == "pending")
        .count()
    )

    assigned_orders = (
        db.query(Order)
        .filter(Order.company_id == comp_id, Order.status == "assigned")
        .count()
    )

    in_progress_orders = (
        db.query(Order)
        .filter(Order.company_id == comp_id, Order.status == "in_progress")
        .count()
    )

    completed_orders = (
        db.query(Order)
        .filter(Order.company_id == comp_id, Order.status == "completed")
        .count()
    )

    active_trips = (
        db.query(Trip)
        .join(Truck, Trip.truck_id == Truck.id)
        .filter(Truck.company_id == comp_id, Trip.status == "in_progress")
        .count()
    )

    return {
        "total_trucks": total_trucks,
        "available_trucks": available_trucks,
        "assigned_trucks": assigned_trucks,
        "total_drivers": total_drivers,
        "available_drivers": available_drivers,
        "busy_drivers": busy_drivers,
        "pending_orders": pending_orders,
        "assigned_orders": assigned_orders,
        "in_progress_orders": in_progress_orders,
        "completed_orders": completed_orders,
        "active_trips": active_trips
    }

@router.get("/active-trips")
def get_active_trips(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    comp_id = current_user.company_id

    trips = (
        db.query(Trip)
        .join(Truck, Trip.truck_id == Truck.id)
        .filter(Truck.company_id == comp_id, Trip.status == "in_progress")
        .all()
    )

    active_trips = []

    for trip in trips:

        gps_record = (
            db.query(GPSTracking)
            .filter(
                GPSTracking.truck_id == trip.truck_id
            )
            .order_by(GPSTracking.id.desc())
            .first()
        )

        active_trips.append({
            "trip_id": trip.id,
            "order_id": trip.order_id,
            "truck_id": trip.truck_id,
            "driver_id": trip.driver_id,
            "trip_status": trip.status,
            "latitude": (
                gps_record.latitude
                if gps_record else None
            ),
            "longitude": (
                gps_record.longitude
                if gps_record else None
            ),
            "speed": (
                gps_record.speed
                if gps_record else None
            ),
            "timestamp": (
                gps_record.timestamp
                if gps_record else None
            )
        })

    return active_trips