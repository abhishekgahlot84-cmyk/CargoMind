"""
Maintenance Management Router for CargoMind.
Provides threshold-based maintenance detection, suggestion cards,
safe truck substitution, and complete service audit logs.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Maintenance, MaintenanceLog, Truck, Trip, Order, User
from app.routes.auth import get_current_user_optional
from app.optimization.fleet_queries import get_available_trucks


router = APIRouter(
    prefix="/maintenance",
    tags=["Maintenance"]
)


class SendToMaintenanceRequest(BaseModel):
    truck_id: int
    replacement_truck_id: Optional[int] = None
    notes: Optional[str] = None


class MarkMaintainedRequest(BaseModel):
    truck_id: int
    maintenance_type: Optional[str] = "Periodic Preventive Service"
    cost: Optional[float] = None
    notes: Optional[str] = None


def _find_suggested_replacement(target_truck: Truck, db: Session) -> Optional[Dict[str, Any]]:
    """
    Finds an available truck with similar or larger capacity to act as a substitute.
    """
    avail = get_available_trucks(db, company_id=target_truck.company_id)
    # Filter for trucks with capacity >= 90% of target truck capacity
    target_cap = target_truck.capacity or 0
    candidates = [
        t for t in avail
        if t.id != target_truck.id and (t.capacity or 0) >= target_cap
    ]
    if not candidates:
        # Fall back to any available truck
        candidates = [t for t in avail if t.id != target_truck.id]

    if not candidates:
        return None

    # Pick candidate with capacity closest to target
    candidates.sort(key=lambda t: abs((t.capacity or 0) - target_cap))
    best = candidates[0]
    return {
        "id": best.id,
        "registration_number": best.registration_number,
        "model": best.model or "Heavy Commercial Truck",
        "capacity": best.capacity,
        "fuel_type": best.fuel_type,
        "mileage_kmpl": getattr(best, "mileage_kmpl", 5.0) or 5.0,
    }


@router.get("/suggestions")
def get_maintenance_suggestions_endpoint(
    warn_trips: int = 20,
    due_trips: int = 30,
    warn_km: float = 8000.0,
    due_km: float = 12000.0,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Compute real-time maintenance suggestion cards for trucks across the fleet.
    Sorted by urgency ('due' critical first, then 'warning' recommended).
    """
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    trucks = db.query(Truck).filter((Truck.company_id == comp_id) | (Truck.user_id == user_id)).all()

    # Active trips lookup
    active_trips = db.query(Trip).filter(
        Trip.status.in_(["planned", "in_progress"])
    ).all()
    in_progress_truck_ids = {t.truck_id: t.id for t in active_trips if t.status == "in_progress" and t.truck_id}
    planned_truck_ids = {t.truck_id: t.id for t in active_trips if t.status == "planned" and t.truck_id}

    suggestions = []

    for t in trucks:
        trips_count = t.trips_since_service or 0
        km_count = t.km_since_service or 0.0

        urgency = None
        if trips_count >= due_trips or km_count >= due_km:
            urgency = "due"
        elif trips_count >= warn_trips or km_count >= warn_km:
            urgency = "warning"

        # Also show trucks currently marked status="maintenance" as due
        if t.status == "maintenance" and not urgency:
            urgency = "due"

        if urgency:
            is_in_progress = t.id in in_progress_truck_ids
            has_planned = t.id in planned_truck_ids
            replacement = _find_suggested_replacement(t, db)

            if urgency == "due":
                reason = f"{t.registration_number} has completed {trips_count} trips ({int(km_count)} km) since the last service — maintenance due"
            else:
                reason = f"{t.registration_number} has completed {trips_count} trips since the last service — maintenance recommended"

            suggestions.append({
                "truck_id": t.id,
                "registration_number": t.registration_number,
                "model": t.model or "Heavy Commercial Truck",
                "capacity": t.capacity,
                "status": t.status,
                "urgency": urgency,
                "reason": reason,
                "message": reason,
                "trips_since_service": trips_count,
                "km_since_service": round(km_count, 1),
                "last_service_date": t.last_service_date or "No prior record",
                "is_on_active_trip": is_in_progress,
                "active_trip_id": in_progress_truck_ids.get(t.id),
                "has_planned_trips": has_planned,
                "planned_trip_id": planned_truck_ids.get(t.id),
                "suggested_replacement": replacement,
            })

    # Sort: due first, then warning, then highest trips count
    urgency_weight = {"due": 0, "warning": 1}
    suggestions.sort(key=lambda s: (urgency_weight.get(s["urgency"], 2), -s["trips_since_service"]))

    return {
        "total_suggestions": len(suggestions),
        "due_count": len([s for s in suggestions if s["urgency"] == "due"]),
        "warning_count": len([s for s in suggestions if s["urgency"] == "warning"]),
        "suggestions": suggestions,
    }


