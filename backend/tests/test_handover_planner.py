"""
Unit tests for Driver Handover Planner.
Comprehensive coverage of regulatory rules:
- Trips <= 8.0 driving hours (e.g. 6h, 7h, exactly 8.0h): 0 handovers, completed by same driver.
- Trips > 8.0 driving hours: handovers strictly after >= 8.0 hours driving.
- Preference for handovers between 9.0 and 10.0 driving hours when reachable.
- Long journeys with multiple relay segments (each >= 8.0 hours driving).
- Explicit failure when no reachable hub exists after the 8.0-hour minimum (no silent early handovers).
- Breaks (30 min every 4.5h) and night window fatigue calculation.
"""

import math
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
    """Verify night window (22:00-03:00) applies 1.25x fatigue multiplier."""
    start_dt = datetime(2026, 11, 1, 22, 0, tzinfo=timezone.utc)
    res = calculate_segment_fatigue(
        start_dt=start_dt,
        distance_km=200.0,
        avg_speed_kmph=50.0,
        config=DEFAULT_HANDOVER_CONFIG,
    )
    assert res["night_hours"] >= 3.8
    assert res["effective_fatigue_hours"] >= 4.9


@pytest.mark.parametrize("hours,km", [(6.0, 300.0), (7.0, 350.0), (8.0, 400.0)])
def test_trips_under_or_equal_8h_no_handover(hours, km):
    """
    Rule 1: If the complete trip can be driven in 8 hours or less (6h, 7h, exactly 8h),
    complete it with the same driver and do not create or require a driver handover.
    """
    # Create coordinate polyline for given km using exact haversine angular distance
    delta_lat = (km / 6371.0) * (180.0 / math.pi)
    coords = [[77.0, 28.0], [77.0, 28.0 - delta_lat]]
    driver = type("DummyDriver", (), {"id": 1, "name": "Primary Driver", "wellness_score": 90})()

    # Even with an active hub on the route, no handover should be scheduled
    mid_lat = 28.0 - (delta_lat * 0.5)
    hub = {"id": 5, "name": "Intermediate Hub", "latitude": mid_lat, "longitude": 77.0}

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00Z",
        avg_speed_kmph=50.0,
        hubs=[hub],
        origin_name="Start",
        dest_name="Finish",
        initial_driver=driver,
    )

    assert plan["status"] == "success"
    assert plan["total_handovers"] == 0
    assert len(plan["segments"]) == 1
    assert plan["segments"][0]["driver_name"] == "Primary Driver"
    assert plan["segments"][0]["pure_driving_hours"] <= 8.01


def test_trip_longer_than_8h_no_handover_before_8h():
    """
    Rule 2: A driver handover must never be planned before the driver has completed 8 hours of driving.
    Hub at 5.5h must be rejected; Hub at 9.2h must be selected.
    """
    # 650 km at 50 km/h = 13.0 hours driving
    coords = [
        [77.0, 28.0],                # 0 km
        [77.0, 28.0 - (275 / 111)],  # 275 km (~5.5h driving)
        [77.0, 28.0 - (460 / 111)],  # 460 km (~9.2h driving)
        [77.0, 28.0 - (650 / 111)],  # 650 km (~13.0h driving)
    ]
    early_hub = {"id": 10, "name": "Early Hub (5.5h)", "latitude": 28.0 - (275 / 111), "longitude": 77.0}
    valid_hub = {"id": 20, "name": "Valid Hub (9.2h)", "latitude": 28.0 - (460 / 111), "longitude": 77.0}

    driver1 = type("Driver", (), {"id": 1, "name": "Driver 1", "wellness_score": 85})()
    relay1 = type("Driver", (), {"id": 2, "name": "Relay 1", "wellness_score": 90})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00Z",
        avg_speed_kmph=50.0,
        hubs=[early_hub, valid_hub],
        origin_name="Origin",
        dest_name="Destination",
        initial_driver=driver1,
        available_relay_drivers=[relay1],
    )

    assert plan["status"] == "success"
    assert plan["total_handovers"] == 1
    chosen_handover = plan["handovers"][0]
    # Early hub must NOT be chosen
    assert chosen_handover["hub_name"] == "Valid Hub (9.2h)"
    # Segment driving hours must be >= 8.0
    first_seg = plan["segments"][0]
    assert first_seg["pure_driving_hours"] >= 8.0
    assert first_seg["pure_driving_hours"] == pytest.approx(9.2, abs=0.2)


