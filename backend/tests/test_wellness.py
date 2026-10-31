"""
Unit tests for Driver Wellness Score calculation and thresholds.
Tests:
- Formula sub-scores (24h driving, 7d driving, night driving, rest recency, consecutive days)
- Band assignments: >= 80 good, 60-79 fair, < 60 needs_rest
- Assignability blocking for score < 60 or rest < 8h
"""

from app.optimization.wellness import (
    compute_driver_wellness,
    get_wellness_band,
    DEFAULT_WELLNESS_CONFIG,
)


class DummyDriver:
    def __init__(
        self,
        hours_driven_24h=0.0,
        hours_driven_7d=0.0,
        night_driving_hours=0.0,
        rest_hours=12.0,
        consecutive_working_days=1,
        last_rest_start=None,
    ):
        self.id = 1
        self.name = "Test Driver"
        self.hours_driven_24h = hours_driven_24h
        self.hours_driven_7d = hours_driven_7d
        self.night_driving_hours = night_driving_hours
        self.rest_hours = rest_hours
        self.consecutive_working_days = consecutive_working_days
        self.last_rest_start = last_rest_start


def test_wellness_band_thresholds():
    assert get_wellness_band(100) == "good"
    assert get_wellness_band(80) == "good"
    assert get_wellness_band(79) == "fair"
    assert get_wellness_band(60) == "fair"
    assert get_wellness_band(59) == "needs_rest"
    assert get_wellness_band(0) == "needs_rest"


def test_fully_rested_driver_high_score():
    """Driver with zero recent driving and full rest should achieve score >= 90."""
    driver = DummyDriver(
        hours_driven_24h=0.0,
        hours_driven_7d=10.0,
        night_driving_hours=0.0,
        rest_hours=14.0,
        consecutive_working_days=1,
    )
    res = compute_driver_wellness(driver)
    assert res["score"] >= 90
    assert res["band"] == "good"
    assert res["is_assignable"] is True
    assert res["blocking_reason"] is None


def test_high_fatigue_driver_blocked():
    """Driver with high 24h driving, night hours, and low rest must be flagged needs_rest and blocked."""
    driver = DummyDriver(
        hours_driven_24h=7.8,
        hours_driven_7d=46.0,
        night_driving_hours=4.2,
        rest_hours=4.0,  # < 8h!
        consecutive_working_days=6,
    )
    res = compute_driver_wellness(driver)
    assert res["score"] < 60
    assert res["band"] == "needs_rest"
    assert res["is_assignable"] is False
    assert res["blocking_reason"] is not None


def test_insufficient_rest_blocks_even_if_fair_score():
    """Even if composite score is >= 60, rest < 8h must block assignment."""
    driver = DummyDriver(
        hours_driven_24h=4.0,
        hours_driven_7d=25.0,
        night_driving_hours=1.0,
        rest_hours=5.5,  # < 8h mandatory rest!
        consecutive_working_days=3,
    )
    res = compute_driver_wellness(driver)
    assert res["is_assignable"] is False
    assert "rest" in res["blocking_reason"].lower()

