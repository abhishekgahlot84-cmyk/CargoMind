from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional, List, Union

from app.database.connection import get_db
from app.database.models import Driver, Trip, User, WellnessHistory
from app.routes.auth import get_current_user_optional
from app.optimization.wellness import compute_driver_wellness, update_and_persist_driver_wellness


router = APIRouter(
    prefix="/drivers",
    tags=["Drivers"]
)


class RestRequest(BaseModel):
    rest_hours: float = Field(default=8.0, ge=1.0, le=48.0, description="Mandatory rest duration in hours")
    notes: Optional[str] = None


class BulkDriverItem(BaseModel):
    name: str
    license_category: Optional[str] = "Heavy (HCV)"
    license_number: Optional[str] = None
    phone: Optional[str] = None
    experience_years: Optional[Union[float, int]] = 3
    working_hours: Optional[Union[float, int]] = 0
    rest_hours: Optional[Union[float, int]] = 8
    notes: Optional[str] = None
    status: Optional[str] = "available"


class BulkDriverRequest(BaseModel):
    drivers: List[BulkDriverItem]


def _driver_dict(driver, db: Optional[Session] = None):
    # Compute real-time wellness info
    wellness = compute_driver_wellness(driver, db=db)
    return {
        "id": driver.id,
        "name": driver.name,
        "license_category": driver.license_category,
        "license_number": driver.license_number,
        "phone": driver.phone,
        "experience_years": driver.experience_years,
        "working_hours": driver.working_hours,
        "rest_hours": driver.rest_hours,
        "notes": driver.notes,
        "status": driver.status,
        "company_id": driver.company_id,
        "user_id": getattr(driver, "user_id", None),
        "wellness_score": wellness["score"],
        "wellness_band": wellness["band"],
        "is_assignable": wellness["is_assignable"],
        "blocking_reason": wellness["blocking_reason"],
        "is_actively_resting": wellness.get("is_actively_resting", False),
        "rest_until": getattr(driver, "rest_until", None),
        "rest_hours_remaining": wellness.get("rest_hours_remaining", 0.0),
        "hours_driven_24h": getattr(driver, "hours_driven_24h", 0.0) or 0.0,
        "hours_driven_7d": getattr(driver, "hours_driven_7d", 0.0) or 0.0,
        "night_driving_hours": getattr(driver, "night_driving_hours", 0.0) or 0.0,
        "consecutive_working_days": getattr(driver, "consecutive_working_days", 0) or 0,
        "last_rest_start": getattr(driver, "last_rest_start", None),
        "wellness_reasons": wellness["reasons"],
    }


