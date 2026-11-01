from datetime import datetime, timezone, date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database.connection import get_db
from app.database.models import Order, Trip, CARGO_CATEGORIES, User
from app.routes.auth import get_current_user_optional

router = APIRouter(
    prefix="/orders",
    tags=["Orders"]
)

URGENCY_THRESHOLDS_HOURS = {
    "critical": 0,    # already late or slack <= 0
    "urgent": 6,      # slack <= 6h
    "normal": 24,     # slack <= 24h
    "scheduled": 999, # more than 24h
}


def calculate_urgency(order) -> str:
    """Calculate urgency based on delivery deadline and estimated travel time."""
    deadline_str = order.delivery_deadline or order.deadline
    if not deadline_str:
        return "normal"

    now = datetime.now(timezone.utc)

    # Try to parse deadline
    deadline = None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d-%m-%y",
    ):
        try:
            parsed = datetime.strptime(str(deadline_str).strip(), fmt)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            deadline = parsed
            break
        except ValueError:
            continue

    if deadline is None:
        return "normal"

    remaining_hours = (deadline - now).total_seconds() / 3600.0
    estimated_travel = float(order.estimated_travel_hours or 0)
    handling = float(order.handling_time_hours or 0.5)
    slack = remaining_hours - estimated_travel - handling

    if slack <= 0 or remaining_hours <= 0:
        return "critical"
    elif slack <= URGENCY_THRESHOLDS_HOURS["urgent"]:
        return "urgent"
    elif slack <= URGENCY_THRESHOLDS_HOURS["normal"]:
        return "normal"
    else:
        return "scheduled"


def compute_and_validate_volume(
    length: Optional[float] = None,
    width: Optional[float] = None,
    height: Optional[float] = None,
    dimension_unit: Optional[str] = "cm",
    package_count: Optional[int] = 1,
    volume_m3: Optional[float] = None,
    allow_missing: bool = False,
):
    """
    Validates physical dimensions, converts units, and strictly calculates volume_m3.
    Supported units: 'cm', 'm', 'ft'.
    Returns: (length, width, height, dimension_unit, package_count, volume_m3)
    """
    import math

    # Clean & validate unit
    unit = (dimension_unit or "cm").strip().lower()
    if unit not in ("cm", "m", "ft"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dimension_unit '{dimension_unit}'. Must be 'cm', 'm', or 'ft'."
        )

    # Clean & validate package count
    try:
        pkgs = int(package_count) if package_count is not None else 1
        if pkgs < 1:
            raise HTTPException(status_code=400, detail="Package count must be at least 1.")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Package count must be a positive integer.")

    has_dims = (length is not None or width is not None or height is not None)

    if has_dims:
        if length is None or width is None or height is None:
            raise HTTPException(
                status_code=400,
                detail="All three dimensions (length, width, height) must be provided together."
            )
        try:
            l = float(length)
            w = float(width)
            h = float(height)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Dimensions must be valid numbers.")

        if math.isnan(l) or math.isnan(w) or math.isnan(h) or math.isinf(l) or math.isinf(w) or math.isinf(h):
            raise HTTPException(status_code=400, detail="Dimensions cannot be NaN or infinite.")

        if l <= 0 or w <= 0 or h <= 0:
            raise HTTPException(status_code=400, detail="Length, width, and height must be strictly positive numbers (> 0).")

        # Convert to metres
        if unit == "cm":
            l_m = l / 100.0
            w_m = w / 100.0
            h_m = h / 100.0
            if l > 1800.0 or w > 350.0 or h > 400.0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Dimensions ({l}x{w}x{h} cm) exceed maximum allowable cargo clearances (1800x350x400 cm)."
                )
        elif unit == "m":
            l_m = l
            w_m = w
            h_m = h
            if l > 18.0 or w > 3.5 or h > 4.0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Dimensions ({l}x{w}x{h} m) exceed maximum allowable cargo clearances (18.0x3.5x4.0 m)."
                )
        elif unit == "ft":
            l_m = l * 0.3048
            w_m = w * 0.3048
            h_m = h * 0.3048
            if l > 60.0 or w > 12.0 or h > 14.0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Dimensions ({l}x{w}x{h} ft) exceed maximum allowable cargo clearances (60.0x12.0x14.0 ft)."
                )

        computed_vol = round((l_m * w_m * h_m) * pkgs, 3)
        if computed_vol > 120.0:
            raise HTTPException(
                status_code=400,
                detail=f"Total calculated consignment volume ({computed_vol} m³) exceeds maximum vehicle cargo capacity (120 m³)."
            )

        return (l, w, h, unit, pkgs, computed_vol)

    # If no dimensions provided, fallback to volume_m3 (backwards compatibility for legacy records)
    if volume_m3 is not None:
        try:
            vol = float(volume_m3)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="volume_m3 must be a valid number.")

        if vol <= 0:
            raise HTTPException(status_code=400, detail="Volume must be strictly positive (> 0).")
        if vol > 120.0:
            raise HTTPException(
                status_code=400,
                detail=f"Consignment volume ({vol} m³) exceeds maximum vehicle cargo capacity (120 m³)."
            )
        return (None, None, None, unit, pkgs, round(vol, 3))

    if allow_missing:
        return (None, None, None, unit, pkgs, None)

    # In create_order, volume or dimensions are required
    raise HTTPException(
        status_code=400,
        detail="Consignment dimensions (length, width, height) are required."
    )


