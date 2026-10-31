from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from app.database.connection import get_db
from app.database.models import (
    Driver, DriverHandover, Hub, Trip, Truck
)
from app.optimization.wellness import compute_driver_wellness
from app.optimization.handover_planner import (
    plan_journey_handovers,
    find_hubs_on_route,
    compute_cumulative_distances,
)

router = APIRouter(
    prefix="/handovers",
    tags=["Driver Handovers"]
)


def _handover_dict(h) -> dict:
    return {
        "id": h.id,
        "trip_id": h.trip_id,
        "hub_id": h.hub_id,
        "hub_name": h.hub.name if h.hub else None,
        "outgoing_driver_id": h.outgoing_driver_id,
        "outgoing_driver_name": h.outgoing_driver.name if h.outgoing_driver else None,
        "incoming_driver_id": h.incoming_driver_id,
        "incoming_driver_name": h.incoming_driver.name if h.incoming_driver else None,
        "planned_handover_time": h.planned_handover_time,
        "actual_handover_time": h.actual_handover_time,
        "status": h.status,
        "outgoing_km": h.outgoing_km,
        "notes": h.notes,
        "confirmed_by_user_id": h.confirmed_by_user_id,
    }


class HandoverPlan(BaseModel):
    trip_id: int
    hub_id: int
    outgoing_driver_id: int
    incoming_driver_id: int
    planned_handover_time: str
    outgoing_km: Optional[float] = None
    notes: Optional[str] = None


class HandoverExecute(BaseModel):
    confirmed_by_user_id: Optional[int] = None
    notes: Optional[str] = None


