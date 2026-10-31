
from fastapi import FastAPI
from fastapi.testclient import TestClient
from types import SimpleNamespace
from app.database.connection import get_db
from app.routes.optimization import router


app = FastAPI()
app.include_router(router)


class FakeQuery:
    def __init__(self, results):
        self.results = results

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self.results

    def first(self):
        return self.results[0] if self.results else None


class FakeDB:
    def __init__(self, query_results):
        results = list(query_results)
        self.trucks = results[0] if len(results) > 0 else []
        self.drivers = results[1] if len(results) > 1 else []
        self.orders = results[2] if len(results) > 2 else []
        self.trips = results[3] if len(results) > 3 else []

    def query(self, *args, **kwargs):
        from app.database.models import User, Trip, Truck, Driver, Order
        if args and args[0] is User:
            return FakeQuery([SimpleNamespace(id=1, email="admin@fleetai.com", role="admin", company_id=None)])
        if args and args[0] is Trip:
            return FakeQuery(self.trips)
        if args and args[0] is Truck:
            return FakeQuery(self.trucks)
        if args and args[0] is Driver:
            return FakeQuery(self.drivers)
        if args and args[0] is Order:
            return FakeQuery(self.orders)
        return FakeQuery([])

    def commit(self):
        pass

    def rollback(self):
        pass

    def refresh(self, obj):
        pass

    def add(self, obj):
        pass



def override_get_db_no_trucks():
    yield FakeDB([
        [],  # available trucks
        [],  # available drivers
        [],  # pending orders
    ])


app.dependency_overrides[get_db] = override_get_db_no_trucks
client = TestClient(app)


def test_fleet_route_returns_error_when_no_trucks():
    response = client.post("/optimization/fleet-route")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "fleet_not_feasible"
    assert "No available trucks found" in data["message"]


def override_get_db_no_drivers():
    dummy_truck = SimpleNamespace(id=1, company_id=1, capacity=1000, status="available")
    yield FakeDB([
        [dummy_truck],  # available trucks
        [],             # available drivers
        [],             # pending orders
    ])


def test_fleet_route_returns_error_when_no_drivers():
    app.dependency_overrides[get_db] = override_get_db_no_drivers

    response = client.post("/optimization/fleet-route")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "fleet_not_feasible"
    assert "No available drivers found" in data["message"]


def override_get_db_no_orders():
    dummy_truck = SimpleNamespace(id=1, company_id=1, capacity=1000, status="available")
    dummy_driver = SimpleNamespace(id=1, company_id=1, working_hours=8, status="available")
    yield FakeDB([
        [dummy_truck],   # available trucks
        [dummy_driver],  # available drivers
        [],              # pending orders
    ])


def test_fleet_route_returns_message_when_no_orders():
    app.dependency_overrides[get_db] = override_get_db_no_orders

    response = client.post("/optimization/fleet-route")

    assert response.status_code == 200
    data = response.json()
    assert "No pending orders found" in data["message"]


from types import SimpleNamespace


def override_get_db_invalid_order():
    invalid_order = SimpleNamespace(
        id=101,
        weight=100,
        delivery_latitude=120,  # Invalid: latitude must be -90 to 90
        delivery_longitude=77,
        status="pending",
    )

    truck = SimpleNamespace(
        id=1,
        company_id=1,
        capacity=1000,
        status="available",
    )

    driver = SimpleNamespace(
        id=1,
        company_id=1,
        working_hours=8,
        status="available",
    )

    yield FakeDB([
        [truck],          # Available trucks
        [driver],         # Available drivers
        [invalid_order],  # Pending orders
        [],               # Active Trip.order_id values
    ])


def test_fleet_route_excludes_invalid_order_coordinates():
    app.dependency_overrides[get_db] = override_get_db_invalid_order

    response = client.post("/optimization/fleet-route")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "route_not_feasible"
    assert data["message"] == "No pending orders fit the available trucks."
    assert data["excluded_orders"][0]["order_id"] == 101
    assert data["excluded_orders"][0]["reason"] == "Invalid delivery latitude"


def override_get_db_no_compatible_driver():
    truck = SimpleNamespace(
        id=1,
        company_id=10,
        capacity=1000,
        status="available",
    )

    driver = SimpleNamespace(
        id=2,
        company_id=20,
        working_hours=8,
        status="available",
    )

    order = SimpleNamespace(
        id=101,
        weight=100,
        delivery_latitude=22.72,
        delivery_longitude=75.86,
        status="pending",
    )

    yield FakeDB([
        [truck],   # Available trucks
        [driver],  # Driver belongs to a different company
        [order],   # Pending orders
    ])


def test_fleet_route_rejects_incompatible_company():
    app.dependency_overrides[get_db] = (
        override_get_db_no_compatible_driver
    )

    response = client.post("/optimization/fleet-route")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "fleet_not_feasible"
    assert "compatible" in data["message"].lower()
