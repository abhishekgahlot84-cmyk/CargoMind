from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database.connection import get_db
from app.database.models import Driver, Trip, User
from app.routes.auth import get_current_user_optional


router = APIRouter(
    prefix="/drivers",
    tags=["Drivers"]
)


def _driver_dict(driver):
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
    }


@router.post("/")
def create_driver(
    name: str,
    license_category: str,
    experience_years: int = 0,
    working_hours: int = 0,
    rest_hours: int = 0,
    license_number: str = None,
    phone: str = None,
    notes: str = None,
    company_id: int = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    target_company_id = company_id if (company_id and company_id != 1) else current_user.company_id

    driver = Driver(
        name=name,
        license_category=license_category,
        experience_years=experience_years,
        working_hours=working_hours,
        rest_hours=rest_hours,
        license_number=license_number,
        phone=phone,
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
        "driver": _driver_dict(driver)
    }


@router.get("/")
def get_drivers(
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    drivers = db.query(Driver).filter(
        (Driver.user_id == current_user.id) | (Driver.company_id == current_user.company_id)
    ).all()
    return [_driver_dict(d) for d in drivers]


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

    return _driver_dict(driver)


@router.put("/{driver_id}")
def update_driver(
    driver_id: int,
    name: str = None,
    license_category: str = None,
    license_number: str = None,
    phone: str = None,
    experience_years: int = None,
    working_hours: int = None,
    rest_hours: int = None,
    notes: str = None,
    status: str = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.company_id == current_user.company_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    if name is not None:
        driver.name = name
    if license_category is not None:
        driver.license_category = license_category
    if license_number is not None:
        driver.license_number = license_number
    if phone is not None:
        driver.phone = phone
    if experience_years is not None:
        if experience_years < 0:
            raise HTTPException(status_code=400, detail="Experience years cannot be negative")
        driver.experience_years = experience_years
    if working_hours is not None:
        if working_hours < 0:
            raise HTTPException(status_code=400, detail="Working hours cannot be negative")
        driver.working_hours = working_hours
    if rest_hours is not None:
        if rest_hours < 0:
            raise HTTPException(status_code=400, detail="Rest hours cannot be negative")
        driver.rest_hours = rest_hours
    if notes is not None:
        driver.notes = notes
    if status is not None:
        allowed = ["available", "assigned", "busy", "off_duty", "inactive"]
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
        "driver": _driver_dict(driver)
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
    return {"message": "Driver deactivated", "driver": _driver_dict(driver)}