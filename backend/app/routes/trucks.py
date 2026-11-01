from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

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
    mileage_kmpl: Optional[float] = None
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
    mileage_kmpl: Optional[float] = None
    model: Optional[str] = None
    year: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    max_speed_kmph: Optional[float] = None
    avg_speed_kmph: Optional[float] = None


class BulkTruckItem(BaseModel):
    registration_number: str
    capacity: Optional[int] = 8000
    fuel_type: Optional[str] = "Diesel"
    fuel_efficiency: Optional[int] = 4
    mileage_kmpl: Optional[float] = 4.0
    model: Optional[str] = "Tata Prima 5530.S"
    year: Optional[int] = 2023
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
    registration_number: str,
    capacity: int,
    fuel_type: str,
    fuel_efficiency: int = None,
    mileage_kmpl: float = None,
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

    eff_mileage = float(mileage_kmpl) if mileage_kmpl else (float(fuel_efficiency) if fuel_efficiency else 10.0)

    truck = Truck(
        registration_number=registration_number,
        capacity=capacity,
        fuel_type=fuel_type,
        fuel_efficiency=fuel_efficiency or int(eff_mileage),
        mileage_kmpl=eff_mileage,
        trips_since_service=0,
        km_since_service=0.0,
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


@router.post("/bulk")
def bulk_create_trucks(
    payload: BulkTruckRequest,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Bulk import multiple trucks at once from CSV or JSON list.
    """
    if not payload.trucks:
        raise HTTPException(status_code=400, detail="No trucks provided in payload")

    created = []
    skipped = []
    curr_company_id = current_user.company_id if current_user else 1
    curr_user_id = current_user.id if current_user else None

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
        eff_mileage = float(item.mileage_kmpl) if item.mileage_kmpl else (float(item.fuel_efficiency) if item.fuel_efficiency else 4.0)

        truck = Truck(
            registration_number=reg,
            capacity=item.capacity if item.capacity else 8000,
            fuel_type=item.fuel_type or "Diesel",
            fuel_efficiency=item.fuel_efficiency or int(eff_mileage),
            mileage_kmpl=eff_mileage,
            trips_since_service=0,
            km_since_service=0.0,
            model=item.model or "Heavy Cargo Hauler",
            year=item.year or 2023,
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
        "mileage_kmpl": float(getattr(truck, "mileage_kmpl", 5.0) or getattr(truck, "fuel_efficiency", 5.0) or 5.0),
        "trips_since_service": int(getattr(truck, "trips_since_service", 0) or 0),
        "km_since_service": float(getattr(truck, "km_since_service", 0.0) or 0.0),
        "last_service_date": getattr(truck, "last_service_date", None),
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