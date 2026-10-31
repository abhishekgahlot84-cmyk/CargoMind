from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Maintenance, Truck, User
from app.routes.auth import get_current_user_optional


router = APIRouter(
    prefix="/maintenance",
    tags=["Maintenance"]
)


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
    # Verify truck belongs to user
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
        raise HTTPException(
            status_code=404,
            detail="Maintenance record not found"
        )

    return record