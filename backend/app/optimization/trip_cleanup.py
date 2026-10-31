"""
Trip Auto-Cleanup Service for CargoMind.
Automatically purges completed trips after approximately 1 hour of completion,
releasing vehicles and drivers for new allotments and keeping the operational map clean.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.database.models import (
    Trip,
    Truck,
    Driver,
    Order,
    TripDriverAssignment,
    DriverHandover,
)


def cleanup_completed_trips(db: Session, max_age_hours: float = 1.0) -> int:
    """
    Deletes trips marked as 'completed' once approximately max_age_hours (default: 1.0 hour)
    has elapsed since completion.
    
    - Safely removes dependent assignments and handovers
    - Keeps the Order marked as 'completed'
    - Resets Truck and Driver status to 'available' if they have no other active trips
    - Returns the count of deleted trips
    """
    now = datetime.now(timezone.utc)
    threshold = now - timedelta(hours=max_age_hours)

    try:
        completed_trips = db.query(Trip).filter(Trip.status == "completed").all()
    except Exception:
        return 0

    if not completed_trips:
        return 0

    deleted_count = 0
    active_statuses = ["planned", "in_progress"]

    for trip in completed_trips:
        should_delete = False

        # 1. Check completed_at timestamp
        if trip.completed_at:
            try:
                comp_dt = datetime.fromisoformat(trip.completed_at.replace("Z", "+00:00"))
                if comp_dt <= threshold:
                    should_delete = True
            except Exception:
                should_delete = True
        else:
            # Fallback for legacy completed trips without completed_at:
            # Check if start_time was recorded
            if trip.start_time:
                try:
                    start_dt = datetime.fromisoformat(trip.start_time.replace("Z", "+00:00"))
                    est_hours = (trip.estimated_time or 60) / 60.0
                    # If started more than (duration + max_age_hours) ago
                    if start_dt <= (now - timedelta(hours=est_hours + max_age_hours)):
                        should_delete = True
                except Exception:
                    should_delete = True
            else:
                # No timestamps recorded at all, safe to delete
                should_delete = True

        if should_delete:
            truck_id = trip.truck_id
            driver_id = trip.driver_id
            order_id = trip.order_id

            # Ensure order status remains completed
            if order_id:
                order = db.query(Order).filter(Order.id == order_id).first()
                if order and order.status != "completed":
                    order.status = "completed"

            # Remove cascade relations
            db.query(TripDriverAssignment).filter(
                TripDriverAssignment.trip_id == trip.id
            ).delete(synchronize_session=False)

            db.query(DriverHandover).filter(
                DriverHandover.trip_id == trip.id
            ).delete(synchronize_session=False)

            # Delete the trip
            db.delete(trip)
            db.flush()

            # Release truck if no other active trips
            if truck_id:
                other_truck_trip = db.query(Trip).filter(
                    Trip.truck_id == truck_id,
                    Trip.status.in_(active_statuses)
                ).first()
                truck = db.query(Truck).filter(Truck.id == truck_id).first()
                if truck and not other_truck_trip:
                    truck.status = "available"

            # Release driver if no other active trips
            if driver_id:
                other_driver_trip = db.query(Trip).filter(
                    Trip.driver_id == driver_id,
                    Trip.status.in_(active_statuses)
                ).first()
                driver = db.query(Driver).filter(Driver.id == driver_id).first()
                if driver and not other_driver_trip:
                    driver.status = "available"

            deleted_count += 1

    if deleted_count > 0:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return deleted_count

