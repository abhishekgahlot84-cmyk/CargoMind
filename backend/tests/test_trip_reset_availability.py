"""
Tests for Vehicle & Driver Reset to Available, Post-Trip Completion, and Turnaround Availability.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.models import Base, Truck, Driver, Order, Trip, User, Company
from app.database.connection import get_db
from app.routes.auth import get_current_user
from app.routes.trucks import router as trucks_router
from app.routes.drivers import router as drivers_router
from app.routes.trips import router as trips_router
from app.optimization.fleet_queries import sync_fleet_resource_statuses

# Create single in-memory SQLite database for testing with StaticPool
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.include_router(trucks_router)
app.include_router(drivers_router)
app.include_router(trips_router)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, company_id=1, role="admin")
client = TestClient(app)


def setup_data():
    db = TestingSessionLocal()
    # Clean tables
    db.query(Trip).delete()
    db.query(Order).delete()
    db.query(Driver).delete()
    db.query(Truck).delete()
    db.query(User).delete()
    db.query(Company).delete()

    company = Company(id=1, name="Test Company", email="test@company.com")
    user = User(id=1, name="Admin User", email="admin@test.com", password="dummy", company_id=1, role="admin")
    db.add(company)
    db.add(user)

    truck = Truck(
        id=1,
        registration_number="TRK-RESET-01",
        capacity=8000,
        fuel_type="Diesel",
        status="assigned",
        company_id=1,
        user_id=1,
    )
    driver = Driver(
        id=1,
        name="Ramesh Kumar",
        license_category="Heavy (HCV)",
        status="busy",
        hours_driven_24h=9.0,
        night_driving_hours=3.0,
        wellness_score=50,
        rest_until=(datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
        company_id=1,
        user_id=1,
    )
    order = Order(
        id=1,
        company_id=1,
        weight=2000,
        status="assigned",
        pickup_location="Delhi",
        delivery_location="Agra",
        deadline="2026-11-20T12:00:00Z",
    )
    trip = Trip(
        id=1,
        truck_id=1,
        driver_id=1,
        order_id=1,
        distance=200.0,
        status="planned",
        start_time=(datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(),
        average_speed_kmph=45.0,
        user_id=1,
    )
    db.add(truck)
    db.add(driver)
    db.add(order)
    db.add(trip)
    db.commit()
    db.close()


def test_reset_truck_status():
    setup_data()
    # Call reset truck endpoint
    res = client.post("/trucks/1/reset-status")
    assert res.status_code == 200
    data = res.json()
    assert data["truck"]["status"] == "available"

    # Verify in DB
    db = TestingSessionLocal()
    truck = db.query(Truck).filter(Truck.id == 1).first()
    assert truck.status == "available"
    assert truck.turnaround_until is None
    db.close()


def test_reset_driver_status():
    setup_data()
    # Call reset driver endpoint
    res = client.post("/drivers/1/reset-status")
    assert res.status_code == 200
    data = res.json()
    assert data["driver"]["status"] == "available"
    assert data["driver"]["hours_driven_24h"] == 0.0
    assert data["driver"]["rest_until"] is None

    # Verify in DB
    db = TestingSessionLocal()
    driver = db.query(Driver).filter(Driver.id == 1).first()
    assert driver.status == "available"
    assert driver.rest_until is None
    assert driver.hours_driven_24h == 0.0
    db.close()


def test_trip_complete_and_release():
    setup_data()
    # Call complete and release endpoint
    res = client.post("/trips/1/complete-and-release")
    assert res.status_code == 200
    data = res.json()
    assert data["truck_status"] == "available"
    assert data["driver_status"] == "available"

    # Verify in DB
    db = TestingSessionLocal()
    trip = db.query(Trip).filter(Trip.id == 1).first()
    assert trip.status == "completed"
    assert trip.completed_at is not None

    truck = db.query(Truck).filter(Truck.id == 1).first()
    assert truck.status == "available"
    assert truck.trips_since_service == 1
    assert truck.km_since_service == 200.0

    driver = db.query(Driver).filter(Driver.id == 1).first()
    assert driver.status == "available"
    assert driver.rest_until is None

    order = db.query(Order).filter(Order.id == 1).first()
    assert order.status == "completed"
    db.close()


def test_trip_status_transition_releases_resources():
    setup_data()
    # Normal status update to completed
    res = client.put("/trips/1/status?status=completed")
    assert res.status_code == 200

    db = TestingSessionLocal()
    trip = db.query(Trip).filter(Trip.id == 1).first()
    assert trip.status == "completed"
    assert trip.completed_at is not None

    truck = db.query(Truck).filter(Truck.id == 1).first()
    assert truck.status == "available"

    driver = db.query(Driver).filter(Driver.id == 1).first()
    assert driver.status == "available"
    db.close()


def test_auto_completion_after_1_hour_cooldown():
    setup_data()
    db = TestingSessionLocal()
    # Trip started 5 hours ago for a 200km trip at 45km/h (takes ~4.44h).
    # 5 hours elapsed > 4.44h + 0.5h, so cooldown/arrival passed.
    trip = db.query(Trip).filter(Trip.id == 1).first()
    trip.status = "in_progress"
    trip.start_time = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    db.commit()

    # Trigger sync
    sync_fleet_resource_statuses(db, company_id=1)

    # Trip should auto-complete and resources become available
    db.refresh(trip)
    assert trip.status == "completed"
    assert trip.completed_at is not None

    truck = db.query(Truck).filter(Truck.id == 1).first()
    assert truck.status == "available"

    driver = db.query(Driver).filter(Driver.id == 1).first()
    assert driver.status == "available"
    db.close()


def test_reset_truck_already_available():
    setup_data()
    # First make it available
    res = client.post("/trucks/1/reset-status")
    assert res.status_code == 200
    assert res.json()["truck"]["status"] == "available"

    # Second call on already available truck (idempotent no-op)
    res2 = client.post("/trucks/1/reset-status")
    assert res2.status_code == 200
    assert "already available" in res2.json()["message"]
    assert res2.json()["truck"]["status"] == "available"


def test_reset_truck_active_in_progress_trip_fails():
    setup_data()
    db = TestingSessionLocal()
    trip = db.query(Trip).filter(Trip.id == 1).first()
    trip.status = "in_progress"
    db.commit()
    db.close()

    # Must reject making truck available while actively in transit on in-progress trip
    res = client.post("/trucks/1/reset-status")
    assert res.status_code == 400
    assert "actively in transit" in res.json()["detail"]


def test_reset_truck_under_maintenance_fails():
    setup_data()
    db = TestingSessionLocal()
    truck = db.query(Truck).filter(Truck.id == 1).first()
    truck.status = "maintenance"
    db.commit()
    db.close()

    # Must reject making truck available while in maintenance
    res = client.post("/trucks/1/reset-status")
    assert res.status_code == 400
    assert "under maintenance" in res.json()["detail"]


def test_reset_truck_invalid_id_404():
    setup_data()
    res = client.post("/trucks/99999/reset-status")
    assert res.status_code == 404
    assert res.json()["detail"] == "Truck not found"


def test_reset_driver_active_in_progress_trip_fails():
    setup_data()
    db = TestingSessionLocal()
    trip = db.query(Trip).filter(Trip.id == 1).first()
    trip.status = "in_progress"
    db.commit()
    db.close()

    # Must reject making driver available while actively in transit
    res = client.post("/drivers/1/reset-status")
    assert res.status_code == 400
    assert "actively in transit" in res.json()["detail"]


def test_reset_driver_already_available():
    setup_data()
    # First make driver available
    res = client.post("/drivers/1/reset-status")
    assert res.status_code == 200

    # Second call is idempotent no-op
    res2 = client.post("/drivers/1/reset-status")
    assert res2.status_code == 200
    assert "already available" in res2.json()["message"]
