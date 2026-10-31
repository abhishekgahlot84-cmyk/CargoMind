"""
Unit & Integration test for Trip persistence and retrieval in CargoMind.
Verifies Requirement C.5: create a trip, then assert it appears in the list endpoint.
"""

import os
import sys
import json
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.database.models import Trip, Truck, Driver, Order, Company
from app.routes.trips import get_all_trips


def test_trip_creation_and_listing_persistence():
    db: Session = SessionLocal()
    trip_id = None
    try:
        # 1. Ensure default company exists
        company = db.query(Company).filter(Company.id == 1).first()
        if not company:
            company = Company(id=1, name="Test Company", email="test@cargomind.ai")
            db.add(company)
            db.commit()

        # 2. Ensure test truck, driver, and order exist
        truck = db.query(Truck).filter(Truck.registration_number == "TEST-TRUCK-99").first()
        if not truck:
            truck = Truck(
                registration_number="TEST-TRUCK-99",
                capacity=15000,
                volume_capacity=45.0,
                fuel_type="Diesel",
                fuel_efficiency=4.5,
                status="available",
                company_id=1
            )
            db.add(truck)
            db.commit()
            db.refresh(truck)

        driver = db.query(Driver).filter(Driver.name == "Test Pilot Driver").first()
        if not driver:
            driver = Driver(
                name="Test Pilot Driver",
                phone="+91 99999 00099",
                license_number="TEST-LIC-99",
                license_category="Commercial Heavy HGV",
                experience_years=5,
                status="available",
                company_id=1
            )
            db.add(driver)
            db.commit()
            db.refresh(driver)

        order = db.query(Order).filter(Order.pickup_location == "Test Origin Hub").first()
        if not order:
            order = Order(
                pickup_location="Test Origin Hub",
                delivery_location="Test Destination Hub",
                pickup_latitude="26.2183",
                pickup_longitude="78.1828",
                delivery_latitude="28.6139",
                delivery_longitude="77.2090",
                weight=3500,
                volume_m3=10.5,
                distance_km=320,
                deadline="2026-11-05T12:00:00Z",
                delivery_deadline="2026-11-05T12:00:00Z",
                status="pending",
                company_id=1
            )
            db.add(order)
            db.commit()
            db.refresh(order)

        # 3. Create a trip directly in DB
        new_trip = Trip(
            truck_id=truck.id,
            driver_id=driver.id,
            order_id=order.id,
            distance=320,
            estimated_time=420,
            fuel_cost=6500,
            status="planned"
        )
        db.add(new_trip)
        db.commit()
        db.refresh(new_trip)
        trip_id = new_trip.id
        assert trip_id is not None, "Failed to persist trip to DB"

        # 4. Verify via direct router function call
        trips_from_func = get_all_trips(current_user=None, db=db)
        func_match = [t for t in trips_from_func if t.get("id") == trip_id]
        assert len(func_match) == 1, f"Trip {trip_id} missing from get_all_trips() direct call"
        assert func_match[0]["truck_registration"] == "TEST-TRUCK-99"
        assert func_match[0]["driver_name"] == "Test Pilot Driver"
        assert func_match[0]["pickup_location"] == "Test Origin Hub"

        # 5. Verify via live HTTP GET /trips/ endpoint
        req = urllib.request.Request("http://127.0.0.1:8000/trips/")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200, f"GET /trips/ returned status {resp.status}"
            api_data = json.loads(resp.read().decode())

        http_match = [t for t in api_data if t.get("id") == trip_id]
        assert len(http_match) == 1, f"Trip {trip_id} missing from HTTP GET /trips/ endpoint response"
        assert http_match[0]["truck_registration"] == "TEST-TRUCK-99"
        assert http_match[0]["driver_name"] == "Test Pilot Driver"
        assert "Test Origin Hub" in http_match[0]["pickup_location"]
        assert "Test Destination Hub" in http_match[0]["delivery_location"]

        print(f"SUCCESS: Trip #{trip_id} verified in DB, router function, and HTTP GET /trips/ endpoint!")

    finally:
        # Cleanup
        if trip_id:
            db.query(Trip).filter(Trip.id == trip_id).delete()
            db.commit()
        db.close()


if __name__ == "__main__":
    test_trip_creation_and_listing_persistence()
