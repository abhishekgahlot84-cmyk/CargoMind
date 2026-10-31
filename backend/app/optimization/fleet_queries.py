"""
Shared, single-source-of-truth queries for fleet resource availability.
Ensures that the optimization dropdowns, SCIP load allocation, and VRP routing
engines always evaluate the exact same trucks, drivers, and consignments.
"""

from typing import List, Optional, Dict, Any, Set
from sqlalchemy.orm import Session
from app.database.models import Truck, Driver, Order, Trip


def sync_fleet_resource_statuses(db: Session, company_id: Optional[int] = None) -> Dict[str, int]:
    """
    Synchronize Truck and Driver status columns with their actual active trips in the database.
    - If a truck/driver has a planned trip -> 'assigned'
    - If a truck/driver has an in_progress trip -> 'in_trip' (truck) / 'busy' (driver)
    - If a truck/driver has no active trips and was marked 'assigned' or 'in_trip' -> 'available'
    - Maintenance trucks remain 'maintenance'
    """
    # Active trips
    active_trips = db.query(Trip).filter(
        Trip.status.in_(["planned", "in_progress"])
    ).all()

    in_progress_trucks = {t.truck_id for t in active_trips if t.status == "in_progress" and t.truck_id}
    planned_trucks = {t.truck_id for t in active_trips if t.status == "planned" and t.truck_id}

    in_progress_drivers = {t.driver_id for t in active_trips if t.status == "in_progress" and t.driver_id}
    planned_drivers = {t.driver_id for t in active_trips if t.status == "planned" and t.driver_id}

    truck_query = db.query(Truck)
    driver_query = db.query(Driver)

    if company_id is not None:
        truck_query = truck_query.filter(Truck.company_id == company_id)
        driver_query = driver_query.filter(Driver.company_id == company_id)

    trucks = truck_query.all()
    drivers = driver_query.all()

    trucks_fixed = 0
    drivers_fixed = 0

    for truck in trucks:
        if truck.status == "maintenance":
            continue
        if truck.id in in_progress_trucks:
            if truck.status != "in_trip":
                truck.status = "in_trip"
                trucks_fixed += 1
        elif truck.id in planned_trucks:
            if truck.status != "assigned":
                truck.status = "assigned"
                trucks_fixed += 1
        else:
            if truck.status in ("assigned", "in_trip"):
                truck.status = "available"
                trucks_fixed += 1

    for driver in drivers:
        if driver.id in in_progress_drivers:
            if driver.status != "busy":
                driver.status = "busy"
                drivers_fixed += 1
        elif driver.id in planned_drivers:
            if driver.status != "assigned":
                driver.status = "assigned"
                drivers_fixed += 1
        else:
            if driver.status in ("assigned", "busy"):
                driver.status = "available"
                drivers_fixed += 1

    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "trucks_fixed": trucks_fixed,
        "drivers_fixed": drivers_fixed,
    }


def get_available_trucks(
    db: Session,
    company_id: Optional[int] = None,
    diagnostic: Optional[Dict[str, Any]] = None,
) -> List[Truck]:
    """
    ONE shared function returning truly available trucks for dispatch / optimization.
    A truck is available iff:
    1. It belongs to the requested company (or user scope)
    2. Its capacity is strictly positive (> 0)
    3. It is NOT in maintenance
    4. It is NOT assigned to an active trip (planned or in_progress)

    Logs diagnostic counters at each filter stage.
    """
    diag = diagnostic if diagnostic is not None else {}

    # Sync first so statuses reflect reality
    sync_fleet_resource_statuses(db, company_id=company_id)

    # 1. Raw count in DB
    all_trucks_in_db = db.query(Truck).all()
    diag["total_trucks_in_db"] = len(all_trucks_in_db)

    # 2. Company Filter
    if company_id is not None:
        company_trucks = [t for t in all_trucks_in_db if t.company_id == company_id]
    else:
        company_trucks = all_trucks_in_db
    diag["company_id_filter"] = company_id
    diag["company_matching_count"] = len(company_trucks)

    # 3. Valid Capacity Filter (> 0 kg)
    valid_cap_trucks = []
    for t in company_trucks:
        try:
            cap = float(t.capacity or 0)
            if cap > 0:
                valid_cap_trucks.append(t)
        except (ValueError, TypeError):
            pass
    diag["valid_capacity_count"] = len(valid_cap_trucks)

    # 4. Maintenance Filter
    non_maintenance_trucks = [t for t in valid_cap_trucks if str(t.status).lower() != "maintenance"]
    diag["maintenance_excluded_count"] = len(valid_cap_trucks) - len(non_maintenance_trucks)

    # 5. Active Trips Exclusion (planned / in_progress)
    active_trip_truck_ids: Set[int] = {
        row[0]
        for row in db.query(Trip.truck_id).filter(
            Trip.status.in_(["planned", "in_progress"])
        ).all()
        if row[0] is not None
    }
    diag["active_trip_truck_ids"] = list(active_trip_truck_ids)

    available_trucks = [
        t for t in non_maintenance_trucks
        if t.id not in active_trip_truck_ids
    ]
    diag["available_trucks_count"] = len(available_trucks)
    diag["available_truck_ids"] = [t.id for t in available_trucks]

    return available_trucks


