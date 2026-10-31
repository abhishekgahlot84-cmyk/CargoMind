"""
Unit tests for the CargoMind Speed & Time-Based Speed Model.
Tests start, mid-trip, break compliance, completion, and validation rules.
"""

import unittest
from datetime import datetime, timezone, timedelta
from app.optimization.speed_model import (
    calculate_speed_and_progress,
    interpolate_position_along_polyline,
)


class TestSpeedModel(unittest.TestCase):

    def test_prompt_example_1am_to_2am_and_330am(self):
        """
        User requirement:
        'Example for the tests: start 1:00 AM, avg 45 km/h: at 2:00 AM -> 45 km travelled; at 3:30 AM -> 112.5 km'
        """
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        total_dist = 500.0  # long trip

        # At 2:00 AM (1 hour elapsed)
        time_2am = datetime(2026, 10, 30, 2, 0, 0, tzinfo=timezone.utc)
        res_2am = calculate_speed_and_progress(
            truck_avg_speed_kmph=45.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=time_2am,
            total_distance_km=total_dist,
        )
        self.assertEqual(res_2am["distance_travelled_km"], 45.0)
        self.assertEqual(res_2am["current_speed_kmph"], 45.0)
        self.assertEqual(res_2am["state"], "in_transit")

        # At 3:30 AM (2.5 hours elapsed)
        time_330am = datetime(2026, 10, 30, 3, 30, 0, tzinfo=timezone.utc)
        res_330am = calculate_speed_and_progress(
            truck_avg_speed_kmph=45.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=time_330am,
            total_distance_km=total_dist,
        )
        self.assertEqual(res_330am["distance_travelled_km"], 112.5)
        self.assertEqual(res_330am["current_speed_kmph"], 45.0)
        self.assertEqual(res_330am["state"], "in_transit")

    def test_avg_speed_exceeding_max_speed_rejected(self):
        """Truck average cruising speed cannot exceed mechanical/legal max speed."""
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            calculate_speed_and_progress(
                truck_avg_speed_kmph=95.0,
                truck_max_speed_kmph=80.0,
                trip_start_time=start_time,
                server_time=start_time,
                total_distance_km=100.0,
            )

    def test_zero_or_negative_speed_rejected(self):
        """Zero or negative speed must raise ValueError."""
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            calculate_speed_and_progress(
                truck_avg_speed_kmph=0.0,
                truck_max_speed_kmph=80.0,
                trip_start_time=start_time,
                server_time=start_time,
                total_distance_km=100.0,
            )

    def test_not_started_state(self):
        """When server time is before start time, vehicle is not started."""
        start_time = datetime(2026, 10, 30, 10, 0, 0, tzinfo=timezone.utc)
        server_time = datetime(2026, 10, 30, 9, 30, 0, tzinfo=timezone.utc)  # 30 mins before
        res = calculate_speed_and_progress(
            truck_avg_speed_kmph=50.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=server_time,
            total_distance_km=200.0,
        )
        self.assertEqual(res["state"], "not_started")
        self.assertEqual(res["current_speed_kmph"], 0.0)
        self.assertEqual(res["distance_travelled_km"], 0.0)
        self.assertEqual(res["distance_remaining_km"], 200.0)
        self.assertEqual(res["progress_percentage"], 0.0)

    def test_mandatory_driver_rest_break(self):
        """
        Compliance test: 4.5 hours driving -> 0.5 hour break.
        At 4.75 hours elapsed (4h 45m), vehicle should be on break, speed=0.
        """
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        server_time = start_time + timedelta(hours=4.75)  # 4h 45m: 15 min into 30 min break
        res = calculate_speed_and_progress(
            truck_avg_speed_kmph=50.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=server_time,
            total_distance_km=500.0,
            rest_rules={"drive_interval_hours": 4.5, "break_duration_hours": 0.5},
        )
        self.assertEqual(res["state"], "on_break")
        self.assertEqual(res["current_speed_kmph"], 0.0)
        # Distance travelled is frozen at 4.5 hours * 50 km/h = 225.0 km
        self.assertEqual(res["distance_travelled_km"], 225.0)

    def test_resuming_after_driver_break(self):
        """
        After 5.0 hours (4.5h driving + 0.5h break), vehicle resumes moving.
        At 5.5 hours elapsed, 5.0 hours moving * 50 km/h = 250.0 km.
        """
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        server_time = start_time + timedelta(hours=5.5)
        res = calculate_speed_and_progress(
            truck_avg_speed_kmph=50.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=server_time,
            total_distance_km=500.0,
            rest_rules={"drive_interval_hours": 4.5, "break_duration_hours": 0.5},
        )
        self.assertEqual(res["state"], "in_transit")
        self.assertEqual(res["current_speed_kmph"], 50.0)
        self.assertEqual(res["distance_travelled_km"], 250.0)

    def test_completed_state(self):
        """When total distance is reached, state is completed and speed is 0."""
        start_time = datetime(2026, 10, 30, 1, 0, 0, tzinfo=timezone.utc)
        # Trip of 100 km at 50 km/h takes 2.0 hours.
        server_time = start_time + timedelta(hours=3.0)
        res = calculate_speed_and_progress(
            truck_avg_speed_kmph=50.0,
            truck_max_speed_kmph=80.0,
            trip_start_time=start_time,
            server_time=server_time,
            total_distance_km=100.0,
        )
        self.assertEqual(res["state"], "completed")
        self.assertEqual(res["current_speed_kmph"], 0.0)
        self.assertEqual(res["distance_travelled_km"], 100.0)
        self.assertEqual(res["distance_remaining_km"], 0.0)
        self.assertEqual(res["progress_percentage"], 100.0)

    def test_polyline_interpolation_coordinates(self):
        """Checks interpolation strictly lands on the polyline segments."""
        polyline = [
            [77.2090, 28.6139],  # Delhi
            [77.4126, 23.2599],  # Bhopal
            [72.8777, 19.0760],  # Mumbai
        ]
        # At start (0 km)
        p0 = interpolate_position_along_polyline(polyline, 0.0, 1400.0)
        self.assertAlmostEqual(p0[0], 28.6139, places=3)
        self.assertAlmostEqual(p0[1], 77.2090, places=3)

        # At end (1400 km)
        p_end = interpolate_position_along_polyline(polyline, 1400.0, 1400.0)
        self.assertAlmostEqual(p_end[0], 19.0760, places=3)
        self.assertAlmostEqual(p_end[1], 72.8777, places=3)


if __name__ == "__main__":
    unittest.main()
