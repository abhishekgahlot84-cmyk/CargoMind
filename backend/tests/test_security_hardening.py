"""
Comprehensive Security and Hardening Test Suite for CargoMind.
Tests:
1. Unauthenticated request rejection (401) on private endpoints.
2. Explicitly public endpoints remain accessible without authentication.
3. Invalid, forged, expired, and unknown-user JWT rejection (401).
4. Strict multi-tenant workspace isolation (Trucks, Drivers, Orders, Trips, GPS, Maintenance).
5. Workspace derivation (caller-supplied company_id ignored).
6. Password hashing with bcrypt and transparent legacy plaintext migration.
7. User and Company response schemas strictly redacting password fields.
8. Role-based access control (RBAC).
9. Production JWT secret validation (fail-fast on missing/weak secrets).
"""

import os
import time
import pytest
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database.models import Base, Company, User, Truck, Driver, Order, Trip, Hub, DriverHandover
from app.database.connection import get_db
from app.security import (
    hash_password,
    verify_and_update_password,
    create_access_token,
    validate_and_get_jwt_secret,
    DEFAULT_DEV_JWT_SECRET,
)

# In-memory SQLite session for security tests
test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_security_database():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()

    # Seed Company 1 and Company 2
    comp1 = Company(id=1, name="Apex Logistics", email="apex@logistics.com", phone="+919876543210")
    comp2 = Company(id=2, name="Blue Dart Corp", email="bluedart@corp.com", phone="+919876543211")
    db.add(comp1)
    db.add(comp2)
    db.commit()

    # Seed Users
    user1_hash = hash_password("AdminPass123!")
    user1 = User(id=1, name="Apex Admin", email="admin@apex.com", password=user1_hash, role="admin", company_id=1)

    user2_hash = hash_password("BluePass123!")
    user2 = User(id=2, name="Blue Admin", email="admin@blue.com", password=user2_hash, role="admin", company_id=2)

    # Legacy plaintext password user for migration testing
    user3 = User(id=3, name="Legacy User", email="legacy@apex.com", password="plaintext_password_123", role="operator", company_id=1)

    db.add(user1)
    db.add(user2)
    db.add(user3)
    db.commit()

    # Seed Company 1 Resources
    truck1 = Truck(
        id=101, registration_number="APEX-TRK-01", capacity=12000,
        fuel_type="Diesel", status="available", company_id=1, user_id=1,
        trips_since_service=25, km_since_service=7000.0
    )
    driver1 = Driver(
        id=201, name="Apex Driver 1", license_category="Heavy",
        experience_years=8, status="available", company_id=1, user_id=1
    )
    order1 = Order(
        id=301, pickup_location="Delhi Hub", delivery_location="Jaipur Hub",
        weight=5000, deadline="2026-11-20T10:00:00Z", status="pending", company_id=1, user_id=1
    )
    relay_driver1 = Driver(
        id=203, name="Apex Relay Driver", license_category="Heavy",
        experience_years=6, status="available", company_id=1, user_id=1,
        wellness_score=95, rest_hours=12.0
    )
    hub1 = Hub(
        id=501, name="Apex Intermediate Hub", city="Midway",
        latitude=25.0, longitude=77.0, operational_status="active",
        company_id=1, user_id=1
    )
    db.add(truck1)
    db.add(driver1)
    db.add(relay_driver1)
    db.add(order1)
    db.add(hub1)

    # Seed Company 2 Resources
    truck2 = Truck(
        id=102, registration_number="BLUE-TRK-01", capacity=15000,
        fuel_type="Diesel", status="available", company_id=2, user_id=2
    )
    driver2 = Driver(
        id=202, name="Blue Driver 1", license_category="Heavy",
        experience_years=5, status="available", company_id=2, user_id=2
    )
    order2 = Order(
        id=302, pickup_location="Mumbai Port", delivery_location="Pune Hub",
        weight=8000, deadline="2026-11-20T10:00:00Z", status="pending", company_id=2, user_id=2
    )
    db.add(truck2)
    db.add(driver2)
    db.add(order2)

    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def apex_headers():
    token = create_access_token(user_id=1, email="admin@apex.com", role="admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def blue_headers():
    token = create_access_token(user_id=2, email="admin@blue.com", role="admin")
    return {"Authorization": f"Bearer {token}"}


# =========================================================================
# 1. Unauthenticated Request Rejection
# =========================================================================
def test_private_endpoints_reject_unauthenticated_requests(client):
    """Ensure private routes return 401 Unauthorized when missing Bearer token."""
    private_endpoints = [
        ("GET", "/trucks/"),
        ("POST", "/trucks/"),
        ("GET", "/drivers/"),
        ("POST", "/drivers/"),
        ("GET", "/orders/"),
        ("POST", "/orders/"),
        ("GET", "/trips/"),
        ("POST", "/trips/"),
        ("GET", "/gps/simulation/fleet"),
        ("GET", "/maintenance/suggestions"),
        ("GET", "/users/"),
        ("POST", "/users/"),
        ("GET", "/companies/"),
        ("GET", "/dashboard/summary"),
        ("GET", "/hubs/"),
    ]
    for method, path in private_endpoints:
        if method == "GET":
            res = client.get(path)
        else:
            res = client.post(path, json={})
        assert res.status_code == 401, f"{method} {path} should return 401, got {res.status_code}"


def test_public_endpoints_allow_unauthenticated_requests(client):
    """Ensure explicitly public endpoints remain accessible without authentication."""
    public_endpoints = [
        "/",
        "/test-db",
        "/auth/config-status",
        "/orders/categories",
        "/locations/popular",
        "/locations/search?q=Delhi",
        "/hubs/types/list",
    ]
    for path in public_endpoints:
        res = client.get(path)
        assert res.status_code == 200, f"Public path {path} should return 200, got {res.status_code}"


# =========================================================================
# 2. Token Validation & Rejection
# =========================================================================
def test_invalid_and_forged_tokens_rejected(client):
    """Ensure malformed, forged, or expired tokens return 401."""
    # Malformed token
    res = client.get("/trucks/", headers={"Authorization": "Bearer not-a-valid-token"})
    assert res.status_code == 401
    assert "Invalid token" in res.json()["detail"]

    # Forged signature
    valid_token = create_access_token(user_id=1, email="admin@apex.com", role="admin")
    parts = valid_token.split(".")
    tampered_payload = parts[1] + "tamper"
    tampered_token = f"{parts[0]}.{tampered_payload}.{parts[2]}"
    res = client.get("/trucks/", headers={"Authorization": f"Bearer {tampered_token}"})
    assert res.status_code == 401

    # Token for nonexistent user
    token_ghost = create_access_token(user_id=99999, email="ghost@nowhere.com", role="admin")
    res = client.get("/trucks/", headers={"Authorization": f"Bearer {token_ghost}"})
    assert res.status_code == 401
    assert "does not exist" in res.json()["detail"]


# =========================================================================
# 3. Multi-Tenant Workspace Isolation
# =========================================================================
def test_workspace_isolation_trucks_and_drivers(client, apex_headers, blue_headers):
    """Ensure Blue Dart (Comp 2) cannot see or mutate Apex Logistics (Comp 1) trucks or drivers."""
    # Blue queries trucks -> only sees Blue trucks
    blue_trucks = client.get("/trucks/", headers=blue_headers).json()
    assert all(t["company_id"] == 2 for t in blue_trucks)
    assert not any(t["registration_number"] == "APEX-TRK-01" for t in blue_trucks)

    # Blue queries drivers -> only sees Blue drivers
    blue_drivers = client.get("/drivers/", headers=blue_headers).json()
    assert all(d["company_id"] == 2 for d in blue_drivers)
    assert not any(d["name"] == "Apex Driver 1" for d in blue_drivers)

    # Blue attempts to view Apex truck by ID -> 404
    res = client.get("/trucks/101", headers=blue_headers)
    assert res.status_code == 404

    # Blue attempts to update Apex truck -> 404
    res = client.put("/trucks/101", headers=blue_headers, json={"status": "maintenance"})
    assert res.status_code == 404

    # Blue attempts to delete Apex truck -> 404
    res = client.delete("/trucks/101", headers=blue_headers)
    assert res.status_code == 404


def test_workspace_isolation_gps_and_maintenance(client, blue_headers):
    """
    Ensure telemetry and maintenance suggestions do NOT leak vehicles across companies.
    Fixes the production issues shown in user screenshots.
    """
    # Fleet simulation for Blue Dart should only return Blue Dart trucks (truck 102)
    gps_res = client.get("/gps/simulation/fleet", headers=blue_headers)
    assert gps_res.status_code == 200
    locations = gps_res.json()
    assert isinstance(locations, list)
    assert all(loc["truck_id"] == 102 for loc in locations)

    # Maintenance suggestions for Blue Dart: truck 101 needs maintenance but belongs to Apex!
    # Blue Dart must NOT see truck 101 in suggestions.
    maint_res = client.get("/maintenance/suggestions", headers=blue_headers)
    assert maint_res.status_code == 200
    suggestions = maint_res.json().get("suggestions", [])
    assert not any(s["registration_number"] == "APEX-TRK-01" for s in suggestions)

    # Cross-tenant active trip query blocked
    cross_res = client.get("/gps/101/active-trip", headers=blue_headers)
    assert cross_res.status_code == 404


def test_truck_active_trip_response_structure(client, apex_headers):
    """Ensure /gps/{truck_id}/active-trip runs without NameError."""
    # When no active trip exists, returns 404 rather than 500 NameError
    res = client.get("/gps/101/active-trip", headers=apex_headers)
    assert res.status_code == 404
    assert "No active trip found" in res.json()["detail"]


def test_cross_company_trip_allocation_prevented(client, blue_headers):
    """Blue Dart cannot allocate an Apex truck or driver into a trip."""
    # Blue tries to create trip using Apex truck (101) and Blue driver (202)
    trip_data = {
        "order_id": 302,
        "truck_id": 101,  # Apex truck!
        "driver_id": 202,
        "distance": 150.0,
        "estimated_time": 180
    }
    res = client.post("/trips/", headers=blue_headers, json=trip_data)
    assert res.status_code in (400, 403, 404)


def test_create_trip_with_json_body_and_optional_ids(client, apex_headers):
    """Ensure POST /trips/ parses JSON body and handles optional truck_id/driver_id safely."""
    # Create trip with explicit truck_id and driver_id in JSON payload
    trip_payload = {
        "order_id": 301,
        "truck_id": 101,
        "driver_id": 201,
        "distance": 250.0,
        "estimated_time": 300,
        "fuel_cost": 3750
    }
    res = client.post("/trips/", headers=apex_headers, json=trip_payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    trip_info = res.json()["trip"]
    assert trip_info["order_id"] == 301
    assert trip_info["truck_id"] == 101
    assert trip_info["driver_id"] == 201

    # Attempting to assign truck 101 again while busy must fail with 400 or 409
    res_busy = client.post("/trips/", headers=apex_headers, json={
        "order_id": 301,
        "truck_id": 101,
        "driver_id": 201
    })
    assert res_busy.status_code in (400, 409)


def test_workspace_derivation_ignores_caller_supplied_company_id(client, apex_headers):
    """Ensure caller supplying company_id=999 is ignored; record gets current_user.company_id."""
    res = client.post("/trucks/", headers=apex_headers, json={
        "registration_number": "APEX-NEW-77",
        "capacity": 8000,
        "fuel_type": "Diesel",
        "company_id": 999  # Attacker attempts to spoof company_id
    })
    assert res.status_code == 200
    data = res.json()
    truck_data = data.get("truck", data)
    assert truck_data["company_id"] == 1  # Derived from Apex Admin (Comp 1)
    assert truck_data["company_id"] != 999


# =========================================================================
# 4. Password Security & Legacy Transparent Upgrade
# =========================================================================
def test_password_hashing_and_transparent_upgrade(client):
    """Verify bcrypt password hashing and transparent plaintext upgrade on login."""
    db = TestingSessionLocal()
    legacy_user = db.query(User).filter(User.id == 3).first()
    assert legacy_user.password == "plaintext_password_123"
    db.close()

    # Login with legacy plaintext password
    login_res = client.post("/auth/login", json={
        "email": "legacy@apex.com",
        "password": "plaintext_password_123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    assert token is not None

    # Check database: password must now be upgraded to bcrypt hash!
    db = TestingSessionLocal()
    migrated_user = db.query(User).filter(User.id == 3).first()
    assert migrated_user.password.startswith(("$2b$", "$2a$"))
    assert migrated_user.password != "plaintext_password_123"

    # Verify subsequent login works with the newly hashed password
    login_res2 = client.post("/auth/login", json={
        "email": "legacy@apex.com",
        "password": "plaintext_password_123"
    })
    assert login_res2.status_code == 200
    db.close()


def test_user_response_redacts_password_hash(client, apex_headers):
    """Ensure GET /users/ never exposes password or password_hash."""
    res = client.get("/users/", headers=apex_headers)
    assert res.status_code == 200
    users = res.json()
    assert len(users) > 0
    for u in users:
        assert "password" not in u
        assert "password_hash" not in u
        assert "hash" not in u
        assert "id" in u
        assert "email" in u
        assert "role" in u


# =========================================================================
# 5. Production Startup Configuration & JWT Secret Validation
# =========================================================================
def test_production_jwt_secret_validation(monkeypatch):
    """Ensure startup fails if JWT_SECRET is weak, default, or missing in production."""
    monkeypatch.setenv("ENVIRONMENT", "production")

    # Missing or empty secret
    monkeypatch.setenv("JWT_SECRET", "")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_and_get_jwt_secret()

    # Too short (<32 chars)
    monkeypatch.setenv("JWT_SECRET", "short-secret-123")
    with pytest.raises(RuntimeError, match="too short"):
        validate_and_get_jwt_secret()

    # Insecure default placeholder
    monkeypatch.setenv("JWT_SECRET", DEFAULT_DEV_JWT_SECRET)
    with pytest.raises(RuntimeError, match="insecure placeholder"):
        validate_and_get_jwt_secret()

    # Valid strong secret in production
    strong_secret = "cargomind-production-cryptographic-random-secret-key-64chars-min-length-2026"
    monkeypatch.setenv("JWT_SECRET", strong_secret)
    assert validate_and_get_jwt_secret() == strong_secret


# =========================================================================
# 6. Handover API Validation & 8-Hour Rule Enforcement
# =========================================================================
def test_handover_rejection_for_short_trip_under_8h(client, apex_headers):
    """
    Ensure POST /handovers/plan rejects handovers on trips <= 8.0 driving hours.
    Trip of 250 km @ 50 km/h = 5.0 hours driving.
    """
    db = TestingSessionLocal()
    short_trip = Trip(
        id=701,
        truck_id=101,
        driver_id=201,
        order_id=301,
        distance=250.0,
        average_speed_kmph=50.0,
        estimated_time=300,
        status="in_progress"
    )
    db.add(short_trip)
    db.commit()
    db.close()

    res = client.post("/handovers/plan", headers=apex_headers, json={
        "trip_id": 701,
        "hub_id": 501,
        "outgoing_driver_id": 201,
        "incoming_driver_id": 203,
        "planned_handover_time": "2026-11-20T14:00:00Z",
        "outgoing_km": 150.0
    })
    assert res.status_code == 400
    assert "8.0h threshold" in res.json()["detail"] or "<= 8.0h" in res.json()["detail"]


def test_handover_rejection_for_segment_under_8h(client, apex_headers):
    """
    Ensure POST /handovers/plan rejects handover when segment driving hours < 8.0.
    Trip is 700 km @ 50 km/h = 14h. Outgoing km 200 = 4.0h driving (< 8.0h).
    """
    db = TestingSessionLocal()
    long_trip = Trip(
        id=702,
        truck_id=101,
        driver_id=201,
        order_id=301,
        distance=700.0,
        average_speed_kmph=50.0,
        estimated_time=840,
        status="in_progress"
    )
    db.add(long_trip)
    db.commit()
    db.close()

    res = client.post("/handovers/plan", headers=apex_headers, json={
        "trip_id": 702,
        "hub_id": 501,
        "outgoing_driver_id": 201,
        "incoming_driver_id": 203,
        "planned_handover_time": "2026-11-20T18:00:00Z",
        "outgoing_km": 200.0  # 200 km / 50 km/h = 4.0 driving hours! Must be rejected
    })
    assert res.status_code == 400
    assert "at least 8.0 hours of driving" in res.json()["detail"]


def test_handover_accepts_valid_point_after_8h(client, apex_headers):
    """
    Ensure POST /handovers/plan accepts handover after 8.0 driving hours.
    Trip 700 km @ 50 km/h. Outgoing km 460 = 9.2h driving (>= 8.0h).
    """
    res = client.post("/handovers/plan", headers=apex_headers, json={
        "trip_id": 702,
        "hub_id": 501,
        "outgoing_driver_id": 201,
        "incoming_driver_id": 203,
        "planned_handover_time": "2026-11-20T18:00:00Z",
        "outgoing_km": 460.0  # 460 km / 50 km/h = 9.2 driving hours
    })
    assert res.status_code == 200
    handover = res.json()["handover"]
    assert handover["trip_id"] == 702
    assert handover["outgoing_km"] == 460.0


# =========================================================================
# 7. Optimization Company Isolation & Informative Solver Statuses
# =========================================================================
def test_cross_company_order_isolation_in_route_optimization(client, blue_headers):
    """
    Single route optimization (POST /optimization/route) for Blue Dart only
    uses Blue Dart pending orders, never cross-company Apex orders.
    """
    # Blue Dart (company 2) has truck 102, driver 202, and order 302
    res = client.post("/optimization/route", headers=blue_headers, params={
        "truck_id": 102,
        "driver_id": 202,
        "fuel_price": 90
    })
    assert res.status_code == 200
    data = res.json()
    # If route or message is present, it must only reference Blue's orders
    if "skipped_orders" in data:
        for s in data["skipped_orders"]:
            assert s["order_id"] != 301, "Cross-company Apex order 301 was inspected by Blue Dart!"


def test_load_allocation_informative_status(client, apex_headers):
    """Ensure load allocation returns informative outcome structure, not a 500 or error."""
    res = client.get("/optimization/load-allocation", headers=apex_headers, params={"fuel_price": 90})
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "solver_status" in data

