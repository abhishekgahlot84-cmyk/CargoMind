"""
API tests for fleet routing endpoint in app.routes.optimization.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from unittest.mock import patch

from app.routes.auth import get_current_user_optional
from app.routes.optimization import router


app = FastAPI()
app.include_router(router)
app.dependency_overrides[get_current_user_optional] = lambda: SimpleNamespace(id=1, company_id=1, role="admin")
client = TestClient(app)


def test_fleet_route_returns_error_when_no_trucks():
    dummy_order = SimpleNamespace(
        id=101, weight=100, pickup_location="Delhi", delivery_location="Agra",
        pickup_latitude=28.61, pickup_longitude=77.21,
        delivery_latitude=27.18, delivery_longitude=78.01,
        deadline=None, status="pending"
    )
    with patch("app.routes.optimization.get_available_trucks", return_value=[]), \
         patch("app.routes.optimization.get_available_drivers", return_value=[SimpleNamespace(id=1, name="Driver 1", working_hours=8, company_id=1)]), \
         patch("app.routes.optimization.get_pending_consignments", return_value=[dummy_order]):
        response = client.post("/optimization/fleet-route")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "fleet_not_feasible"
        assert "No available trucks found" in data["message"]


def test_fleet_route_returns_error_when_no_drivers():
    dummy_truck = SimpleNamespace(
        id=1, registration_number="TRK-01", capacity=10000, company_id=1,
        avg_speed_kmph=45.0, fuel_efficiency=5
    )
    dummy_order = SimpleNamespace(
        id=101, weight=100, pickup_location="Delhi", delivery_location="Agra",
        pickup_latitude=28.61, pickup_longitude=77.21,
        delivery_latitude=27.18, delivery_longitude=78.01,
        deadline=None, status="pending"
    )
    with patch("app.routes.optimization.get_available_trucks", return_value=[dummy_truck]), \
         patch("app.routes.optimization.get_available_drivers", return_value=[]), \
         patch("app.routes.optimization.get_pending_consignments", return_value=[dummy_order]):
        response = client.post("/optimization/fleet-route")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "fleet_not_feasible"
        assert "No available drivers found" in data["message"]


def test_fleet_route_returns_message_when_no_orders():
    dummy_truck = SimpleNamespace(
        id=1, registration_number="TRK-01", capacity=10000, company_id=1,
        avg_speed_kmph=45.0, fuel_efficiency=5
    )
    dummy_driver = SimpleNamespace(id=1, name="Driver 1", company_id=1, working_hours=8)
    with patch("app.routes.optimization.get_available_trucks", return_value=[dummy_truck]), \
         patch("app.routes.optimization.get_available_drivers", return_value=[dummy_driver]), \
         patch("app.routes.optimization.get_pending_consignments", return_value=[]):
        response = client.post("/optimization/fleet-route")
        assert response.status_code == 200
        data = response.json()
        assert "No pending" in data["message"]


def test_fleet_route_excludes_invalid_order_coordinates():
    invalid_order = SimpleNamespace(
        id=101,
        weight=100,
        delivery_latitude=120,  # Invalid latitude > 90
        delivery_longitude=77,
        status="pending",
        pickup_location="Delhi",
        delivery_location="Invalid Place",
        deadline=None,
    )
    dummy_truck = SimpleNamespace(
        id=1, registration_number="TRK-01", capacity=10000, company_id=1,
        avg_speed_kmph=45.0, fuel_efficiency=5
    )
    dummy_driver = SimpleNamespace(id=1, name="Driver 1", company_id=1, working_hours=8)

    with patch("app.routes.optimization.get_available_trucks", return_value=[dummy_truck]), \
         patch("app.routes.optimization.get_available_drivers", return_value=[dummy_driver]), \
         patch("app.routes.optimization.get_pending_consignments", return_value=[invalid_order]):
        response = client.post("/optimization/fleet-route")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "route_not_feasible"
        assert len(data.get("excluded_orders", [])) > 0
        assert data["excluded_orders"][0]["order_id"] == 101


def test_fleet_route_rejects_incompatible_company():
    truck = SimpleNamespace(
        id=1, registration_number="TRK-10", company_id=10,
        capacity=1000, avg_speed_kmph=45.0, fuel_efficiency=5
    )
    driver = SimpleNamespace(id=2, name="Driver 2", company_id=20, working_hours=8)
    order = SimpleNamespace(
        id=101,
        weight=100,
        distance_km=150,
        delivery_latitude=22.72,
        delivery_longitude=75.86,
        status="pending",
        pickup_location="Indore",
        delivery_location="Bhopal",
        deadline=None,
    )

    with patch("app.routes.optimization.get_available_trucks", return_value=[truck]), \
         patch("app.routes.optimization.get_available_drivers", return_value=[driver]), \
         patch("app.routes.optimization.get_pending_consignments", return_value=[order]):
        response = client.post("/optimization/fleet-route")
        assert response.status_code == 200
        data = response.json()
        # Incompatible company results in route_not_feasible or fleet_not_feasible
        assert data["status"] in ["fleet_not_feasible", "route_not_feasible"]