def get_available_drivers(
    db: Session,
    company_id: Optional[int] = None,
    diagnostic: Optional[Dict[str, Any]] = None,
    enforce_wellness: bool = True,
) -> List[Driver]:
    """
    ONE shared function returning truly available drivers for dispatch / optimization.
    A driver is available iff:
    1. Belongs to the company
    2. Not assigned to an active trip (planned or in_progress)
    3. Wellness score >= 60 and rest hours >= 8h (if enforce_wellness is True)
    Ranked descending by Driver Wellness Score (0-100).
    """
    from app.optimization.wellness import compute_driver_wellness

    diag = diagnostic if diagnostic is not None else {}

    all_drivers = db.query(Driver).all()
    diag["total_drivers_in_db"] = len(all_drivers)

    if company_id is not None:
        company_drivers = [d for d in all_drivers if d.company_id == company_id]
    else:
        company_drivers = all_drivers
    diag["company_drivers_count"] = len(company_drivers)

    active_driver_ids: Set[int] = {
        row[0]
        for row in db.query(Trip.driver_id).filter(
            Trip.status.in_(["planned", "in_progress"])
        ).all()
        if row[0] is not None
    }
    diag["active_trip_driver_ids"] = list(active_driver_ids)

    unassigned_drivers = [
        d for d in company_drivers
        if d.id not in active_driver_ids
    ]
    diag["unassigned_drivers_count"] = len(unassigned_drivers)

    # Compute wellness for each candidate
    evaluated_drivers = []
    blocked_count = 0

    for d in unassigned_drivers:
        wellness = compute_driver_wellness(d, db=db)
        # Update cached score on driver model if changed
        if d.wellness_score != wellness["score"]:
            d.wellness_score = wellness["score"]
        
        if enforce_wellness and not wellness["is_assignable"]:
            blocked_count += 1
            continue

        evaluated_drivers.append((d, wellness["score"]))

    diag["drivers_blocked_low_wellness"] = blocked_count

    # Rank highest wellness score first
    evaluated_drivers.sort(key=lambda item: item[1], reverse=True)
    available_drivers = [item[0] for item in evaluated_drivers]

    diag["available_drivers_count"] = len(available_drivers)
    diag["available_driver_ids"] = [d.id for d in available_drivers]

    return available_drivers


def get_pending_consignments(
    db: Session,
    company_id: Optional[int] = None,
    diagnostic: Optional[Dict[str, Any]] = None,
) -> List[Order]:
    """
    ONE shared function returning pending consignments ready for routing / load allocation.
    Consignment is eligible iff:
    1. Belongs to the company
    2. status == 'pending'
    3. Not already assigned to an active trip (planned or in_progress)
    """
    diag = diagnostic if diagnostic is not None else {}

    all_orders = db.query(Order).all()
    diag["total_orders_in_db"] = len(all_orders)

    query = db.query(Order).filter(Order.status == "pending")
    if company_id is not None:
        query = query.filter(Order.company_id == company_id)
    pending_orders = query.all()
    diag["pending_orders_count"] = len(pending_orders)

    active_order_ids: Set[int] = {
        row[0]
        for row in db.query(Trip.order_id).filter(
            Trip.status.in_(["planned", "in_progress"])
        ).all()
        if row[0] is not None
    }
    diag["active_trip_order_ids"] = list(active_order_ids)

    eligible_orders = [
        o for o in pending_orders
        if o.id not in active_order_ids
    ]
    diag["eligible_orders_count"] = len(eligible_orders)

    # Sort by urgency (critical > urgent > normal > scheduled)
    urgency_rank = {"critical": 0, "urgent": 1, "normal": 2, "scheduled": 3}

    def order_sort_key(o):
        urgency = o.urgency or "normal"
        priority = -(o.priority or 0)
        return (urgency_rank.get(urgency, 2), priority)

    return sorted(eligible_orders, key=order_sort_key)