def _order_dict(order, recalculate_urgency=False) -> dict:
    urgency = calculate_urgency(order) if recalculate_urgency else (order.urgency or "normal")
    deadline_str = order.delivery_deadline or order.deadline
    now = datetime.now(timezone.utc)

    remaining_hours = None
    is_late = False
    if deadline_str:
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d-%m-%y"):
            try:
                parsed = datetime.strptime(str(deadline_str).strip(), fmt)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                remaining_hours = round((parsed - now).total_seconds() / 3600, 2)
                is_late = remaining_hours < 0
                break
            except ValueError:
                continue

    return {
        "id": order.id,
        "pickup_location": order.pickup_location,
        "delivery_location": order.delivery_location,
        "weight": order.weight,
        "distance_km": order.distance_km,
        "pickup_latitude": order.pickup_latitude,
        "pickup_longitude": order.pickup_longitude,
        "pickup_place_id": order.pickup_place_id,
        "delivery_latitude": order.delivery_latitude,
        "delivery_longitude": order.delivery_longitude,
        "delivery_place_id": order.delivery_place_id,
        "deadline": order.deadline,
        "delivery_deadline": order.delivery_deadline,
        "pickup_time": order.pickup_time,
        "earliest_pickup_time": order.earliest_pickup_time,
        "estimated_travel_hours": order.estimated_travel_hours,
        "handling_time_hours": order.handling_time_hours,
        "status": order.status,
        "cargo_category": order.cargo_category,
        "urgency": urgency,
        "priority": order.priority,
        "is_fragile": order.is_fragile,
        "is_hazardous": order.is_hazardous,
        "is_perishable": order.is_perishable,
        "requires_temperature_control": order.requires_temperature_control,
        "temperature_min_c": order.temperature_min_c,
        "temperature_max_c": order.temperature_max_c,
        "handling_instructions": order.handling_instructions,
        "volume_m3": order.volume_m3,
        "length": getattr(order, "length", None),
        "width": getattr(order, "width", None),
        "height": getattr(order, "height", None),
        "dimension_unit": getattr(order, "dimension_unit", "cm") or "cm",
        "package_count": getattr(order, "package_count", 1) or 1,
        "company_id": order.company_id,
        "user_id": getattr(order, "user_id", None),
        # Computed urgency info
        "remaining_delivery_hours": remaining_hours,
        "is_late": is_late,
    }


@router.get("/categories")
def get_cargo_categories():
    """Return the list of supported cargo categories."""
    return {"categories": CARGO_CATEGORIES}


