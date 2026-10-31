from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database.connection import get_db
from app.database.models import Truck, Trip, User
from app.routes.auth import get_current_user_optional


router = APIRouter(
    prefix="/trucks",
    tags=["Trucks"]
)


class TruckCreate(BaseModel):
    registration_number: str
    capacity: int
    fuel_type: str
    fuel_efficiency: Optional[int] = None
    model: Optional[str] = None
    year: Optional[int] = None
    notes: Optional[str] = None
    company_id: Optional[int] = None
    max_speed_kmph: Optional[float] = 60.0
    avg_speed_kmph: Optional[float] = 45.0


class TruckUpdate(BaseModel):
    registration_number: Optional[str] = None
    capacity: Optional[int] = None
    fuel_type: Optional[str] = None
    fuel_efficiency: Optional[int] = None
    model: Optional[str] = None
    year: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    max_speed_kmph: Optional[float] = None
    avg_speed_kmph: Optional[float] = None


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
    registration_number: str,
    capacity: int,
    fuel_type: str,
    fuel_efficiency: int = None,
    model: str = None,
    year: int = None,
    notes: str = None,
    company_id: int = None,
    max_speed_kmph: float = 60.0,
    avg_speed_kmph: float = 45.0,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    target_company_id = company_id if (company_id and company_id != 1) else current_user.company_id

    existing_truck = (
        db.query(Truck)
        .filter(Truck.registration_number == registration_number)
        .first()
    )

    if existing_truck:
        raise HTTPException(
            status_code=400,
            detail="Truck with this registration number already exists"
        )

    valid_max_speed, valid_avg_speed = validate_truck_speeds(max_speed_kmph, avg_speed_kmph)

    truck = Truck(
        registration_number=registration_number,
        capacity=capacity,
        fuel_type=fuel_type,
        fuel_efficiency=fuel_efficiency,
        model=model,
        year=year,
        notes=notes,
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


@router.get("/available")
def get_available_trucks_endpoint(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Return only trucks that are verified free for dispatch and optimization."""
    from app.optimization.fleet_queries import get_available_trucks
    company_id = current_user.company_id if current_user else None
    available = get_available_trucks(db, company_id=company_id)
    return [_truck_dict(t) for t in available]


@router.get("/")
def get_trucks(
    available_only: bool = False,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    from app.optimization.fleet_queries import get_available_trucks, sync_fleet_resource_statuses

    company_id = current_user.company_id if current_user else None
    # Sync statuses first so database columns accurately reflect active trips
    sync_fleet_resource_statuses(db, company_id=company_id)

    if available_only:
        trucks = get_available_trucks(db, company_id=company_id)
    else:
        query = db.query(Truck)
        if current_user and current_user.company_id:
            query = query.filter((Truck.user_id == current_user.id) | (Truck.company_id == current_user.company_id))
        trucks = query.all()

    return [_truck_dict(t) for t in trucks]


@router.get("/{truck_id}")
def get_truck(
    truck_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Truck).filter(Truck.id == truck_id)
    if current_user and getattr(current_user, "company_id", None):
        query = query.filter(Truck.company_id == current_user.company_id)
    truck = query.first()

    if not truck:
        raise HTTPException(
            status_code=404,
            detail="Truck not found"
        )

    return _truck_dict(truck)


@router.put("/{truck_id}")
def update_truck(
    truck_id: int,
    registration_number: str = None,
    capacity: int = None,
    fuel_type: str = None,
    fuel_efficiency: int = None,
    model: str = None,
    year: int = None,
    notes: str = None,
    status: str = None,
    max_speed_kmph: float = None,
    avg_speed_kmph: float = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Truck).filter(Truck.id == truck_id)
    if current_user and getattr(current_user, "company_id", None):
        query = query.filter(Truck.company_id == current_user.company_id)
    truck = query.first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    # Check duplicate registration
    if registration_number and registration_number != truck.registration_number:
        existing = db.query(Truck).filter(
            Truck.registration_number == registration_number,
            Truck.id != truck_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Another truck with this registration number already exists"
            )
        truck.registration_number = registration_number

    if capacity is not None:
        if capacity <= 0:
            raise HTTPException(status_code=400, detail="Capacity must be positive")
        truck.capacity = capacity
    if fuel_type is not None:
        truck.fuel_type = fuel_type
    if fuel_efficiency is not None:
        truck.fuel_efficiency = fuel_efficiency
    if model is not None:
        truck.model = model
    if year is not None:
        truck.year = year
    if notes is not None:
        truck.notes = notes
    if status is not None:
        allowed = ["available", "assigned", "in_maintenance", "inactive"]
        if status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Status must be one of {allowed}"
            )
        truck.status = status

    if max_speed_kmph is not None or avg_speed_kmph is not None:
        curr_max = getattr(truck, "max_speed_kmph", 80.0) or 80.0
        curr_avg = getattr(truck, "avg_speed_kmph", 45.0) or 45.0
        target_max = max_speed_kmph if max_speed_kmph is not None else curr_max
        target_avg = avg_speed_kmph if avg_speed_kmph is not None else curr_avg
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
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    truck = db.query(Truck).filter(Truck.id == truck_id, Truck.company_id == current_user.company_id).first()
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
    db: Session = Depends(get_db)
):
    truck = db.query(Truck).filter(Truck.id == truck_id).first()
    if not truck:
        raise HTTPException(status_code=404, detail="Truck not found")

    truck.status = "inactive"
    db.commit()
    db.refresh(truck)
    return {"message": "Truck deactivated", "truck": _truck_dict(truck)}


def _truck_dict(truck):
    return {
        "id": truck.id,
        "registration_number": truck.registration_number,
        "capacity": truck.capacity,
        "fuel_type": truck.fuel_type,
        "fuel_efficiency": truck.fuel_efficiency,
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