"""
Unit tests for Driver Handover Planner.
Tests:
- 8h continuous driving limit
- 30-min break every 4.5h driving
- Night fatigue window 22:00-03:00 (1.25x fatigue multiplier)
- Missing hub / out of range warning case
"""

from datetime import datetime, timezone
import pytest

from app.optimization.handover_planner import (
    plan_journey_handovers,
    calculate_segment_fatigue,
    compute_cumulative_distances,
    haversine_km,
    DEFAULT_HANDOVER_CONFIG,
)


def test_haversine_accuracy():
    """Verify haversine distance calculation between known landmarks."""
    # Delhi to Agra is ~180-210 km
    d = haversine_km(28.6139, 77.2090, 27.1767, 78.0081)
    assert 170.0 < d < 220.0


def test_daytime_breaks_calculation():
    """Verify 30 min break every 4.5 h of continuous driving."""
    # 9.0 hours driving at 50 km/h = 450 km
    start_dt = datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc)
    res = calculate_segment_fatigue(
        start_dt=start_dt,
        distance_km=450.0,
        avg_speed_kmph=50.0,
        config=DEFAULT_HANDOVER_CONFIG,
    )
    # 9.0h driving has 2 breaks of 30 min = 60 min total break
    assert res["break_minutes"] == 60
    assert res["pure_driving_hours"] == 9.0
    assert res["total_transit_hours"] == 10.0


def test_night_window_fatigue_multiplier():
    """
    Verify night window (22:00-03:00) applies 1.25x fatigue multiplier,
    reducing allowable driving time.
    """
    # Start at 22:00 (10 PM) UTC and drive for 4.0 hours (200 km at 50 km/h)
    start_dt = datetime(2026, 11, 1, 22, 0, tzinfo=timezone.utc)
    res = calculate_segment_fatigue(
        start_dt=start_dt,
        distance_km=200.0,
        avg_speed_kmph=50.0,
        config=DEFAULT_HANDOVER_CONFIG,
    )
    # 4.0h driven entirely inside 22:00-03:00 night window
    # 4.0 * 1.25 = 5.0h effective fatigue
    assert res["night_hours"] >= 3.8
    assert res["effective_fatigue_hours"] >= 4.9


def test_handover_planner_under_8h_single_driver():
    """A short journey (< 8h) should require 0 handovers."""
    # 250 km at 50 km/h = 5.0 h driving
    start_dt = datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc)
    # Straight line polyline from lat 28.0 to 26.0
    coords = [[77.0, 28.0], [77.0, 27.0], [77.0, 26.0]]
    hubs = []
    driver = type("DummyDriver", (), {"id": 1, "name": "Solo Driver", "wellness_score": 90})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time=start_dt.isoformat(),
        avg_speed_kmph=50.0,
        hubs=hubs,
        origin_name="Start",
        dest_name="Finish",
        initial_driver=driver,
    )
    assert plan["total_handovers"] == 0
    assert len(plan["segments"]) == 1
    assert plan["segments"][0]["driver_name"] == "Solo Driver"


def test_handover_planner_over_8h_generates_handover():
    """A long journey (> 8h) with an intermediate hub should plan a handover before 8h limit."""
    # 700 km journey: at 50 km/h = 14 hours driving
    coords = [
        [77.0, 28.0],  # 0 km
        [77.0, 25.5],  # ~277 km (Hub location)
        [77.0, 22.0],  # ~667 km (Destination)
    ]
    cum = compute_cumulative_distances(coords)
    hub_km = cum[1]

    hub = {
        "id": 10,
        "name": "Midway Transit Hub",
        "city": "Midway",
        "latitude": 25.5,
        "longitude": 77.0,
    }

    driver1 = type("Driver", (), {"id": 1, "name": "Driver 1", "wellness_score": 85})()
    relay_driver = type("Driver", (), {"id": 2, "name": "Relay Driver", "wellness_score": 92})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00",
        avg_speed_kmph=50.0,
        hubs=[hub],
        origin_name="City A",
        dest_name="City B",
        initial_driver=driver1,
        available_relay_drivers=[relay_driver],
    )

    assert plan["total_handovers"] >= 1
    assert plan["handovers"][0]["hub_name"] == "Midway Transit Hub"
    assert plan["handovers"][0]["incoming_driver_name"] == "Relay Driver"
    # Outgoing driver should not have exceeded 8h limit
    assert plan["segments"][0]["effective_fatigue_hours"] <= 8.0


def test_no_hub_warning_generated():
    """If no corridor hub exists before the 8h limit, a warning must be explicitly flagged."""
    # Long journey with NO hubs
    coords = [[77.0, 28.0], [77.0, 20.0]]  # ~880 km
    driver1 = type("Driver", (), {"id": 1, "name": "Driver 1", "wellness_score": 85})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00",
        avg_speed_kmph=50.0,
        hubs=[],
        origin_name="City A",
        dest_name="City B",
        initial_driver=driver1,
    )

    assert len(plan["warnings"]) > 0
    assert any("No corridor hubs available" in w or "No hub available before the 8h limit" in w for w in plan["warnings"])