@router.post("/")
def create_driver(
    name: str,
    license_category: str,
    experience_years: float = 0.0,
    working_hours: float = 0.0,
    rest_hours: float = 0.0,
    license_number: str = None,
    phone: str = None,
    notes: str = None,
    company_id: int = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    target_company_id = company_id if (company_id and company_id != 1) else current_user.company_id

    driver = Driver(
        name=name.strip(),
        license_category=license_category,
        experience_years=int(round(float(experience_years))) if experience_years is not None else 0,
        working_hours=int(round(float(working_hours))) if working_hours is not None else 0,
        rest_hours=int(round(float(rest_hours))) if rest_hours is not None else 0,
        license_number=license_number.strip() if license_number else None,
        phone=phone.strip() if phone else None,
        notes=notes,
        company_id=target_company_id,
        user_id=current_user.id,
        status="available"
    )

    db.add(driver)
    db.commit()
    db.refresh(driver)

    return {
        "message": "Driver created successfully",
        "driver": _driver_dict(driver, db=db)
    }


@router.get("/")
def get_drivers(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    drivers = db.query(Driver).filter(
        (Driver.user_id == current_user.id) | (Driver.company_id == current_user.company_id)
    ).all()
    return [_driver_dict(d, db=db) for d in drivers]


@router.get("/{driver_id}")
def get_driver(
    driver_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = (
        db.query(Driver)
        .filter(Driver.id == driver_id, Driver.company_id == current_user.company_id)
        .first()
    )

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    return _driver_dict(driver, db=db)


@router.put("/{driver_id}")
def update_driver(
    driver_id: int,
    name: str = None,
    license_category: str = None,
    license_number: str = None,
    phone: str = None,
    experience_years: float = None,
    working_hours: float = None,
    rest_hours: float = None,
    notes: str = None,
    status: str = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    comp_id = current_user.company_id if current_user else 1
    user_id = current_user.id if current_user else None
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        (Driver.company_id == comp_id) | (Driver.user_id == user_id)
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if name is not None:
        driver.name = name.strip()
    if license_category is not None:
        driver.license_category = license_category
    if license_number is not None:
        driver.license_number = license_number.strip() if license_number else None
    if phone is not None:
        driver.phone = phone.strip() if phone else None
    if experience_years is not None:
        val_exp = int(round(float(experience_years)))
        if val_exp < 0:
            raise HTTPException(status_code=400, detail="Experience years cannot be negative")
        driver.experience_years = val_exp
    if working_hours is not None:
        val_work = int(round(float(working_hours)))
        if val_work < 0:
            raise HTTPException(status_code=400, detail="Working hours cannot be negative")
        driver.working_hours = val_work
    if rest_hours is not None:
        val_rest = int(round(float(rest_hours)))
        if val_rest < 0:
            raise HTTPException(status_code=400, detail="Rest hours cannot be negative")
        driver.rest_hours = val_rest
    if notes is not None:
        driver.notes = notes
    if status is not None:
        allowed = ["available", "assigned", "busy", "off_duty", "inactive", "resting"]
        if status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Status must be one of {allowed}"
            )
        driver.status = status

    try:
        db.commit()
        db.refresh(driver)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "Driver updated successfully",
        "driver": _driver_dict(driver, db=db)
    }


@router.delete("/{driver_id}")
def delete_driver(
    driver_id: int,
    force: bool = False,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == current_user.company_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Check for active trips
    active_trip = db.query(Trip).filter(
        Trip.driver_id == driver_id,
        Trip.status.in_(["planned", "in_progress"])
    ).first()

    if active_trip and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Driver is assigned to active trip #{active_trip.id} "
                f"(status: {active_trip.status}). "
                "Deactivate the driver instead, or complete the trip first."
            )
        )

    try:
        db.delete(driver)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    return {"message": f"Driver #{driver_id} deleted successfully"}


@router.patch("/{driver_id}/deactivate")
def deactivate_driver(
    driver_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == current_user.company_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.status = "inactive"
    db.commit()
    db.refresh(driver)
    return {"message": "Driver deactivated", "driver": _driver_dict(driver, db=db)}


@router.get("/{driver_id}/wellness")
def get_driver_wellness(
    driver_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        Driver.company_id == current_user.company_id
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    wellness = compute_driver_wellness(driver, db=db)
    return {
        "driver_id": driver.id,
        "driver_name": driver.name,
        **wellness
    }


@router.post("/{driver_id}/wellness/recompute")
def recompute_driver_wellness_endpoint(
    driver_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        Driver.company_id == current_user.company_id
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    wellness = update_and_persist_driver_wellness(driver, db=db)
    return {
        "message": "Driver wellness recomputed successfully",
        "driver_id": driver.id,
        **wellness
    }


@router.get("/{driver_id}/wellness/history")
def get_driver_wellness_history(
    driver_id: int,
    limit: int = 15,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        Driver.company_id == current_user.company_id
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    history = (
        db.query(WellnessHistory)
        .filter(WellnessHistory.driver_id == driver_id)
        .order_by(WellnessHistory.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": h.id,
            "driver_id": h.driver_id,
            "score": h.score,
            "band": h.band,
            "computed_at": h.computed_at,
            "breakdown": h.breakdown,
        }
        for h in history
    ]


@router.post("/{driver_id}/send-to-rest")
def send_driver_to_rest(
    driver_id: int,
    payload: Optional[RestRequest] = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Send a fatigued driver to mandatory rest for specified hours (default 8h).
    Calculates exact future availability timestamp, sets status to resting,
    resets 24h driving fatigue, and persists wellness log.
    """
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        Driver.company_id == current_user.company_id
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    rest_hours = payload.rest_hours if payload else 8.0
    now_utc = datetime.now(timezone.utc)
    rest_until_utc = now_utc + timedelta(hours=rest_hours)

    driver.status = "resting"
    driver.last_rest_start = now_utc.isoformat()
    driver.rest_until = rest_until_utc.isoformat()
    driver.rest_hours = rest_hours
    # Reset shift fatigue counters during mandatory rest
    driver.hours_driven_24h = 0.0
    driver.night_driving_hours = 0.0
    if payload and payload.notes:
        driver.notes = f"{driver.notes or ''} [Rest {rest_hours}h: {payload.notes}]".strip()

    wellness = update_and_persist_driver_wellness(driver, db=db, persist_history=True)

    return {
        "message": f"Driver {driver.name} assigned to {rest_hours}h mandatory rest until {driver.rest_until}",
        "available_at": driver.rest_until,
        "rest_hours": rest_hours,
        "driver": _driver_dict(driver, db=db)
    }


@router.post("/{driver_id}/end-rest")
def end_driver_rest(
    driver_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Manually complete or cancel driver rest period, returning driver to available status.
    """
    driver = db.query(Driver).filter(
        Driver.id == driver_id,
        Driver.company_id == current_user.company_id
    ).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.status = "available"
    driver.rest_until = None
    driver.hours_driven_24h = 0.0
    driver.night_driving_hours = 0.0
    driver.rest_hours = max(float(driver.rest_hours or 0.0), 8.0)

    wellness = update_and_persist_driver_wellness(driver, db=db, persist_history=True)

    return {
        "message": f"Rest completed for {driver.name}. Driver is now available for truck assignment.",
        "driver": _driver_dict(driver, db=db)
    }


@router.post("/bulk")
def bulk_create_drivers(
    payload: BulkDriverRequest,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Bulk import multiple drivers at once from CSV or JSON list.
    """
    if not payload.drivers:
        raise HTTPException(status_code=400, detail="No drivers provided in payload")

    created = []
    curr_company_id = current_user.company_id if current_user else 1
    curr_user_id = current_user.id if current_user else None

    for item in payload.drivers:
        if not item.name or not item.name.strip():
            continue
        driver = Driver(
            name=item.name.strip(),
            license_category=item.license_category or "Heavy (HCV)",
            license_number=item.license_number.strip() if item.license_number else None,
            phone=item.phone.strip() if item.phone else None,
            experience_years=int(round(float(item.experience_years))) if item.experience_years is not None else 3,
            working_hours=int(round(float(item.working_hours or 0))),
            rest_hours=int(round(float(item.rest_hours))) if item.rest_hours is not None else 8,
            notes=item.notes,
            company_id=curr_company_id,
            user_id=curr_user_id,
            status=item.status or "available",
            wellness_score=90,
            hours_driven_24h=0.0,
            hours_driven_7d=0.0,
            night_driving_hours=0.0,
            consecutive_working_days=0,
        )
        db.add(driver)
        created.append(driver)

    db.commit()
    for d in created:
        db.refresh(d)

    return {
        "message": f"Successfully imported {len(created)} drivers",
        "count": len(created),
        "drivers": [_driver_dict(d, db=db) for d in created]
    }
