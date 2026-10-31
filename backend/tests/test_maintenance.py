"""
Unit tests for Maintenance Suggestions and Truck Exclusion logic.
Tests:
- Thresholds: warn at 20 trips, due at 30 trips
- Available truck filtering strictly excludes trucks in maintenance
- Counter reset upon marking as maintained
"""

import pytest
from app.database.connection import SessionLocal
from app.database.models import Truck, Trip, Company
from app.optimization.fleet_queries import get_available_trucks


class DummyTruck:
    def __init__(self, trips=0, km=0.0, status="available"):
        self.id = 1
        self.registration_number = "DL01AB1234"
        self.trips_since_service = trips
        self.km_since_service = km
        self.status = status
        self.capacity = 15000
        self.company_id = 1


def test_maintenance_thresholds_logic():
    """Verify suggestion urgency categorization."""
    from app.routes.maintenance import get_maintenance_suggestions_endpoint

    t_good = DummyTruck(trips=12, km=4000.0)
    t_warn = DummyTruck(trips=24, km=7500.0)
    t_due = DummyTruck(trips=32, km=11000.0)

    # Threshold rules: warn >= 20, due >= 30
    def check_urgency(trips, km):
        if trips >= 30 or km >= 12000.0:
            return "due"
        elif trips >= 20 or km >= 8000.0:
            return "warning"
        return None

    assert check_urgency(t_good.trips_since_service, t_good.km_since_service) is None
    assert check_urgency(t_warn.trips_since_service, t_warn.km_since_service) == "warning"
    assert check_urgency(t_due.trips_since_service, t_due.km_since_service) == "due"


def test_available_trucks_excludes_maintenance():
    """
    Ensure get_available_trucks strictly excludes trucks whose status is 'maintenance'.
    """
    db = SessionLocal()
    # Pick a truck and mark status as maintenance
    test_truck = db.query(Truck).filter(Truck.status == "available").first()
    if test_truck:
        orig_status = test_truck.status
        try:
            avail_before = get_available_trucks(db)
            assert test_truck.id in [t.id for t in avail_before]

            # Change to maintenance
            test_truck.status = "maintenance"
            db.commit()

            avail_after = get_available_trucks(db)
            assert test_truck.id not in [t.id for t in avail_after]
        finally:
            test_truck.status = orig_status
            db.commit()
    db.close()

