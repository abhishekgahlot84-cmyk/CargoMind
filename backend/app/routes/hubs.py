from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database.connection import get_db
from app.database.models import Hub, DriverHandover, Trip, User
from app.routes.auth import get_current_user_optional

router = APIRouter(
    prefix="/hubs",
    tags=["Hubs"]
)

HUB_TYPES = ["warehouse", "distribution_hub", "rest_stop", "handover_hub", "other"]
OPERATIONAL_STATUSES = ["active", "inactive", "under_maintenance"]


def _hub_dict(hub) -> dict:
    return {
        "id": hub.id,
        "name": hub.name,
        "hub_type": hub.hub_type,
        "address": hub.address,
        "city": hub.city,
        "state": hub.state,
        "country": hub.country,
        "latitude": hub.latitude,
        "longitude": hub.longitude,
        "place_id": hub.place_id,
        "operational_status": hub.operational_status,
        "capacity_tons": hub.capacity_tons,
        "available_facilities": hub.available_facilities or [],
        "contact_name": hub.contact_name,
        "contact_phone": hub.contact_phone,
        "notes": hub.notes,
        "company_id": hub.company_id,
        "user_id": getattr(hub, "user_id", None),
    }


@router.post("/")
def create_hub(
    name: str,
    hub_type: str = "warehouse",
    address: str = None,
    city: str = None,
    state: str = None,
    country: str = "India",
    latitude: str = None,
    longitude: str = None,
    place_id: str = None,
    operational_status: str = "active",
    capacity_tons: float = None,
    contact_name: str = None,
    contact_phone: str = None,
    notes: str = None,
    company_id: int = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    target_company_id = company_id if (company_id and company_id != 1) else current_user.company_id

    if hub_type not in HUB_TYPES:
        raise HTTPException(status_code=400, detail=f"hub_type must be one of {HUB_TYPES}")
    if operational_status not in OPERATIONAL_STATUSES:
        raise HTTPException(status_code=400, detail=f"operational_status must be one of {OPERATIONAL_STATUSES}")

    # Validate coordinates if provided
    if latitude is not None:
        try:
            lat = float(latitude)
            if not -90 <= lat <= 90:
                raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid latitude value")

    if longitude is not None:
        try:
            lon = float(longitude)
            if not -180 <= lon <= 180:
                raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid longitude value")

    if latitude is not None and longitude is not None:
        from app.optimization.india_boundary import is_point_inside_india
        if not is_point_inside_india(float(longitude), float(latitude)):
            raise HTTPException(
                status_code=400,
                detail=f"Hub location ({name}) coordinates ({latitude}, {longitude}) lie outside Indian territory. All hubs must be within India."
            )

    hub = Hub(
        name=name,
        hub_type=hub_type,
        address=address,
        city=city,
        state=state,
        country=country,
        latitude=latitude,
        longitude=longitude,
        place_id=place_id,
        operational_status=operational_status,
        capacity_tons=capacity_tons,
        contact_name=contact_name,
        contact_phone=contact_phone,
        notes=notes,
        company_id=target_company_id,
        user_id=current_user.id,
    )

    db.add(hub)
    db.commit()
    db.refresh(hub)

    return {
        "message": "Hub created successfully",
        "hub": _hub_dict(hub)
    }


@router.get("/")
def get_hubs(
    hub_type: Optional[str] = None,
    operational_status: Optional[str] = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Hub).filter(
        (Hub.user_id == current_user.id) | (Hub.company_id == current_user.company_id)
    )
    if hub_type:
        query = query.filter(Hub.hub_type == hub_type)
    if operational_status:
        query = query.filter(Hub.operational_status == operational_status)

    hubs = query.all()
    return [_hub_dict(h) for h in hubs]


@router.get("/{hub_id}")
def get_hub(
    hub_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    hub = db.query(Hub).filter(Hub.id == hub_id, Hub.company_id == current_user.company_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    return _hub_dict(hub)


@router.put("/{hub_id}")
def update_hub(
    hub_id: int,
    name: str = None,
    hub_type: str = None,
    address: str = None,
    city: str = None,
    state: str = None,
    country: str = None,
    latitude: str = None,
    longitude: str = None,
    place_id: str = None,
    operational_status: str = None,
    capacity_tons: float = None,
    contact_name: str = None,
    contact_phone: str = None,
    notes: str = None,
    db: Session = Depends(get_db)
):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    if name is not None: hub.name = name
    if hub_type is not None:
        if hub_type not in HUB_TYPES:
            raise HTTPException(status_code=400, detail=f"hub_type must be one of {HUB_TYPES}")
        hub.hub_type = hub_type
    if address is not None: hub.address = address
    if city is not None: hub.city = city
    if state is not None: hub.state = state
    if country is not None: hub.country = country
    if latitude is not None:
        try:
            lat = float(latitude)
            if not -90 <= lat <= 90:
                raise HTTPException(status_code=400, detail="Latitude must be between -90 and 90")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid latitude value")
        hub.latitude = latitude
    if longitude is not None:
        try:
            lon = float(longitude)
            if not -180 <= lon <= 180:
                raise HTTPException(status_code=400, detail="Longitude must be between -180 and 180")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid longitude value")
        hub.longitude = longitude
    if place_id is not None: hub.place_id = place_id
    if operational_status is not None:
        if operational_status not in OPERATIONAL_STATUSES:
            raise HTTPException(status_code=400, detail=f"operational_status must be one of {OPERATIONAL_STATUSES}")
        hub.operational_status = operational_status
    if capacity_tons is not None: hub.capacity_tons = capacity_tons
    if contact_name is not None: hub.contact_name = contact_name
    if contact_phone is not None: hub.contact_phone = contact_phone
    if notes is not None: hub.notes = notes

    try:
        db.commit()
        db.refresh(hub)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "Hub updated successfully",
        "hub": _hub_dict(hub)
    }


@router.delete("/{hub_id}")
def delete_hub(
    hub_id: int,
    force: bool = False,
    db: Session = Depends(get_db)
):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    # Check if hub is used by active handovers
    active_handover = db.query(DriverHandover).filter(
        DriverHandover.hub_id == hub_id,
        DriverHandover.status.in_(["planned", "confirmed"])
    ).first()

    if active_handover and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Hub is used by an active handover plan #{active_handover.id}. "
                "Deactivate the hub instead of deleting it, or cancel the handover first."
            )
        )

    if not force and not active_handover:
        # Safe to delete
        pass
    elif active_handover and not force:
        # Already raised above
        pass

    try:
        db.delete(hub)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    return {"message": f"Hub #{hub_id} deleted successfully"}


@router.patch("/{hub_id}/deactivate")
def deactivate_hub(
    hub_id: int,
    db: Session = Depends(get_db)
):
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    hub.operational_status = "inactive"
    db.commit()
    db.refresh(hub)
    return {"message": "Hub deactivated", "hub": _hub_dict(hub)}


@router.get("/types/list")
def get_hub_types():
    return {"types": HUB_TYPES, "statuses": OPERATIONAL_STATUSES}