def test_preferred_handover_between_9_and_10_hours():
    """
    Rule 3: Prefer a handover point between 9 and 10 driving hours when a suitable hub exists.
    Given hubs at 8.2h, 9.4h, and 10.5h, the 9.4h hub must be chosen.
    """
    # 700 km @ 50 km/h = 14h driving
    # 8.2h = 410 km, 9.4h = 470 km, 10.5h = 525 km
    coords = [
        [77.0, 28.0],
        [77.0, 28.0 - (410 / 111)],
        [77.0, 28.0 - (470 / 111)],
        [77.0, 28.0 - (525 / 111)],
        [77.0, 28.0 - (700 / 111)],
    ]
    hub_8_2 = {"id": 1, "name": "Hub 8.2h", "latitude": 28.0 - (410 / 111), "longitude": 77.0}
    hub_9_4 = {"id": 2, "name": "Hub 9.4h Preferred", "latitude": 28.0 - (470 / 111), "longitude": 77.0}
    hub_10_5 = {"id": 3, "name": "Hub 10.5h", "latitude": 28.0 - (525 / 111), "longitude": 77.0}

    driver = type("Driver", (), {"id": 1, "name": "Driver 1", "wellness_score": 85})()
    relay = type("Driver", (), {"id": 2, "name": "Relay Driver", "wellness_score": 95})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00Z",
        avg_speed_kmph=50.0,
        hubs=[hub_8_2, hub_9_4, hub_10_5],
        origin_name="North",
        dest_name="South",
        initial_driver=driver,
        available_relay_drivers=[relay],
    )

    assert plan["status"] == "success"
    assert plan["total_handovers"] >= 1
    assert plan["handovers"][0]["hub_name"] == "Hub 9.4h Preferred"
    assert 9.0 <= plan["segments"][0]["pure_driving_hours"] <= 10.0


def test_long_trip_multi_segments():
    """
    Rule 4: Multi-segment long trip (e.g. 1800 km ~36h driving).
    Every intermediate driver segment must have >= 8.0 hours driving.
    """
    # 1800 km @ 50 km/h: hubs placed every 470 km (~9.4h)
    coords = [
        [77.0, 28.0],
        [77.0, 28.0 - (470 / 111)],   # ~470 km
        [77.0, 28.0 - (940 / 111)],   # ~940 km
        [77.0, 28.0 - (1410 / 111)],  # ~1410 km
        [77.0, 28.0 - (1800 / 111)],  # ~1800 km (dest)
    ]
    hubs = [
        {"id": 1, "name": "Relay Hub 1", "latitude": 28.0 - (470 / 111), "longitude": 77.0},
        {"id": 2, "name": "Relay Hub 2", "latitude": 28.0 - (940 / 111), "longitude": 77.0},
        {"id": 3, "name": "Relay Hub 3", "latitude": 28.0 - (1410 / 111), "longitude": 77.0},
    ]

    drivers = [
        type("Driver", (), {"id": i, "name": f"Driver {i}", "wellness_score": 85 + i})()
        for i in range(1, 6)
    ]

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T06:00:00Z",
        avg_speed_kmph=50.0,
        hubs=hubs,
        origin_name="Leh",
        dest_name="Kanyakumari",
        initial_driver=drivers[0],
        available_relay_drivers=drivers[1:],
    )

    assert plan["status"] == "success"
    assert plan["total_handovers"] == 3
    assert len(plan["segments"]) == 4

    # Verify each intermediate segment is >= 8.0h driving
    for i in range(3):
        seg = plan["segments"][i]
        assert seg["pure_driving_hours"] >= 8.0, f"Segment {i} was under 8.0 hours: {seg['pure_driving_hours']}"


def test_no_hub_after_8h_clear_failure():
    """
    Rule 5: If no valid handover hub exists after the 8-hour minimum,
    do not silently schedule an early handover. Return a clear planning error.
    """
    # 600 km trip @ 50 km/h = 12h driving. Only early hub at 200 km (4h driving).
    coords = [
        [77.0, 28.0],
        [77.0, 28.0 - (200 / 111)],  # 200 km (4h)
        [77.0, 28.0 - (600 / 111)],  # 600 km (12h)
    ]
    early_hub = {"id": 1, "name": "Early Hub (4h)", "latitude": 28.0 - (200 / 111), "longitude": 77.0}

    driver = type("Driver", (), {"id": 1, "name": "Driver 1", "wellness_score": 85})()

    plan = plan_journey_handovers(
        route_coordinates=coords,
        start_time="2026-11-01T08:00:00Z",
        avg_speed_kmph=50.0,
        hubs=[early_hub],
        origin_name="Origin",
        dest_name="Destination",
        initial_driver=driver,
    )

    assert plan["status"] == "error"
    assert plan["error_code"] == "NO_VALID_HANDOVER_HUB"
    assert plan["total_handovers"] == 0
    assert "8.0-hour driving minimum" in plan["message"]