@router.post("/calculate-distance")
def calculate_order_distance(
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    origin_place_id: Optional[str] = None,
    delivery_latitude: Optional[float] = None,
    delivery_longitude: Optional[float] = None,
    delivery_place_id: Optional[str] = None,
):
    """
    Compute driving road distance (km) and estimated travel duration (minutes)
    via server-side Google Routes API (v2) with OSRM fallback.
    Never returns hardcoded 0 or 100 km.
    """
    from app.optimization.distance_service import compute_route_distance
    return compute_route_distance(
        origin_lat=origin_latitude,
        origin_lon=origin_longitude,
        origin_place_id=origin_place_id,
        dest_lat=delivery_latitude,
        dest_lon=delivery_longitude,
        dest_place_id=delivery_place_id,
    )


@router.post("/")
def create_order(
    pickup_location: str,
    delivery_location: str,
    weight: int,
    deadline: str,
    distance_km: float = 0.0,
    pickup_latitude: str = None,
    pickup_longitude: str = None,
    pickup_place_id: str = None,
    delivery_latitude: str = None,
    delivery_longitude: str = None,
    delivery_place_id: str = None,
    cargo_category: str = "General Cargo",
    pickup_time: str = None,
    delivery_deadline: str = None,
    earliest_pickup_time: str = None,
    estimated_travel_hours: float = None,
    handling_time_hours: float = 0.5,
    priority: int = 0,
    is_fragile: bool = False,
    is_hazardous: bool = False,
    is_perishable: bool = False,
    requires_temperature_control: bool = False,
    temperature_min_c: float = None,
    temperature_max_c: float = None,
    handling_instructions: str = None,
    volume_m3: float = None,
    length: float = None,
    width: float = None,
    height: float = None,
    dimension_unit: str = "cm",
    package_count: int = 1,
    company_id: int = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    curr_company_id = current_user.company_id if current_user else 1
    curr_user_id = current_user.id if current_user else None
    target_company_id = company_id if (company_id and company_id != 1) else curr_company_id

    # Compute and validate dimensions & volume
    val_l, val_w, val_h, val_unit, val_pkgs, calculated_volume = compute_and_validate_volume(
        length=length,
        width=width,
        height=height,
        dimension_unit=dimension_unit,
        package_count=package_count,
        volume_m3=volume_m3,
        allow_missing=False,
    )

    # Validate that pickup and delivery coordinates are strictly within India
    from app.optimization.india_boundary import is_point_inside_india

    if pickup_latitude and pickup_longitude:
        try:
            p_lat, p_lon = float(pickup_latitude), float(pickup_longitude)
            if not is_point_inside_india(p_lon, p_lat):
                raise HTTPException(
                    status_code=400,
                    detail=f"Pickup location ({pickup_location or 'Origin'}) coordinates ({p_lat:.4f}, {p_lon:.4f}) lie outside Indian territory. CargoMind operates exclusively inside India."
                )
        except ValueError:
            pass

    if delivery_latitude and delivery_longitude:
        try:
            d_lat, d_lon = float(delivery_latitude), float(delivery_longitude)
            if not is_point_inside_india(d_lon, d_lat):
                raise HTTPException(
                    status_code=400,
                    detail=f"Delivery destination ({delivery_location or 'Destination'}) coordinates ({d_lat:.4f}, {d_lon:.4f}) lie outside Indian territory. CargoMind operates exclusively inside India."
                )
        except ValueError:
            pass

    # If distance was not provided or 0, attempt server-side calculation
    resolved_dist = float(distance_km or 0)
    resolved_travel_hours = estimated_travel_hours

    if resolved_dist <= 0:
        try:
            from app.optimization.distance_service import compute_route_distance
            p_lat = float(pickup_latitude) if pickup_latitude else None
            p_lon = float(pickup_longitude) if pickup_longitude else None
            d_lat = float(delivery_latitude) if delivery_latitude else None
            d_lon = float(delivery_longitude) if delivery_longitude else None

            if (p_lat is not None and d_lat is not None) or (pickup_place_id and delivery_place_id):
                calc_res = compute_route_distance(
                    origin_lat=p_lat,
                    origin_lon=p_lon,
                    origin_place_id=pickup_place_id,
                    dest_lat=d_lat,
                    dest_lon=d_lon,
                    dest_place_id=delivery_place_id,
                )
                if calc_res and calc_res.get("distance_km", 0) > 0:
                    resolved_dist = float(calc_res["distance_km"])
                    resolved_travel_hours = float(calc_res.get("estimated_travel_hours", round(resolved_dist / 50.0, 2)))
        except Exception:
            pass

    if cargo_category not in CARGO_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid cargo_category. Must be one of: {CARGO_CATEGORIES}"
        )

    if weight <= 0:
        raise HTTPException(status_code=400, detail="Weight must be positive")

    order = Order(
        pickup_location=pickup_location,
        delivery_location=delivery_location,
        weight=weight,
        deadline=deadline,
        distance_km=round(float(resolved_dist), 2),
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        pickup_place_id=pickup_place_id,
        delivery_latitude=delivery_latitude,
        delivery_longitude=delivery_longitude,
        delivery_place_id=delivery_place_id,
        cargo_category=cargo_category,
        pickup_time=pickup_time,
        delivery_deadline=delivery_deadline or deadline,
        earliest_pickup_time=earliest_pickup_time,
        estimated_travel_hours=resolved_travel_hours,
        handling_time_hours=handling_time_hours,
        priority=priority,
        is_fragile=is_fragile,
        is_hazardous=is_hazardous,
        is_perishable=is_perishable,
        requires_temperature_control=requires_temperature_control,
        temperature_min_c=temperature_min_c,
        temperature_max_c=temperature_max_c,
        handling_instructions=handling_instructions,
        volume_m3=calculated_volume,
        length=val_l,
        width=val_w,
        height=val_h,
        dimension_unit=val_unit,
        package_count=val_pkgs,
        company_id=target_company_id,
        user_id=curr_user_id,
        status="pending"
    )
    # Calculate initial urgency
    order.urgency = calculate_urgency(order)

    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "message": "Order created successfully",
        "order": _order_dict(order)
    }


