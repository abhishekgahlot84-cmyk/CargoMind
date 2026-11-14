from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List, Union

from app.database.connection import get_db
from app.database.models import Truck, Trip, Order, User
from app.routes.auth import get_current_user


router = APIRouter(
    prefix="/trucks",
    tags=["Trucks"]
)


class TruckCreate(BaseModel):
    registration_number: str
    capacity: Union[float, int]
    fuel_type: str
    fuel_efficiency: Optional[Union[float, int]] = None
    mileage_kmpl: Optional[float] = None
    model: Optional[str] = None
    year: Optional[Union[float, int]] = None
    notes: Optional[str] = None
    company_id: Optional[int] = None
    max_speed_kmph: Optional[float] = 60.0
    avg_speed_kmph: Optional[float] = 45.0
    status: Optional[str] = "available"


class TruckUpdate(BaseModel):
    registration_number: Optional[str] = None
    capacity: Optional[Union[float, int]] = None
    fuel_type: Optional[str] = None
    fuel_efficiency: Optional[Union[float, int]] = None
    mileage_kmpl: Optional[float] = None
    model: Optional[str] = None
    year: Optional[Union[float, int]] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    max_speed_kmph: Optional[float] = None
    avg_speed_kmph: Optional[float] = None


class BulkTruckItem(BaseModel):
    registration_number: str
    capacity: Optional[Union[float, int]] = 8000
    fuel_type: Optional[str] = "Diesel"
    fuel_efficiency: Optional[Union[float, int]] = 4.0
    mileage_kmpl: Optional[float] = 4.0
    model: Optional[str] = "Tata Prima 5530.S"
    year: Optional[Union[float, int]] = 2023
    notes: Optional[str] = None
    status: Optional[str] = "available"
    max_speed_kmph: Optional[float] = 60.0
    avg_speed_kmph: Optional[float] = 45.0


class BulkTruckRequest(BaseModel):
    trucks: List[BulkTruckItem]


def validate_truck_speeds(max_speed: Optional[float], avg_speed: Optional[float]) -> tuple:
    """
    Validates legal and cruising speed settings for trucks:
    - max_speed_kmph: legal/mechanical limit, default 80, allowed 20-120
    - avg_speed_kmph: cruising average, default 45, allowed 10 up to max_speed, must be <= max_speed
    """
    max_s = float(max_speed) if max_speed is not None else 80.0
    avg_s = float(avg_speed) if avg_speed is not None else 45.0

    if not (20.0 <= max_s <= 120.0):
        raise HTTPException(
            status_code=400,
            detail=f"Maximum speed ({max_s} km/h) is out of allowed range (20 to 120 km/h)."
        )
    if not (10.0 <= avg_s <= 120.0):
        raise HTTPException(
            status_code=400,
            detail=f"Average cruising speed ({avg_s} km/h) must be at least 10 km/h."
        )
    if avg_s > max_s:
        raise HTTPException(
            status_code=400,
            detail=f"Average cruising speed ({avg_s} km/h) cannot exceed maximum speed limit ({max_s} km/h)."
        )
    return round(max_s, 1), round(avg_s, 1)


