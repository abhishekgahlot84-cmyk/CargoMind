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
        status = getattr(truck, "status", "")
        t_id = getattr(truck, "id", None)
        if status == "maintenance":
            continue
        if t_id in in_progress_trucks:
            if status != "in_trip":
                truck.status = "in_trip"
                trucks_fixed += 1
        elif t_id in planned_trucks:
            if status != "assigned":
                truck.status = "assigned"
                trucks_fixed += 1
        else:
            if status in ("assigned", "in_trip"):
                truck.status = "available"
                trucks_fixed += 1

    for driver in drivers:
        status = getattr(driver, "status", "")
        d_id = getattr(driver, "id", None)
        if d_id in in_progress_drivers:
            if status != "busy":
                driver.status = "busy"
                drivers_fixed += 1
        elif d_id in planned_drivers:
            if status != "assigned":
                driver.status = "assigned"
                drivers_fixed += 1
        else:
            if status in ("assigned", "busy"):
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
        company_trucks = [t for t in all_trucks_in_db if getattr(t, "company_id", None) == company_id]
    else:
        company_trucks = all_trucks_in_db
    diag["company_id_filter"] = company_id
    diag["company_matching_count"] = len(company_trucks)

    # 3. Valid Capacity Filter (> 0 kg)
    valid_cap_trucks = []
    for t in company_trucks:
        try:
            cap = float(getattr(t, "capacity", 0) or 0)
            if cap > 0:
                valid_cap_trucks.append(t)
        except (ValueError, TypeError):
            pass
    diag["valid_capacity_count"] = len(valid_cap_trucks)

    # 4. Maintenance Filter
    non_maintenance_trucks = [t for t in valid_cap_trucks if str(getattr(t, "status", "")).lower() != "maintenance"]
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
        if getattr(t, "id", None) not in active_trip_truck_ids
    ]
    diag["available_trucks_count"] = len(available_trucks)
    diag["available_truck_ids"] = [t.id for t in available_trucks]

    return available_trucks


def get_available_drivers(
    db: Session,
    company_id: Optional[int] = None,
    diagnostic: Optional[Dict[str, Any]] = None,
) -> List[Driver]:
    """
    ONE shared function returning truly available drivers for dispatch / optimization.
    A driver is available iff:
    1. Belongs to the company
    2. Not assigned to an active trip (planned or in_progress)
    """
    diag = diagnostic if diagnostic is not None else {}

    all_drivers = db.query(Driver).all()
    diag["total_drivers_in_db"] = len(all_drivers)

    if company_id is not None:
        company_drivers = [d for d in all_drivers if getattr(d, "company_id", None) == company_id]
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

    available_drivers = [
        d for d in company_drivers
        if getattr(d, "id", None) not in active_driver_ids
    ]
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
        urgency = getattr(o, "urgency", None) or "normal"
        priority = -(getattr(o, "priority", None) or 0)
        return (urgency_rank.get(urgency, 2), priority)

    return sorted(eligible_orders, key=order_sort_key)