class BulkOrderItem(BaseModel):
    pickup_location: str
    delivery_location: str
    weight: int
    deadline: Optional[str] = None
    delivery_deadline: Optional[str] = None
    cargo_category: Optional[str] = "General Cargo"
    length: Optional[float] = 100.0
    width: Optional[float] = 100.0
    height: Optional[float] = 100.0
    dimension_unit: Optional[str] = "cm"
    package_count: Optional[int] = 1
    volume_m3: Optional[float] = None
    priority: Optional[int] = 0
    is_fragile: Optional[bool] = False
    is_hazardous: Optional[bool] = False
    is_perishable: Optional[bool] = False
    requires_temperature_control: Optional[bool] = False
    temperature_min_c: Optional[float] = None
    temperature_max_c: Optional[float] = None
    handling_instructions: Optional[str] = None
    pickup_latitude: Optional[str] = None
    pickup_longitude: Optional[str] = None
    delivery_latitude: Optional[str] = None
    delivery_longitude: Optional[str] = None
    distance_km: Optional[float] = 0.0


class BulkOrderRequest(BaseModel):
    orders: List[BulkOrderItem]


def _haversine_road_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return max(15.0, round(r * c * 1.25, 2))


@router.post("/bulk")
def bulk_create_orders(
    payload: BulkOrderRequest,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Bulk import multiple consignments/orders at once from CSV or JSON list.
    Auto-resolves Indian city coordinates, computes road distances, calculates volumes, and infers urgency.
    """
    if not payload.orders:
        raise HTTPException(status_code=400, detail="No orders provided in payload")

    from app.optimization.india_gazetteer import search_local_gazetteer

    created = []
    curr_company_id = current_user.company_id if current_user else 1
    curr_user_id = current_user.id if current_user else None
    now_utc = datetime.now(timezone.utc)

    for item in payload.orders:
        p_loc = (item.pickup_location or "").strip()
        d_loc = (item.delivery_location or "").strip()
        if not p_loc or not d_loc:
            continue

        p_lat = item.pickup_latitude
        p_lon = item.pickup_longitude
        d_lat = item.delivery_latitude
        d_lon = item.delivery_longitude

        # Resolve coordinates from Indian gazetteer if missing
        if not p_lat or not p_lon:
            p_matches = search_local_gazetteer(p_loc, limit=1)
            if p_matches:
                p_place = p_matches[0].get("place", p_matches[0])
                p_lat = str(p_place.get("latitude") or p_place.get("lat") or "")
                p_lon = str(p_place.get("longitude") or p_place.get("lon") or "")

        if not d_lat or not d_lon:
            d_matches = search_local_gazetteer(d_loc, limit=1)
            if d_matches:
                d_place = d_matches[0].get("place", d_matches[0])
                d_lat = str(d_place.get("latitude") or d_place.get("lat") or "")
                d_lon = str(d_place.get("longitude") or d_place.get("lon") or "")

        # Compute road distance
        dist = round(float(item.distance_km or 0), 2)
        if dist <= 0 and p_lat and p_lon and d_lat and d_lon:
            try:
                dist = _haversine_road_distance(float(p_lat), float(p_lon), float(d_lat), float(d_lon))
            except Exception:
                dist = 250.0
        elif dist <= 0:
            dist = 250.0

        # Calculate volume
        vol = item.volume_m3
        if not vol and item.length and item.width and item.height:
            unit = (item.dimension_unit or "cm").lower()
            pkgs = item.package_count or 1
            if unit == "cm":
                vol = round(((item.length * item.width * item.height) / 1000000.0) * pkgs, 3)
            elif unit == "m":
                vol = round((item.length * item.width * item.height) * pkgs, 3)
            elif unit == "ft":
                vol = round(((item.length * 0.3048) * (item.width * 0.3048) * (item.height * 0.3048)) * pkgs, 3)
        if not vol:
            vol = round(max(0.5, (item.weight or 1000) / 350.0), 2)

        deadline_str = item.delivery_deadline or item.deadline
        if not deadline_str:
            deadline_str = (now_utc + timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

        order = Order(
            pickup_location=p_loc,
            delivery_location=d_loc,
            weight=int(item.weight) if item.weight else 1000,
            deadline=deadline_str,
            delivery_deadline=deadline_str,
            distance_km=dist,
            pickup_latitude=p_lat,
            pickup_longitude=p_lon,
            delivery_latitude=d_lat,
            delivery_longitude=d_lon,
            cargo_category=item.cargo_category or "General Cargo",
            priority=item.priority or 0,
            is_fragile=bool(item.is_fragile),
            is_hazardous=bool(item.is_hazardous),
            is_perishable=bool(item.is_perishable),
            requires_temperature_control=bool(item.requires_temperature_control),
            temperature_min_c=item.temperature_min_c,
            temperature_max_c=item.temperature_max_c,
            handling_instructions=item.handling_instructions,
            volume_m3=vol,
            length=item.length,
            width=item.width,
            height=item.height,
            dimension_unit=item.dimension_unit or "cm",
            package_count=item.package_count or 1,
            company_id=curr_company_id,
            user_id=curr_user_id,
            status="pending"
        )
        order.urgency = calculate_urgency(order)
        db.add(order)
        created.append(order)

    db.commit()
    for o in created:
        db.refresh(o)

    return {
        "message": f"Successfully imported {len(created)} consignments",
        "count": len(created),
        "orders": [_order_dict(o) for o in created]
    }


@router.get("/")
def get_orders(
    status: Optional[str] = None,
    cargo_category: Optional[str] = None,
    urgency: Optional[str] = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Order).filter(
        (Order.user_id == current_user.id) | (Order.company_id == current_user.company_id)
    )
    if status:
        query = query.filter(Order.status == status)
    if cargo_category:
        query = query.filter(Order.cargo_category == cargo_category)

    orders = query.all()

    result = []
    for order in orders:
        d = _order_dict(order, recalculate_urgency=True)
        # Update urgency in DB if it has changed
        if d["urgency"] != order.urgency:
            order.urgency = d["urgency"]
        result.append(d)

    try:
        db.commit()
    except Exception:
        db.rollback()

    if urgency:
        result = [o for o in result if o["urgency"] == urgency]

    return result


@router.get("/{order_id}/tracking")
def get_order_tracking(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    trip = (
        db.query(Trip)
        .filter(Trip.order_id == order_id)
        .order_by(Trip.id.desc())
        .first()
    )

    return {
        "order_id": order.id,
        "order_status": order.status,
        "trip_id": trip.id if trip else None,
        "trip_status": trip.status if trip else None,
        "truck_id": trip.truck_id if trip else None,
        "driver_id": trip.driver_id if trip else None
    }


@router.get("/{order_id}")
def get_order(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return _order_dict(order, recalculate_urgency=True)


@router.put("/{order_id}")
def update_order(
    order_id: int,
    pickup_location: str = None,
    delivery_location: str = None,
    weight: int = None,
    deadline: str = None,
    distance_km: float = None,
    pickup_latitude: str = None,
    pickup_longitude: str = None,
    pickup_place_id: str = None,
    delivery_latitude: str = None,
    delivery_longitude: str = None,
    delivery_place_id: str = None,
    cargo_category: str = None,
    pickup_time: str = None,
    delivery_deadline: str = None,
    earliest_pickup_time: str = None,
    estimated_travel_hours: float = None,
    handling_time_hours: float = None,
    priority: int = None,
    is_fragile: bool = None,
    is_hazardous: bool = None,
    is_perishable: bool = None,
    requires_temperature_control: bool = None,
    temperature_min_c: float = None,
    temperature_max_c: float = None,
    handling_instructions: str = None,
    volume_m3: float = None,
    length: float = None,
    width: float = None,
    height: float = None,
    dimension_unit: str = None,
    package_count: int = None,
    status: str = None,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Order).filter(Order.id == order_id)
    if current_user and current_user.company_id:
        query = query.filter(Order.company_id == current_user.company_id)
    order = query.first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # If any dimension or volume field is updated, recalculate
    if any(param is not None for param in [length, width, height, dimension_unit, package_count, volume_m3]):
        target_l = length if length is not None else order.length
        target_w = width if width is not None else order.width
        target_h = height if height is not None else order.height
        target_unit = dimension_unit if dimension_unit is not None else (order.dimension_unit or "cm")
        target_pkgs = package_count if package_count is not None else (order.package_count or 1)
        target_vol = volume_m3 if volume_m3 is not None else order.volume_m3

        val_l, val_w, val_h, val_unit, val_pkgs, calculated_volume = compute_and_validate_volume(
            length=target_l,
            width=target_w,
            height=target_h,
            dimension_unit=target_unit,
            package_count=target_pkgs,
            volume_m3=target_vol,
            allow_missing=True,
        )
        if calculated_volume is not None:
            order.volume_m3 = calculated_volume
            order.length = val_l
            order.width = val_w
            order.height = val_h
            order.dimension_unit = val_unit
            order.package_count = val_pkgs

    # Validate that updated coordinates remain inside India
    from app.optimization.india_boundary import is_point_inside_india

    check_p_lat = float(pickup_latitude) if pickup_latitude is not None else (float(order.pickup_latitude) if order.pickup_latitude else None)
    check_p_lon = float(pickup_longitude) if pickup_longitude is not None else (float(order.pickup_longitude) if order.pickup_longitude else None)
    if check_p_lat is not None and check_p_lon is not None:
        if not is_point_inside_india(check_p_lon, check_p_lat):
            raise HTTPException(
                status_code=400,
                detail=f"Pickup coordinates ({check_p_lat:.4f}, {check_p_lon:.4f}) lie outside Indian territory."
            )

    check_d_lat = float(delivery_latitude) if delivery_latitude is not None else (float(order.delivery_latitude) if order.delivery_latitude else None)
    check_d_lon = float(delivery_longitude) if delivery_longitude is not None else (float(order.delivery_longitude) if order.delivery_longitude else None)
    if check_d_lat is not None and check_d_lon is not None:
        if not is_point_inside_india(check_d_lon, check_d_lat):
            raise HTTPException(
                status_code=400,
                detail=f"Delivery destination coordinates ({check_d_lat:.4f}, {check_d_lon:.4f}) lie outside Indian territory."
            )

    if pickup_location is not None: order.pickup_location = pickup_location
    if delivery_location is not None: order.delivery_location = delivery_location
    if weight is not None:
        if weight <= 0:
            raise HTTPException(status_code=400, detail="Weight must be positive")
        order.weight = weight
    if deadline is not None: order.deadline = deadline
    if distance_km is not None and distance_km > 0:
        order.distance_km = round(float(distance_km), 2)
    if pickup_latitude is not None: order.pickup_latitude = pickup_latitude
    if pickup_longitude is not None: order.pickup_longitude = pickup_longitude
    if pickup_place_id is not None: order.pickup_place_id = pickup_place_id
    if delivery_latitude is not None: order.delivery_latitude = delivery_latitude
    if delivery_longitude is not None: order.delivery_longitude = delivery_longitude
    if delivery_place_id is not None: order.delivery_place_id = delivery_place_id

    # Auto-resolve distance if 0
    if not order.distance_km or order.distance_km <= 0:
        try:
            from app.optimization.distance_service import compute_route_distance
            p_lat = float(order.pickup_latitude) if order.pickup_latitude else None
            p_lon = float(order.pickup_longitude) if order.pickup_longitude else None
            d_lat = float(order.delivery_latitude) if order.delivery_latitude else None
            d_lon = float(order.delivery_longitude) if order.delivery_longitude else None
            if (p_lat and d_lat) or (order.pickup_place_id and order.delivery_place_id):
                calc_res = compute_route_distance(
                    origin_lat=p_lat, origin_lon=p_lon, origin_place_id=order.pickup_place_id,
                    dest_lat=d_lat, dest_lon=d_lon, dest_place_id=order.delivery_place_id
                )
                if calc_res and calc_res.get("distance_km", 0) > 0:
                    order.distance_km = round(float(calc_res["distance_km"]), 2)
                    order.estimated_travel_hours = float(calc_res.get("estimated_travel_hours", round(order.distance_km / 50.0, 2)))
        except Exception:
            pass
    if cargo_category is not None:
        if cargo_category not in CARGO_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid cargo_category. Must be one of: {CARGO_CATEGORIES}")
        order.cargo_category = cargo_category
    if pickup_time is not None: order.pickup_time = pickup_time
    if delivery_deadline is not None: order.delivery_deadline = delivery_deadline
    if earliest_pickup_time is not None: order.earliest_pickup_time = earliest_pickup_time
    if estimated_travel_hours is not None: order.estimated_travel_hours = estimated_travel_hours
    if handling_time_hours is not None: order.handling_time_hours = handling_time_hours
    if priority is not None: order.priority = priority
    if is_fragile is not None: order.is_fragile = is_fragile
    if is_hazardous is not None: order.is_hazardous = is_hazardous
    if is_perishable is not None: order.is_perishable = is_perishable
    if requires_temperature_control is not None: order.requires_temperature_control = requires_temperature_control
    if temperature_min_c is not None: order.temperature_min_c = temperature_min_c
    if temperature_max_c is not None: order.temperature_max_c = temperature_max_c
    if handling_instructions is not None: order.handling_instructions = handling_instructions
    if status is not None:
        allowed = ["pending", "assigned", "in_progress", "completed", "cancelled"]
        if status not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {allowed}")
        order.status = status

    # Recalculate urgency
    order.urgency = calculate_urgency(order)

    try:
        db.commit()
        db.refresh(order)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "message": "Order updated successfully",
        "order": _order_dict(order, recalculate_urgency=True)
    }


@router.delete("/{order_id}")
def delete_order(
    order_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == current_user.company_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    active_trip = db.query(Trip).filter(
        Trip.order_id == order_id,
        Trip.status.in_(["planned", "in_progress"])
    ).first()

    if active_trip:
        raise HTTPException(
            status_code=409,
            detail=f"Order is assigned to active trip #{active_trip.id}. Complete or cancel the trip first."
        )

    try:
        db.delete(order)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

    return {"message": f"Order #{order_id} deleted successfully"}


@router.get("/{order_id}/trips")
def get_order_trips(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    trips = (
        db.query(Trip)
        .filter(Trip.order_id == order_id)
        .all()
    )

    return trips