@router.post("/")
def create_truck(
    registration_number: Optional[str] = None,
    capacity: Optional[float] = None,
    fuel_type: Optional[str] = None,
    fuel_efficiency: Optional[float] = None,
    mileage_kmpl: Optional[float] = None,
    model: Optional[str] = None,
    year: Optional[float] = None,
    notes: Optional[str] = None,
    company_id: Optional[int] = None,
    max_speed_kmph: Optional[float] = 60.0,
    avg_speed_kmph: Optional[float] = 45.0,
    payload: Optional[TruckCreate] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new truck asset within the authenticated user's workspace.
    Derives company_id strictly from current_user to maintain tenant isolation.
    """
    r_reg = (payload.registration_number if payload else registration_number or "").strip().upper()
    r_cap = payload.capacity if payload else capacity
    r_fuel = (payload.fuel_type if payload else fuel_type or "Diesel").strip()
    r_eff = payload.fuel_efficiency if payload else fuel_efficiency
    r_mileage = payload.mileage_kmpl if payload else mileage_kmpl
    r_model = (payload.model if payload else model or None)
    r_year = payload.year if payload else year
    r_notes = (payload.notes if payload else notes or None)
    r_max_s = payload.max_speed_kmph if payload else max_speed_kmph
    r_avg_s = payload.avg_speed_kmph if payload else avg_speed_kmph

    if not r_reg or r_cap is None:
        raise HTTPException(
            status_code=400,
            detail="Registration number and capacity are required."
        )

    # Workspace isolation: strictly derive company_id from current_user
    target_company_id = current_user.company_id

    existing_truck = (
        db.query(Truck)
        .filter(Truck.registration_number == r_reg)
        .first()
    )

    if existing_truck:
        raise HTTPException(
            status_code=400,
            detail="Truck with this registration number already exists"
        )

    valid_max_speed, valid_avg_speed = validate_truck_speeds(r_max_s, r_avg_s)

    eff_mileage = float(r_mileage) if r_mileage is not None else (float(r_eff) if r_eff is not None else 10.0)
    eff_int = int(round(float(r_eff))) if r_eff is not None else int(round(eff_mileage))
    cap_int = int(round(float(r_cap))) if r_cap is not None else 8000
    yr_int = int(round(float(r_year))) if r_year is not None else None

    truck = Truck(
        registration_number=r_reg,
        capacity=cap_int,
        fuel_type=r_fuel,
        fuel_efficiency=eff_int,
        mileage_kmpl=eff_mileage,
        trips_since_service=0,
        km_since_service=0.0,
        model=r_model,
        year=yr_int,
        notes=r_notes,
        company_id=target_company_id,
        user_id=current_user.id,
        status="available",
        max_speed_kmph=valid_max_speed,
        avg_speed_kmph=valid_avg_speed,
    )

    db.add(truck)
    db.commit()
    db.refresh(truck)

    return {
        "message": "Truck created successfully",
        "truck": _truck_dict(truck)
    }


@router.post("/bulk")
def bulk_create_trucks(
    payload: BulkTruckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Bulk import multiple trucks into the authenticated user's workspace.
    """
    if not payload.trucks:
        raise HTTPException(status_code=400, detail="No trucks provided in payload")

    created = []
    skipped = []
    curr_company_id = current_user.company_id
    curr_user_id = current_user.id

    # Get set of existing registration numbers for fast check
    existing_regs = {
        r[0].upper().strip() for r in db.query(Truck.registration_number).all()
        if r[0]
    }

    for item in payload.trucks:
        reg = item.registration_number.strip().upper() if item.registration_number else ""
        if not reg:
            continue
        if reg in existing_regs:
            skipped.append(reg)
            continue

        valid_max, valid_avg = validate_truck_speeds(item.max_speed_kmph, item.avg_speed_kmph)
        eff_mileage = float(item.mileage_kmpl) if item.mileage_kmpl is not None else (float(item.fuel_efficiency) if item.fuel_efficiency is not None else 4.0)
        eff_int = int(round(float(item.fuel_efficiency))) if item.fuel_efficiency is not None else int(round(eff_mileage))
        cap = int(round(float(item.capacity))) if item.capacity is not None else 8000
        yr = int(round(float(item.year))) if item.year is not None else 2023

        truck = Truck(
            registration_number=reg,
            capacity=cap,
            fuel_type=item.fuel_type or "Diesel",
            fuel_efficiency=eff_int,
            mileage_kmpl=eff_mileage,
            trips_since_service=0,
            km_since_service=0.0,
            model=item.model or "Heavy Cargo Hauler",
            year=yr,
            notes=item.notes,
            company_id=curr_company_id,
            user_id=curr_user_id,
            status=item.status or "available",
            max_speed_kmph=valid_max,
            avg_speed_kmph=valid_avg,
        )
        db.add(truck)
        created.append(truck)
        existing_regs.add(reg)

    db.commit()
    for t in created:
        db.refresh(t)

    msg = f"Successfully imported {len(created)} trucks."
    if skipped:
        msg += f" {len(skipped)} already existed ({', '.join(skipped[:5])})."

    return {
        "message": msg,
        "count": len(created),
        "skipped_count": len(skipped),
        "trucks": [_truck_dict(t) for t in created]
    }


@router.get("/available")
def get_available_trucks_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return only trucks that are verified free for dispatch within the user's workspace."""
    from app.optimization.fleet_queries import get_available_trucks
    available = get_available_trucks(db, company_id=current_user.company_id)
    return [_truck_dict(t) for t in available]


@router.get("/")
def get_trucks(
    available_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List trucks strictly scoped to the authenticated user's workspace."""
    from app.optimization.fleet_queries import get_available_trucks, sync_fleet_resource_statuses

    company_id = current_user.company_id
    if company_id and company_id != 1:
        if db.query(Truck).filter(Truck.company_id == company_id).count() == 0:
            from app.routes.auth import seed_starter_fleet_for_company
            seed_starter_fleet_for_company(db, company_id, current_user.name, user_id=current_user.id)
            db.commit()

    sync_fleet_resource_statuses(db, company_id=company_id)

    if available_only:
        trucks = get_available_trucks(db, company_id=company_id)
    else:
        trucks = db.query(Truck).filter(Truck.company_id == company_id).all()

    return [_truck_dict(t) for t in trucks]


@router.get("/{truck_id}")
def get_truck(
    truck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve details for a single truck within the user's workspace."""
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        Truck.company_id == current_user.company_id
    ).first()

    if not truck:
        raise HTTPException(
            status_code=404,
            detail="Truck not found"
        )

    return _truck_dict(truck)


@router.put("/{truck_id}")
def update_truck(
    truck_id: int,
    registration_number: Optional[str] = None,
    capacity: Optional[float] = None,
    fuel_type: Optional[str] = None,
    fuel_efficiency: Optional[float] = None,
    mileage_kmpl: Optional[float] = None,
    model: Optional[str] = None,
    year: Optional[float] = None,
    notes: Optional[str] = None,
    status: Optional[str] = None,
    max_speed_kmph: Optional[float] = None,
    avg_speed_kmph: Optional[float] = None,
    payload: Optional[TruckUpdate] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a truck asset belonging to the user's workspace."""
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        Truck.company_id == current_user.company_id
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    u_reg = payload.registration_number if payload and payload.registration_number is not None else registration_number
    u_cap = payload.capacity if payload and payload.capacity is not None else capacity
    u_fuel = payload.fuel_type if payload and payload.fuel_type is not None else fuel_type
    u_eff = payload.fuel_efficiency if payload and payload.fuel_efficiency is not None else fuel_efficiency
    u_mileage = payload.mileage_kmpl if payload and payload.mileage_kmpl is not None else mileage_kmpl
    u_model = payload.model if payload and payload.model is not None else model
    u_year = payload.year if payload and payload.year is not None else year
    u_notes = payload.notes if payload and payload.notes is not None else notes
    u_status = payload.status if payload and payload.status is not None else status
    u_max_s = payload.max_speed_kmph if payload and payload.max_speed_kmph is not None else max_speed_kmph
    u_avg_s = payload.avg_speed_kmph if payload and payload.avg_speed_kmph is not None else avg_speed_kmph

    # Check duplicate registration
    if u_reg and u_reg.strip().upper() != truck.registration_number:
        clean_reg = u_reg.strip().upper()
        existing = db.query(Truck).filter(
            Truck.registration_number == clean_reg,
            Truck.id != truck_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Another truck with this registration number already exists"
            )
        truck.registration_number = clean_reg

    if u_cap is not None:
        cap_val = int(round(float(u_cap)))
        if cap_val <= 0:
            raise HTTPException(status_code=400, detail="Capacity must be positive")
        truck.capacity = cap_val
    if u_fuel is not None:
        truck.fuel_type = u_fuel
    if u_eff is not None or u_mileage is not None:
        eff = float(u_mileage) if u_mileage is not None else float(u_eff)
        truck.mileage_kmpl = eff
        truck.fuel_efficiency = int(round(float(u_eff))) if u_eff is not None else int(round(eff))
    if u_model is not None:
        truck.model = u_model
    if u_year is not None:
        truck.year = int(round(float(u_year)))
    if u_notes is not None:
        truck.notes = u_notes
    if u_status is not None:
        allowed = ["available", "assigned", "in_maintenance", "inactive"]
        if u_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Status must be one of {allowed}"
            )
        truck.status = u_status

    if u_max_s is not None or u_avg_s is not None:
        curr_max = getattr(truck, "max_speed_kmph", 80.0) or 80.0
        curr_avg = getattr(truck, "avg_speed_kmph", 45.0) or 45.0
        target_max = u_max_s if u_max_s is not None else curr_max
        target_avg = u_avg_s if u_avg_s is not None else curr_avg
        valid_max, valid_avg = validate_truck_speeds(target_max, target_avg)
        truck.max_speed_kmph = valid_max
        truck.avg_speed_kmph = valid_avg

    try:
        db.commit()
        db.refresh(truck)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "Truck updated successfully",
        "truck": _truck_dict(truck)
    }


@router.delete("/{truck_id}")
def delete_truck(
    truck_id: int,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a truck from the user's workspace with active trip verification."""
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        Truck.company_id == current_user.company_id
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    # Check for active trips
    active_trip = db.query(Trip).filter(
        Trip.truck_id == truck_id,
        Trip.status.in_(["planned", "in_progress"])
    ).first()

    if active_trip and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Truck is assigned to active trip #{active_trip.id} "
                f"(status: {active_trip.status}). "
                "Deactivate the truck instead, or complete the trip first. "
                "Set force=true to override (use with caution)."
            )
        )

    if force or not active_trip:
        try:
            db.delete(truck)
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
        return {"message": f"Truck #{truck_id} deleted successfully"}

    # Deactivate instead
    truck.status = "inactive"
    db.commit()
    return {
        "message": f"Truck #{truck_id} has been deactivated (has active trips)",
        "truck": _truck_dict(truck)
    }