@router.post("/send-to-maintenance")
def send_truck_to_maintenance_endpoint(
    req: SendToMaintenanceRequest,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Transition truck status to 'maintenance' and safely reassign any planned trips.
    Blocks if vehicle is actively mid-transit on an 'in_progress' trip.
    """
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    truck = db.query(Truck).filter(
        Truck.id == req.truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail=f"Truck #{req.truck_id} not found")

    # 1. Block if truck is on an active in_progress trip
    active_in_progress = db.query(Trip).filter(
        Trip.truck_id == truck.id,
        Trip.status == "in_progress"
    ).first()

    if active_in_progress:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{truck.registration_number} is currently on active in-transit trip #{active_in_progress.id}. "
                "Vehicle cannot enter maintenance until the current consignment is delivered. "
                "Please schedule maintenance to begin automatically upon trip completion."
            )
        )

    # 2. Check for planned trips that need substitution
    planned_trips = db.query(Trip).filter(
        Trip.truck_id == truck.id,
        Trip.status == "planned"
    ).all()

    replacement_used = None
    if planned_trips:
        if req.replacement_truck_id:
            replacement = db.query(Truck).filter(Truck.id == req.replacement_truck_id).first()
            if not replacement:
                raise HTTPException(status_code=404, detail="Replacement truck not found")
            if replacement.status not in ["available"]:
                raise HTTPException(status_code=409, detail=f"Replacement truck {replacement.registration_number} is not currently available (status: {replacement.status})")

            # Validate capacity for all planned orders
            for pt in planned_trips:
                if pt.order and (replacement.capacity or 0) < (pt.order.weight or 0):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Replacement truck {replacement.registration_number} ({replacement.capacity} kg) has insufficient capacity for planned order #{pt.order_id} ({pt.order.weight} kg)."
                    )
                pt.truck_id = replacement.id

            replacement.status = "assigned"
            replacement_used = replacement.registration_number
        else:
            # Reassign not provided, unassign the planned trips back to allocation pool
            for pt in planned_trips:
                pt.truck_id = None
                pt.status = "planned"

    # 3. Update truck status to maintenance
    truck.status = "maintenance"

    # 4. Write audit log
    now_iso = datetime.now(timezone.utc).isoformat()
    log_entry = MaintenanceLog(
        truck_id=truck.id,
        action="sent_to_maintenance",
        date=now_iso,
        maintenance_type="Service Scheduled",
        notes=req.notes or f"Sent to maintenance. Replaced by: {replacement_used or 'None'}",
        trips_at_time=truck.trips_since_service or 0,
        km_at_time=truck.km_since_service or 0.0,
    )
    db.add(log_entry)

    try:
        db.commit()
        db.refresh(truck)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")

    return {
        "status": "success",
        "message": f"{truck.registration_number} has been set to maintenance and excluded from load allocation.",
        "truck_id": truck.id,
        "truck_status": truck.status,
        "reassigned_trips_count": len(planned_trips),
        "replacement_truck": replacement_used,
    }


@router.post("/mark-maintained")
def mark_truck_maintained_endpoint(
    req: MarkMaintainedRequest,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Mark a truck as maintained: resets service counters, records service date,
    writes to maintenance log, and returns vehicle to 'available' status.
    """
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    truck = db.query(Truck).filter(
        Truck.id == req.truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail=f"Truck #{req.truck_id} not found")

    trips_completed = truck.trips_since_service or 0
    km_completed = truck.km_since_service or 0.0
    now_date = datetime.now().strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Reset counters
    truck.trips_since_service = 0
    truck.km_since_service = 0.0
    truck.last_service_date = now_date
    truck.status = "available"

    # Create MaintenanceLog record
    log_record = MaintenanceLog(
        truck_id=truck.id,
        action="marked_maintained",
        date=now_iso,
        maintenance_type=req.maintenance_type or "Periodic Preventive Service",
        notes=req.notes or "Full commercial inspection & lubrication completed.",
        cost=req.cost or 0.0,
        trips_at_time=trips_completed,
        km_at_time=km_completed,
    )
    db.add(log_record)

    # Also add record to legacy Maintenance table
    legacy_rec = Maintenance(
        truck_id=truck.id,
        service_date=now_date,
        maintenance_type=req.maintenance_type or "Periodic Preventive Service",
        odometer=int(km_completed),
        cost=int(req.cost or 0) if req.cost else 0,
        status="completed",
    )
    db.add(legacy_rec)

    try:
        db.commit()
        db.refresh(truck)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record maintenance: {str(e)}")

    return {
        "status": "success",
        "message": f"{truck.registration_number} successfully marked as maintained. Service counters reset to 0.",
        "truck_id": truck.id,
        "trips_since_service": truck.trips_since_service,
        "km_since_service": truck.km_since_service,
        "last_service_date": truck.last_service_date,
        "truck_status": truck.status,
    }


@router.get("/logs/{truck_id}")
def get_truck_maintenance_logs(
    truck_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve full maintenance history log for a truck."""
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    query = (
        db.query(MaintenanceLog)
        .join(Truck, MaintenanceLog.truck_id == Truck.id)
        .filter((Truck.company_id == comp_id) | (Truck.user_id == user_id))
    )
    if truck_id > 0:
        query = query.filter(MaintenanceLog.truck_id == truck_id)

    logs = query.order_by(MaintenanceLog.id.desc()).all()
    return [
        {
            "id": l.id,
            "truck_id": l.truck_id,
            "truck_registration": l.truck.registration_number if l.truck else None,
            "action": l.action,
            "date": l.date,
            "maintenance_type": l.maintenance_type,
            "notes": l.notes,
            "cost": l.cost,
            "trips_at_time": l.trips_at_time,
            "km_at_time": l.km_at_time,
        }
        for l in logs
    ]


@router.get("/replacements/{truck_id}")
def get_replacement_options_endpoint(
    truck_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Returns available replacement trucks with similar or larger capacity.
    """
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    target = db.query(Truck).filter(
        Truck.id == truck_id,
        (Truck.company_id == comp_id) | (Truck.user_id == user_id)
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Truck not found or does not belong to your company")

    avail = get_available_trucks(db, company_id=target.company_id)
    candidates = [
        {
            "id": t.id,
            "registration_number": t.registration_number,
            "model": t.model or "Heavy Commercial Truck",
            "capacity": t.capacity,
            "fuel_type": t.fuel_type,
            "mileage_kmpl": getattr(t, "mileage_kmpl", 5.0) or 5.0,
            "is_capacity_sufficient": (t.capacity or 0) >= (target.capacity or 0),
        }
        for t in avail
        if t.id != target.id
    ]
    candidates.sort(key=lambda c: (1 if c["is_capacity_sufficient"] else 0, c["capacity"]), reverse=True)
    return {"target_truck_id": truck_id, "target_capacity": target.capacity, "replacements": candidates}


# Backward-compatible endpoints
@router.post("/")
def create_maintenance(
    truck_id: int,
    service_date: str,
    maintenance_type: str,
    odometer: int = None,
    engine_hours: int = None,
    cost: int = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    truck = db.query(Truck).filter(Truck.id == truck_id, Truck.company_id == current_user.company_id).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found or does not belong to your company")

    maintenance = Maintenance(
        truck_id=truck_id,
        service_date=service_date,
        maintenance_type=maintenance_type,
        odometer=odometer,
        engine_hours=engine_hours,
        cost=cost
    )
    db.add(maintenance)
    db.commit()
    db.refresh(maintenance)

    return {
        "message": "Maintenance record created successfully",
        "maintenance": {
            "id": maintenance.id,
            "truck_id": maintenance.truck_id,
            "service_date": maintenance.service_date,
            "maintenance_type": maintenance.maintenance_type,
            "odometer": maintenance.odometer,
            "engine_hours": maintenance.engine_hours,
            "cost": maintenance.cost,
            "status": maintenance.status
        }
    }


@router.get("/")
def get_maintenance_records(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    records = (
        db.query(Maintenance)
        .join(Truck, Maintenance.truck_id == Truck.id)
        .filter(Truck.company_id == current_user.company_id)
        .all()
    )
    return records


@router.get("/{maintenance_id}")
def get_maintenance(
    maintenance_id: int,
    db: Session = Depends(get_db)
):
    record = (
        db.query(Maintenance)
        .filter(Maintenance.id == maintenance_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record
