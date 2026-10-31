"""
Safe, idempotent reset and demo data generator for CargoMind.
Generates realistic Indian logistics data with verified coordinates,
fleet vehicles, commercial drivers, and routable consignments.
"""

import os
import random
import shutil
import sqlite3
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.database.models import (
    Hub,
    Truck,
    Driver,
    Order,
    Trip,
    GPSTracking,
    DriverHandover,
    TripDriverAssignment,
    Company,
    User,
    WellnessHistory,
    MaintenanceLog,
)
from app.optimization.distance_service import compute_route_distance
from app.optimization.road_route import get_road_route
from app.optimization.wellness import compute_driver_wellness


INDIAN_HUBS = [
    {"name": "Gwalior Central Logistics Depot", "city": "Gwalior", "state": "Madhya Pradesh", "lat": 26.2183, "lon": 78.1828, "type": "central_depot", "cap": 150000},
    {"name": "Delhi Northern Freight Terminal", "city": "New Delhi", "state": "Delhi", "lat": 28.6139, "lon": 77.2090, "type": "regional_hub", "cap": 250000},
    {"name": "Mumbai Port Container Terminal", "city": "Mumbai", "state": "Maharashtra", "lat": 19.0760, "lon": 72.8777, "type": "port_terminal", "cap": 400000},
    {"name": "Jaipur Express Logistics Hub", "city": "Jaipur", "state": "Rajasthan", "lat": 26.9124, "lon": 75.7873, "type": "regional_hub", "cap": 120000},
    {"name": "Bhopal Distribution Center", "city": "Bhopal", "state": "Madhya Pradesh", "lat": 23.2599, "lon": 77.4126, "type": "distribution_center", "cap": 90000},
    {"name": "Indore Commercial Logistics Park", "city": "Indore", "state": "Madhya Pradesh", "lat": 22.7196, "lon": 75.8577, "type": "regional_hub", "cap": 140000},
    {"name": "Pune Automotive Cargo Terminal", "city": "Pune", "state": "Maharashtra", "lat": 18.5204, "lon": 73.8567, "type": "distribution_center", "cap": 180000},
    {"name": "Agra Highway Transit Hub", "city": "Agra", "state": "Uttar Pradesh", "lat": 27.1767, "lon": 78.0081, "type": "transit_hub", "cap": 85000},
    {"name": "Lucknow Eastern Corridor Depot", "city": "Lucknow", "state": "Uttar Pradesh", "lat": 26.8467, "lon": 80.9462, "type": "regional_hub", "cap": 110000},
    {"name": "Ahmedabad Western Gateway", "city": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lon": 72.5714, "type": "regional_hub", "cap": 220000},
    {"name": "Chandigarh Tricity Logistics Yard", "city": "Chandigarh", "state": "Chandigarh", "lat": 30.7333, "lon": 76.7794, "type": "distribution_center", "cap": 75000},
    {"name": "Nagpur Zero-Mile Transshipment Center", "city": "Nagpur", "state": "Maharashtra", "lat": 21.1458, "lon": 79.0882, "type": "transit_hub", "cap": 160000},
    # Additional corridor handover hubs for Delhi-Mumbai, Visakhapatnam-Delhi, Gwalior-Bhopal
    {"name": "Udaipur Highway Logistics Hub", "city": "Udaipur", "state": "Rajasthan", "lat": 24.5854, "lon": 73.7125, "type": "handover_hub", "cap": 95000},
    {"name": "Vadodara Industrial Corridor Hub", "city": "Vadodara", "state": "Gujarat", "lat": 22.3072, "lon": 73.1812, "type": "handover_hub", "cap": 130000},
    {"name": "Surat Express Gateway Hub", "city": "Surat", "state": "Gujarat", "lat": 21.1702, "lon": 72.8311, "type": "handover_hub", "cap": 145000},
    {"name": "Visakhapatnam Coastal Freight Terminal", "city": "Visakhapatnam", "state": "Andhra Pradesh", "lat": 17.6868, "lon": 83.2185, "type": "regional_hub", "cap": 280000},
    {"name": "Raipur Eastern Transit Hub", "city": "Raipur", "state": "Chhattisgarh", "lat": 21.2514, "lon": 81.6296, "type": "handover_hub", "cap": 115000},
    {"name": "Hyderabad Deccan Logistics Terminal", "city": "Hyderabad", "state": "Telangana", "lat": 17.3850, "lon": 78.4867, "type": "regional_hub", "cap": 220000},
]

TRUCK_SPECS = [
    # plate, model, cap_kg, vol_m3, efficiency_kmpl, fuel_type, status
    ("MP07AB1234", "Tata Prima 5530.S", 25000, 72.0, 3.8, "Diesel", "available"),
    ("DL01XY7788", "BharatBenz 2823R", 18000, 52.0, 4.2, "Diesel", "in_trip"),
    ("MH04CD5678", "Ashok Leyland Ecomet 1615", 14000, 42.0, 5.0, "Diesel", "in_trip"),
    ("RJ14EF9012", "Tata Signa 4825.TK", 24000, 68.0, 3.9, "Diesel", "in_trip"),
    ("UP80GH3456", "Eicher Pro 3019", 12500, 38.0, 5.5, "Diesel", "available"),
    ("GJ01JK7890", "BharatBenz 3528CM", 22000, 60.0, 4.0, "Diesel", "available"),
    ("MP09LM2345", "Tata 407 Gold SFC", 5000, 18.0, 8.5, "Diesel", "available"),
    ("MH12NP6789", "Ashok Leyland Boss 1215", 9000, 28.0, 6.2, "Diesel", "available"),
    ("DL02QR0123", "Eicher Pro 2049 (EV Freight)", 4500, 16.0, 12.0, "Electric", "available"),
    ("HR26ST4567", "Tata Ultra T.16", 11000, 34.0, 5.8, "Diesel", "available"),
    ("UP32UV8901", "Mahindra Furio 17", 13500, 40.0, 5.2, "Diesel", "available"),
    ("RJ02WX2345", "BharatBenz 1917R", 13000, 39.0, 5.1, "Diesel", "available"),
    ("KA01YZ6789", "Tata Signa 3523.TK", 21000, 58.0, 4.1, "Diesel", "available"),
    ("TS09AB0123", "Ashok Leyland Captain 2518", 16500, 48.0, 4.5, "Diesel", "available"),
    ("WB02CD4567", "Eicher Pro 6028", 17500, 50.0, 4.3, "Diesel", "maintenance"),
    ("TN01EF8901", "Tata LPT 1918 Cowl", 12000, 36.0, 5.4, "Diesel", "maintenance"),
]

DRIVER_NAMES = [
    ("Rajesh Kumar", "+91 98765 00001", "Commercial Heavy HGV (National Permit)"),
    ("Vikram Singh", "+91 98765 00002", "Hazardous Chemicals & Tanker Endorsement"),
    ("Amit Sharma", "+91 98765 00003", "Commercial Heavy HGV"),
    ("Suresh Patel", "+91 98765 00004", "Express Multimodal Freight Carrier"),
    ("Manoj Yadav", "+91 98765 00005", "Commercial Heavy HGV"),
    ("Dharmendra Verma", "+91 98765 00006", "Cold Chain & Refrigerated Cargo"),
    ("Gurpreet Singh", "+91 98765 00007", "Commercial Heavy HGV (National Permit)"),
    ("Ramesh Chaurasia", "+91 98765 00008", "Commercial Medium Goods Vehicle"),
    ("Deepak Joshi", "+91 98765 00009", "Electric Commercial Transport"),
    ("Sunil Rathore", "+91 98765 00010", "Commercial Heavy HGV"),
    ("Satish Gurjar", "+91 98765 00011", "Commercial Heavy HGV"),
    ("Harish Meena", "+91 98765 00012", "Express Highway Freight"),
    ("Anil Deshmukh", "+91 98765 00013", "Commercial Heavy HGV"),
    ("Pradeep Rane", "+91 98765 00014", "Commercial Heavy HGV"),
    ("Kuldeep Tomar", "+91 98765 00015", "Commercial Heavy HGV"),
    ("Bhagwan Das", "+91 98765 00016", "Commercial Heavy HGV"),
    ("Mahesh Rawat", "+91 98765 00017", "Standard Transport License (Standby)"),
    ("Kailash Chand", "+91 98765 00018", "Standard Transport License (Standby)"),
    ("Pankaj Rajput", "+91 98765 00019", "Standard Transport License (Standby)"),
    ("Mohan Lal", "+91 98765 00020", "Standard Transport License (Standby)"),
]

CARGO_TEMPLATES = [
    ("Auto Spare Parts & Assemblies", "Automotive", False, False, False, False),
    ("Pharmaceutical Injectables & Vaccines", "Pharma", True, False, True, True),
    ("Industrial Solvents & Adhesives", "Chemicals", False, True, False, False),
    ("Fresh Organic Dairy & Confectionery", "FMCG", True, False, True, True),
    ("Precision Electronic Microcontrollers", "Electronics", True, False, False, False),
    ("Commercial Steel Coils & Fasteners", "Raw Materials", False, False, False, False),
    ("Pre-Fabricated Construction Modules", "Heavy Machinery", False, False, False, False),
    ("FMCG Packaged Goods & Beverages", "FMCG", False, False, False, False),
    ("Solar Panels & Photovoltaic Inverters", "Electronics", True, False, False, False),
    ("Refined Industrial Lubricants", "Chemicals", False, True, False, False),
]


def backup_database_before_reset() -> str:
    """Create a physical copy of fleet_local.db and export JSON snapshot."""
    os.makedirs("backups", exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_db_path = f"backups/fleet_local_pre_reset_{timestamp}.db"

    if os.path.exists("fleet_local.db"):
        shutil.copy2("fleet_local.db", backup_db_path)

    try:
        conn = sqlite3.connect("fleet_local.db")
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall() if not row[0].startswith("sqlite_")]
        snapshot = {}
        for tbl in tables:
            cursor.execute(f"SELECT * FROM {tbl}")
            cols = [desc[0] for desc in cursor.description]
            snapshot[tbl] = [dict(zip(cols, row)) for row in cursor.fetchall()]
        with open(f"backups/snapshot_pre_reset_{timestamp}.json", "w") as f:
            json.dump(snapshot, f, indent=2, default=str)
    except Exception:
        pass

    return backup_db_path


def reset_and_seed_demo_fleet(
    db: Session,
    company_id: int = 1,
    random_seed: int = 42,
    create_backup: bool = True
) -> Dict[str, Any]:
    """
    Safely reset operational fleet data in strict foreign-key order
    and seed realistic Indian logistics hubs, trucks, drivers, and consignments.
    Preserves users, companies, and system authentication.
    """
    backup_file = None
    if create_backup:
        backup_file = backup_database_before_reset()

    rnd = random.Random(random_seed)
    now = datetime.now(timezone.utc)

    # 1. Delete in FK-safe reverse dependency order
    # (Do not touch User, Company)
    db.query(WellnessHistory).delete()
    db.query(MaintenanceLog).delete()
    db.query(TripDriverAssignment).delete()
    db.query(GPSTracking).delete()
    db.query(Trip).delete()
    db.query(DriverHandover).delete()
    db.query(Order).delete()
    db.query(Truck).delete()
    db.query(Driver).delete()
    db.query(Hub).delete()
    db.commit()

    # Ensure default company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        company = Company(
            id=company_id,
            name="CargoMind National Logistics Network",
            email="dispatch@cargomind.ai",
            phone="+91 751 245 0000"
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    # 2. Seed Hubs
    hubs = []
    for h_data in INDIAN_HUBS:
        hub = Hub(
            name=h_data["name"],
            city=h_data["city"],
            state=h_data["state"],
            latitude=str(h_data["lat"]),
            longitude=str(h_data["lon"]),
            address=f"{h_data['name']}, {h_data['city']}, {h_data['state']}, India",
            hub_type=h_data["type"],
            capacity_tons=float(int(h_data["cap"] / 1000)),
            operational_status="active",
            contact_name="Regional Hub Operations Lead",
            contact_phone="+91 98765 11111",
            company_id=company_id,
        )
        db.add(hub)
        hubs.append(hub)
    db.commit()

    # 3. Seed Trucks
    # Varied trips_since_service to demonstrate:
    # >= 30: due (critical)
    # 20 - 29: warning (recommended)
    # < 20: good condition
    trip_counts_pattern = [
        24,  # Truck 0: 24 trips -> Warning (matches reference requirement!)
        33,  # Truck 1: 33 trips -> Due for service
        12,  # Truck 2: 12 trips -> Good
        28,  # Truck 3: 28 trips -> Warning
        31,  # Truck 4: 31 trips -> Due for service
        8,   # Truck 5: 8 trips -> Good
        19,  # Truck 6: 19 trips -> Good
        25,  # Truck 7: 25 trips -> Warning
        6,   # Truck 8: 6 trips -> Good
        14,  # Truck 9: 14 trips -> Good
        35,  # Truck 10: 35 trips -> Due for service
        22,  # Truck 11: 22 trips -> Warning
        7,   # Truck 12: 7 trips -> Good
        16,  # Truck 13: 16 trips -> Good
        30,  # Truck 14: 30 trips -> Due (maintenance)
        34,  # Truck 15: 34 trips -> Due (maintenance)
    ]

    trucks = []
    for idx, spec in enumerate(TRUCK_SPECS):
        plate, model, cap_kg, vol_m3, eff, fuel, st = spec
        trips_count = trip_counts_pattern[idx % len(trip_counts_pattern)]
        km_count = round(trips_count * rnd.uniform(280.0, 490.0), 1)
        last_svc_days = rnd.randint(25, 120)
        last_svc_date = (now - timedelta(days=last_svc_days)).strftime("%Y-%m-%d")

        truck = Truck(
            registration_number=plate,
            model=model,
            capacity=cap_kg,
            volume_capacity=vol_m3,
            fuel_efficiency=int(eff),
            mileage_kmpl=float(eff),
            trips_since_service=trips_count,
            km_since_service=km_count,
            last_service_date=last_svc_date,
            fuel_type=fuel,
            status=st,
            company_id=company_id,
            max_speed_kmph=80.0,
            avg_speed_kmph=45.0,
            notes="[DEMO] Verified commercial vehicle record",
            year=rnd.randint(2021, 2025),
        )
        db.add(truck)
        trucks.append(truck)
    db.commit()

    # 4. Seed Drivers with varied, realistic wellness profiles
    # Distribution:
    # First 8 drivers: Well-rested (Wellness >= 80, "good")
    # Next 7 drivers: Moderate fatigue (Wellness 60-79, "fair")
    # Last 5 drivers: High fatigue / Insufficient rest (Wellness < 60, "needs_rest" - not assignable)
    drivers = []
    for i, d_spec in enumerate(DRIVER_NAMES):
        name, phone, lic = d_spec
        paired_truck = trucks[i] if i < len(trucks) else None
        driver_status = "busy" if paired_truck and paired_truck.status == "in_trip" else "available"

        if i < 8:
            # Good wellness
            h24 = round(rnd.uniform(0.5, 3.5), 1)
            h7d = round(rnd.uniform(14.0, 28.0), 1)
            night_h = round(rnd.uniform(0.0, 1.0), 1)
            rest_h = round(rnd.uniform(9.0, 16.0), 1)
            consec = rnd.randint(1, 3)
            last_rest_dt = now - timedelta(hours=rest_h)
        elif i < 15:
            # Fair wellness
            h24 = round(rnd.uniform(4.5, 6.5), 1)
            h7d = round(rnd.uniform(30.0, 40.0), 1)
            night_h = round(rnd.uniform(1.5, 2.5), 1)
            rest_h = round(rnd.uniform(8.0, 10.0), 1)
            consec = rnd.randint(3, 4)
            last_rest_dt = now - timedelta(hours=rest_h)
        else:
            # Needs rest (< 60)
            h24 = round(rnd.uniform(7.5, 9.5), 1)
            h7d = round(rnd.uniform(44.0, 52.0), 1)
            night_h = round(rnd.uniform(3.5, 5.0), 1)
            rest_h = round(rnd.uniform(3.0, 6.5), 1)  # < 8h rest!
            consec = rnd.randint(5, 7)
            last_rest_dt = now - timedelta(hours=rest_h)

        driver = Driver(
            name=name,
            phone=phone,
            license_number=f"IN-DL-{1000 + i}",
            license_category=lic,
            status=driver_status,
            working_hours=int(h7d),
            rest_hours=int(rest_h),
            hours_driven_24h=h24,
            hours_driven_7d=h7d,
            night_driving_hours=night_h,
            consecutive_working_days=consec,
            last_rest_start=last_rest_dt.isoformat(),
            company_id=company_id,
            notes="[DEMO] Commercial freight operator with GPS compliance",
        )
        db.add(driver)
        drivers.append(driver)
    db.commit()

    # Compute and persist real wellness score for each driver
    for d in drivers:
        w_res = compute_driver_wellness(d, db=db)
        d.wellness_score = w_res["score"]
        wh = WellnessHistory(
            driver_id=d.id,
            score=w_res["score"],
            band=w_res["band"],
            computed_at=now.isoformat(),
            breakdown=w_res["breakdown"]
        )
        db.add(wh)
    db.commit()

    # 5. Seed Consignments (Orders)
    # 30 orders total: 3 for active trips, 2 for completed trips, 25 pending
    orders = []
    hub_pairs = [
        (0, 1),   # Gwalior -> Delhi
        (1, 3),   # Delhi -> Jaipur
        (0, 4),   # Gwalior -> Bhopal
        (4, 5),   # Bhopal -> Indore
        (2, 6),   # Mumbai -> Pune
        (0, 7),   # Gwalior -> Agra
        (7, 8),   # Agra -> Lucknow
        (9, 2),   # Ahmedabad -> Mumbai
        (1, 10),  # Delhi -> Chandigarh
        (4, 11),  # Bhopal -> Nagpur
        (3, 9),   # Jaipur -> Ahmedabad
        (6, 11),  # Pune -> Nagpur
        (1, 7),   # Delhi -> Agra
        (8, 0),   # Lucknow -> Gwalior
        (5, 2),   # Indore -> Mumbai
    ]

    for idx in range(30):
        origin_hub_idx, dest_hub_idx = hub_pairs[idx % len(hub_pairs)]
        origin_hub = INDIAN_HUBS[origin_hub_idx]
        dest_hub = INDIAN_HUBS[dest_hub_idx]

        cargo_name, category, is_frag, is_haz, is_perish, is_cold = rnd.choice(CARGO_TEMPLATES)
        weight = rnd.randint(1800, 11500)
        target_vol = round((weight / 1000.0) * rnd.uniform(2.2, 3.1), 2)
        pkgs = rnd.randint(1, 8)
        vol_per_pkg = target_vol / pkgs
        base_side = vol_per_pkg ** (1.0 / 3.0)
        l_cm = round(max(40.0, base_side * 115.0), 1)
        w_cm = round(max(35.0, base_side * 95.0), 1)
        h_cm = round(max(30.0, (target_vol / (pkgs * (l_cm / 100.0) * (w_cm / 100.0))) * 100.0), 1)
        volume = round(((l_cm / 100.0) * (w_cm / 100.0) * (h_cm / 100.0)) * pkgs, 3)

        deadline_days = rnd.choice([1.0, 1.5, 2.0, 3.0, 4.0, 5.0])
        deadline_dt = now + timedelta(days=deadline_days)

        # Compute realistic road distance
        dist_km = 0
        try:
            route_res = compute_route_distance(
                origin_lat=origin_hub["lat"],
                origin_lon=origin_hub["lon"],
                dest_lat=dest_hub["lat"],
                dest_lon=dest_hub["lon"],
            )
            dist_km = route_res.get("distance_km", 0)
        except Exception:
            pass

        if not dist_km or dist_km <= 0:
            # Approximate haversine fallback with road factor 1.25
            from app.optimization.distance_matrix import calculate_distance
            dist_km = round(calculate_distance(origin_hub["lat"], origin_hub["lon"], dest_hub["lat"], dest_hub["lon"]) * 1.25, 1)

        est_hours = round(dist_km / 45.0, 1)
        urgency = "critical" if deadline_days <= 1.0 else ("urgent" if deadline_days <= 2.0 else "normal")

        order = Order(
            pickup_location=f"{origin_hub['name']}, {origin_hub['city']}",
            delivery_location=f"{dest_hub['name']}, {dest_hub['city']}",
            pickup_latitude=str(origin_hub["lat"]),
            pickup_longitude=str(origin_hub["lon"]),
            delivery_latitude=str(dest_hub["lat"]),
            delivery_longitude=str(dest_hub["lon"]),
            weight=weight,
            volume_m3=volume,
            length=l_cm,
            width=w_cm,
            height=h_cm,
            dimension_unit="cm",
            package_count=pkgs,
            deadline=deadline_dt.isoformat(),
            delivery_deadline=deadline_dt.isoformat(),
            distance_km=int(dist_km),
            estimated_travel_hours=est_hours,
            urgency=urgency,
            priority=rnd.randint(1, 5),
            cargo_category=category,
            is_fragile=is_frag,
            is_hazardous=is_haz,
            is_perishable=is_perish,
            requires_temperature_control=is_cold,
            temperature_min_c=2.0 if is_cold else None,
            temperature_max_c=8.0 if is_cold else None,
            handling_instructions=f"[DEMO] {cargo_name}. Handle with certified logistics protocol.",
            status="pending",
            company_id=company_id,
        )
        db.add(order)
        orders.append(order)
    db.commit()

    # 6. Seed Realistic In-Transit & Completed Trips
    # First 3 in-trip trucks get in-progress trips with start_times
    in_trip_trucks = [t for t in trucks if t.status == "in_trip"]
    created_trips = []

    for i, t in enumerate(in_trip_trucks):
        o = orders[i]
        d = drivers[i]
        o.status = "assigned"

        # Calculate polyline geometry
        road_geo = None
        try:
            road_geo = get_road_route(
                float(o.pickup_latitude),
                float(o.pickup_longitude),
                float(o.delivery_latitude),
                float(o.delivery_longitude),
            )
        except Exception:
            pass

        # Departed 2 to 4 hours ago for live simulated transit
        departed = now - timedelta(hours=rnd.uniform(1.8, 4.2))

        trip = Trip(
            truck_id=t.id,
            driver_id=d.id,
            order_id=o.id,
            distance=int(road_geo["distance_km"]) if (road_geo and road_geo.get("distance_km")) else o.distance_km,
            estimated_time=int(o.estimated_travel_hours * 60),
            fuel_cost=int((o.distance_km / (t.fuel_efficiency or 4.5)) * 90),
            status="in_progress",
            planned_route=road_geo,
            start_time=departed.isoformat(),
            average_speed_kmph=t.avg_speed_kmph or 45.0,
        )
        db.add(trip)
        created_trips.append(trip)

    # 2 Completed trips (orders 3 and 4)
    completed_pairs = [
        (orders[3], trucks[4], drivers[4]),
        (orders[4], trucks[5], drivers[5]),
    ]
    for o, t, d in completed_pairs:
        o.status = "delivered"
        trip = Trip(
            truck_id=t.id,
            driver_id=d.id,
            order_id=o.id,
            distance=o.distance_km,
            estimated_time=int(o.estimated_travel_hours * 60),
            fuel_cost=int((o.distance_km / (t.fuel_efficiency or 4.5)) * 90),
            status="completed",
            start_time=(now - timedelta(days=2)).isoformat(),
            average_speed_kmph=48.0,
        )
        db.add(trip)
        created_trips.append(trip)

    db.commit()

    return {
        "status": "success",
        "message": "Demo fleet data successfully seeded with verified Indian logistics hubs.",
        "backup_file": backup_file,
        "company_id": company_id,
        "hubs_seeded": len(hubs),
        "trucks_seeded": len(trucks),
        "available_trucks": len([t for t in trucks if t.status == "available"]),
        "drivers_seeded": len(drivers),
        "consignments_seeded": len(orders),
        "pending_consignments": len([o for o in orders if o.status == "pending"]),
        "trips_seeded": len(created_trips),
        "in_progress_trips": len(in_trip_trucks),
        "completed_trips": 2,
    }