@router.patch("/{truck_id}/deactivate")
def deactivate_truck(
    truck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate a truck in the user's workspace."""
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        Truck.company_id == current_user.company_id
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    truck.status = "inactive"
    db.commit()
    db.refresh(truck)
    return {"message": "Truck deactivated", "truck": _truck_dict(truck)}


@router.post("/{truck_id}/reset-status")
def reset_truck_status(
    truck_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reset an assigned or turnaround truck's status to 'available' within the authenticated user's workspace.
    
    Validation & Business Logic:
    1. Validates that the truck belongs to the authenticated user's workspace (HTTP 404 if missing).
    2. Maintenance status protection: If truck is under maintenance, rejects with HTTP 400.
    3. Idempotent check: If truck is already available, returns early with no-op response.
    4. Active trip protection: If truck is currently in transit on an in_progress trip, rejects with HTTP 400.
    5. Planned trip reservation release: If truck is assigned to planned trips, releases the truck from
       those reservations (sets trip.truck_id = None) without deleting trip/order/driver records.
    6. Clears turnaround buffer (turnaround_until = None).
    7. Updates truck status to 'available', persists to database, and returns updated record.
    """
    truck = db.query(Truck).filter(
        Truck.id == truck_id,
        Truck.company_id == current_user.company_id
    ).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    # 1. Maintenance status protection
    if truck.status in ("maintenance", "in_maintenance"):
        raise HTTPException(
            status_code=400,
            detail=f"Truck {truck.registration_number} is currently under maintenance. Complete maintenance service before marking it available."
        )

    # 2. Idempotent check
    if truck.status == "available":
        return {
            "message": f"Truck {truck.registration_number} is already available.",
            "truck": _truck_dict(truck)
        }

    # 3. Active in-progress trip validation (do NOT silently complete in-transit trips)
    in_progress_trip = db.query(Trip).filter(
        Trip.truck_id == truck_id,
        Trip.status == "in_progress"
    ).first()
    if in_progress_trip:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot make Truck {truck.registration_number} available: Vehicle is actively in transit on Trip #{in_progress_trip.id}."
        )

    # 4. Cleanly release planned trip reservations so sync_fleet_resource_statuses doesn't revert status
    planned_trips = db.query(Trip).filter(
        Trip.truck_id == truck_id,
        Trip.status == "planned"
    ).all()
    for pt in planned_trips:
        pt.truck_id = None

    # 5. Persist available status
    truck.status = "available"
    truck.turnaround_until = None

    try:
        db.commit()
        db.refresh(truck)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset truck status: {str(e)}")

    return {
        "message": f"Truck {truck.registration_number} status successfully reset to available.",
        "truck": _truck_dict(truck)
    }


@router.post("/reset-all-idle")
def reset_all_idle_trucks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reset all trucks in user's workspace that are not on in-progress trips back to 'available'.
    Releases planned trip reservations and preserves maintenance status.
    """
    in_progress_truck_ids = {
        r[0] for r in db.query(Trip.truck_id).filter(
            Trip.status == "in_progress"
        ).all() if r[0]
    }

    trucks = db.query(Truck).filter(
        Truck.company_id == current_user.company_id
    ).all()

    reset_count = 0
    for t in trucks:
        if t.status in ("maintenance", "in_maintenance"):
            continue
        if t.id in in_progress_truck_ids:
            continue
        if t.status != "available":
            # Release planned reservations
            planned_trips = db.query(Trip).filter(
                Trip.truck_id == t.id,
                Trip.status == "planned"
            ).all()
            for pt in planned_trips:
                pt.truck_id = None

            t.status = "available"
            t.turnaround_until = None
            reset_count += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset idle trucks: {str(e)}")

    return {
        "message": f"Reset {reset_count} idle trucks back to available.",
        "reset_count": reset_count
    }


def _truck_dict(truck):
    return {
        "id": truck.id,
        "registration_number": truck.registration_number,
        "capacity": truck.capacity,
        "fuel_type": truck.fuel_type,
        "fuel_efficiency": truck.fuel_efficiency,
        "mileage_kmpl": float(getattr(truck, "mileage_kmpl", 5.0) or getattr(truck, "fuel_efficiency", 5.0) or 5.0),
        "trips_since_service": int(getattr(truck, "trips_since_service", 0) or 0),
        "km_since_service": float(getattr(truck, "km_since_service", 0.0) or 0.0),
        "last_service_date": getattr(truck, "last_service_date", None),
        "turnaround_until": getattr(truck, "turnaround_until", None),
        "model": truck.model,
        "year": truck.year,
        "notes": truck.notes,
        "status": truck.status,
        "max_speed_kmph": float(getattr(truck, "max_speed_kmph", 80.0) or 80.0),
        "avg_speed_kmph": float(getattr(truck, "avg_speed_kmph", 45.0) or 45.0),
        "volume_capacity": float(getattr(truck, "volume_capacity", 80.0) or 80.0),
        "company_id": truck.company_id,
        "user_id": getattr(truck, "user_id", None),
    }