@router.post("/plan")
def plan_handover(
    data: HandoverPlan,
    db: Session = Depends(get_db)
):
    """Plan a driver handover at a hub for an active trip."""

    # Validate trip
    trip = db.query(Trip).filter(Trip.id == data.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.status not in ["planned", "in_progress"]:
        raise HTTPException(
            status_code=409,
            detail=f"Trip #{data.trip_id} is not active (status: {trip.status})"
        )

    # Validate hub
    hub = db.query(Hub).filter(Hub.id == data.hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    if hub.operational_status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Hub '{hub.name}' is not operationally active (status: {hub.operational_status})"
        )

    # Validate outgoing driver is currently assigned to trip
    if trip.driver_id != data.outgoing_driver_id:
        raise HTTPException(
            status_code=409,
            detail=f"Driver #{data.outgoing_driver_id} is not the current driver of trip #{data.trip_id}. "
                   f"Current driver is #{trip.driver_id}"
        )

    # Validate incoming driver exists and is available
    incoming_driver = db.query(Driver).filter(Driver.id == data.incoming_driver_id).first()
    if not incoming_driver:
        raise HTTPException(status_code=404, detail=f"Incoming driver #{data.incoming_driver_id} not found")

    # Validate incoming driver wellness and mandatory rest
    in_wellness = compute_driver_wellness(incoming_driver, db=db)
    if in_wellness["score"] < 60:
        raise HTTPException(
            status_code=400,
            detail=f"Driver {incoming_driver.name} cannot be assigned: wellness score is {in_wellness['score']}/100 (< 60 minimum required)."
        )
    if (incoming_driver.rest_hours or 0) < 8:
        raise HTTPException(
            status_code=400,
            detail=f"Driver {incoming_driver.name} has only {incoming_driver.rest_hours or 0}h rest (< 8h mandatory rest required)."
        )

    # Check incoming driver is not the same as outgoing
    if data.incoming_driver_id == data.outgoing_driver_id:
        raise HTTPException(status_code=400, detail="Incoming and outgoing drivers must be different")

    # Validate hub is along the trip's route if trip has planned route coordinates
    if trip.planned_route and isinstance(trip.planned_route, dict):
        coords = trip.planned_route.get("coordinates", [])
        if coords and len(coords) >= 2:
            cum = compute_cumulative_distances(coords)
            on_route_hubs = find_hubs_on_route(coords, cum, [hub], search_radius_km=85.0)
            if not on_route_hubs:
                raise HTTPException(
                    status_code=400,
                    detail=f"Hub '{hub.name}' is not located along the route for trip #{trip.id}. Please select a hub on this corridor."
                )

    # Check no duplicate pending handover for this trip
    existing = db.query(DriverHandover).filter(
        DriverHandover.trip_id == data.trip_id,
        DriverHandover.status.in_(["planned", "confirmed"])
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Trip #{data.trip_id} already has a pending handover plan #{existing.id}. Cancel it first."
        )

    # Validate planned time format
    try:
        datetime.fromisoformat(data.planned_handover_time.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid planned_handover_time format: {data.planned_handover_time}. Use ISO 8601."
        )

    handover = DriverHandover(
        trip_id=data.trip_id,
        hub_id=data.hub_id,
        outgoing_driver_id=data.outgoing_driver_id,
        incoming_driver_id=data.incoming_driver_id,
        planned_handover_time=data.planned_handover_time,
        outgoing_km=data.outgoing_km,
        notes=data.notes,
        status="planned"
    )

    try:
        db.add(handover)
        db.commit()
        db.refresh(handover)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save handover plan: {str(e)}")

    return {
        "message": "Handover planned successfully",
        "handover": _handover_dict(handover)
    }


@router.post("/{handover_id}/execute")
def execute_handover(
    handover_id: int,
    data: HandoverExecute = HandoverExecute(),
    db: Session = Depends(get_db)
):
    """Execute a planned handover: switch the driver on the trip."""

    handover = db.query(DriverHandover).filter(DriverHandover.id == handover_id).first()
    if not handover:
        raise HTTPException(status_code=404, detail="Handover plan not found")

    if handover.status not in ["planned", "confirmed"]:
        raise HTTPException(
            status_code=409,
            detail=f"Handover #{handover_id} cannot be executed (status: {handover.status})"
        )

    # Re-validate the trip is still active
    trip = db.query(Trip).filter(Trip.id == handover.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip no longer exists")
    if trip.status not in ["planned", "in_progress"]:
        raise HTTPException(
            status_code=409,
            detail=f"Trip #{trip.id} is no longer active (status: {trip.status})"
        )

    # Confirm outgoing driver still assigned
    if trip.driver_id != handover.outgoing_driver_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Current trip driver #{trip.driver_id} does not match "
                f"planned outgoing driver #{handover.outgoing_driver_id}. "
                "The trip may have already been handed over."
            )
        )

    # Validate incoming driver
    incoming_driver = db.query(Driver).filter(Driver.id == handover.incoming_driver_id).first()
    if not incoming_driver:
        raise HTTPException(status_code=404, detail="Incoming driver not found")

    # Check incoming driver has no conflicting active trip
    conflicting_trip = db.query(Trip).filter(
        Trip.driver_id == handover.incoming_driver_id,
        Trip.id != trip.id,
        Trip.status.in_(["planned", "in_progress"])
    ).first()

    if conflicting_trip:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Incoming driver #{handover.incoming_driver_id} is already assigned to "
                f"trip #{conflicting_trip.id} (status: {conflicting_trip.status})"
            )
        )

    outgoing_driver = db.query(Driver).filter(Driver.id == handover.outgoing_driver_id).first()

    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # Perform the handover atomically
        trip.driver_id = handover.incoming_driver_id

        # Update driver statuses
        if incoming_driver:
            incoming_driver.status = "assigned"
        if outgoing_driver:
            # Check outgoing driver has no other active trips
            other_trip = db.query(Trip).filter(
                Trip.driver_id == handover.outgoing_driver_id,
                Trip.id != trip.id,
                Trip.status.in_(["planned", "in_progress"])
            ).first()
            if not other_trip:
                outgoing_driver.status = "available"

        # Record the handover
        handover.actual_handover_time = now_iso
        handover.status = "executed"
        if data.confirmed_by_user_id:
            handover.confirmed_by_user_id = data.confirmed_by_user_id
        if data.notes:
            handover.notes = (handover.notes or "") + f"\nExecution note: {data.notes}"

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to execute handover: {str(e)}")

    return {
        "message": "Handover executed successfully. Driver updated on the trip.",
        "trip_id": trip.id,
        "new_driver_id": trip.driver_id,
        "new_driver_name": incoming_driver.name if incoming_driver else None,
        "handover": _handover_dict(handover),
        "executed_at": now_iso,
    }


@router.get("/")
def get_handovers(
    trip_id: int = None,
    status: str = None,
    db: Session = Depends(get_db)
):
    query = db.query(DriverHandover)
    if trip_id:
        query = query.filter(DriverHandover.trip_id == trip_id)
    if status:
        query = query.filter(DriverHandover.status == status)

    handovers = query.all()
    return [_handover_dict(h) for h in handovers]


@router.get("/eligible-drivers")
def get_eligible_relay_drivers_endpoint(
    db: Session = Depends(get_db)
):
    """
    Returns all eligible relay drivers ranked descending by wellness score.
    Used for the searchable dropdown in the Schedule Handover modal.
    """
    drivers = db.query(Driver).filter(Driver.status.in_(["available", "off_duty"])).all()
    results = []

    for d in drivers:
        w = compute_driver_wellness(d, db=db)
        results.append({
            "id": d.id,
            "name": d.name,
            "license_category": d.license_category,
            "phone": d.phone,
            "wellness_score": w["score"],
            "wellness_band": w["band"],
            "rest_hours": d.rest_hours or 0,
            "is_assignable": w["is_assignable"],
            "blocking_reason": w["blocking_reason"],
            "reasons": w["reasons"],
        })

    # Sort: assignable first, then by wellness score descending
    results.sort(key=lambda x: (1 if x["is_assignable"] else 0, x["wellness_score"]), reverse=True)
    return results


@router.get("/{handover_id}")
def get_handover(
    handover_id: int,
    db: Session = Depends(get_db)
):
    handover = db.query(DriverHandover).filter(DriverHandover.id == handover_id).first()
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    return _handover_dict(handover)


@router.patch("/{handover_id}/cancel")
@router.post("/{handover_id}/cancel")
def cancel_handover(
    handover_id: int,
    db: Session = Depends(get_db)
):
    handover = db.query(DriverHandover).filter(DriverHandover.id == handover_id).first()
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    if handover.status == "executed":
        raise HTTPException(status_code=409, detail="Cannot cancel an already executed handover")

    handover.status = "cancelled"
    db.commit()
    return {"message": "Handover cancelled", "handover_id": handover_id}


@router.get("/trip/{trip_id}/dashboard")
def get_trip_handover_dashboard(
    trip_id: int,
    db: Session = Depends(get_db)
):
    """Return handover dashboard data for a trip with live status and wellness alerts."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    from app.database.models import Order, Truck
    order = db.query(Order).filter(Order.id == trip.order_id).first() if trip.order_id else None
    truck = db.query(Truck).filter(Truck.id == trip.truck_id).first() if trip.truck_id else None
    current_driver = db.query(Driver).filter(Driver.id == trip.driver_id).first() if trip.driver_id else None

    driver_wellness = compute_driver_wellness(current_driver, db=db) if current_driver else None

    pending_handover = db.query(DriverHandover).filter(
        DriverHandover.trip_id == trip_id,
        DriverHandover.status.in_(["planned", "confirmed"])
    ).order_by(DriverHandover.id.desc()).first()

    # Check if handing over soon (within 60 minutes)
    handing_over_soon = False
    minutes_until_handover = None
    if pending_handover and pending_handover.planned_handover_time:
        try:
            planned_dt = datetime.fromisoformat(pending_handover.planned_handover_time.replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            if planned_dt.tzinfo is None:
                planned_dt = planned_dt.replace(tzinfo=timezone.utc)
            delta_mins = (planned_dt - now_dt).total_seconds() / 60.0
            minutes_until_handover = round(delta_mins, 1)
            if 0 <= delta_mins <= 60:
                handing_over_soon = True
        except Exception:
            pass

    past_handovers = db.query(DriverHandover).filter(
        DriverHandover.trip_id == trip_id,
        DriverHandover.status == "executed"
    ).all()

    # Generate or retrieve journey timeline segments
    timeline_segments = []
    if trip.planned_route and isinstance(trip.planned_route, dict):
        coords = trip.planned_route.get("coordinates", [])
        if coords and len(coords) >= 2:
            hubs = db.query(Hub).filter(Hub.operational_status == "active").all()
            plan_res = plan_journey_handovers(
                route_coordinates=coords,
                start_time=trip.start_time or datetime.now(timezone.utc).isoformat(),
                avg_speed_kmph=trip.average_speed_kmph or 45.0,
                hubs=hubs,
                origin_name=order.pickup_location if order else "Origin",
                dest_name=order.delivery_location if order else "Destination",
                initial_driver=current_driver,
            )
            timeline_segments = plan_res.get("segments", [])

    return {
        "trip_id": trip.id,
        "trip_status": trip.status,
        "truck_id": truck.id if truck else None,
        "truck_registration": truck.registration_number if truck else None,
        "origin": order.pickup_location if order else None,
        "destination": order.delivery_location if order else None,
        "current_driver_id": current_driver.id if current_driver else None,
        "current_driver_name": current_driver.name if current_driver else None,
        "current_driver_status": current_driver.status if current_driver else None,
        "driver_wellness": driver_wellness,
        "handing_over_soon": handing_over_soon,
        "minutes_until_handover": minutes_until_handover,
        "pending_handover": _handover_dict(pending_handover) if pending_handover else None,
        "past_handovers": [_handover_dict(h) for h in past_handovers],
        "total_handovers_executed": len(past_handovers),
        "timeline_segments": timeline_segments,
        "planned_route": trip.planned_route,
        "distance_km": trip.distance,
        "estimated_time_hours": trip.estimated_time,
    }


@router.post("/auto-plan/{trip_id}")
def auto_plan_handovers_endpoint(
    trip_id: int,
    db: Session = Depends(get_db)
):
    """
    Automatically plan driver relays for a trip based on the 8h limit,
    night driving rules, and available hubs along the route.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if not trip.planned_route or not isinstance(trip.planned_route, dict):
        raise HTTPException(
            status_code=400,
            detail="Trip does not have a planned route. Please generate a route first."
        )

    coords = trip.planned_route.get("coordinates", [])
    if not coords or len(coords) < 2:
        raise HTTPException(status_code=400, detail="Planned route has invalid coordinates.")

    hubs = db.query(Hub).filter(Hub.operational_status == "active").all()

    # Get available drivers ranked by wellness
    from app.optimization.fleet_queries import get_available_drivers
    available_drivers = get_available_drivers(db, company_id=trip.truck.company_id if trip.truck else None)

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time=trip.start_time or datetime.now(timezone.utc).isoformat(),
        avg_speed_kmph=trip.average_speed_kmph or 45.0,
        hubs=hubs,
        origin_name=trip.order.pickup_location if trip.order else "Origin",
        dest_name=trip.order.delivery_location if trip.order else "Destination",
        initial_driver=trip.driver,
        available_relay_drivers=available_drivers,
    )

    return plan


@router.get("/corridor-hubs/{trip_id}")
def get_corridor_hubs_for_trip(
    trip_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns only the hubs located on the specific route of this trip/truck.
    Used for the Handover Hub dropdown in the Schedule Handover modal.
    """
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if not trip.planned_route or not isinstance(trip.planned_route, dict):
        # Fallback to all active hubs if route not yet persisted
        hubs = db.query(Hub).filter(Hub.operational_status == "active").all()
        return [
            {
                "id": h.id,
                "name": h.name,
                "city": h.city,
                "km_along_route": None,
                "detour_km": None,
            }
            for h in hubs
        ]

    coords = trip.planned_route.get("coordinates", [])
    cum = compute_cumulative_distances(coords)
    hubs = db.query(Hub).filter(Hub.operational_status == "active").all()

    on_route = find_hubs_on_route(coords, cum, hubs, search_radius_km=85.0)

    # Exclude origin and destination endpoints (first and last within 15 km)
    total_km = cum[-1] if cum else 0.0
    intermediate_hubs = [
        {
            "id": h["hub_id"],
            "name": h["hub_name"],
            "city": h["city"],
            "km_along_route": h["km_along_route"],
            "detour_km": h["detour_km"],
        }
        for h in on_route
        if 15.0 < h["km_along_route"] < (total_km - 15.0)
    ]

    return intermediate_hubs
