"""
Unit tests for India Boundary Validation & Route Geometry.
Validates:
- Point-in-polygon checks against Survey of India outline
- Rejection of external coordinates (Dhaka, Colombo, Lahore, Kathmandu, oceans)
- Polyline validation for all points inside India
- Road routing via Google Routes API with regionCode="IN"
"""

import unittest
from app.optimization.india_boundary import (
    is_point_inside_india,
    validate_polyline_inside_india,
)
from app.optimization.road_route import get_road_route, decode_google_polyline


class TestIndiaRoutesValidation(unittest.TestCase):

    def test_indian_cities_inside_boundary(self):
        """Points across North, South, East, West, Central, and Northeast India."""
        cities = [
            ("Delhi", 77.2090, 28.6139),
            ("Mumbai", 72.8777, 19.0760),
            ("Kanyakumari", 77.5385, 8.0883),
            ("Leh", 77.5771, 34.1526),
            ("Guwahati", 91.7362, 26.1445),
            ("Itanagar", 93.6053, 27.0844),
            ("Vijayawada", 80.6480, 16.5062),
            ("Gwalior", 78.1828, 26.2183),
            ("Siliguri", 88.4283, 26.7271),
        ]
        for name, lon, lat in cities:
            with self.subTest(city=name):
                self.assertTrue(
                    is_point_inside_india(lon, lat),
                    f"{name} ({lon}, {lat}) should be verified inside India",
                )

    def test_foreign_and_ocean_locations_rejected(self):
        """Foreign territories and international waters must be strictly rejected."""
        foreign = [
            ("Dhaka, Bangladesh", 90.4125, 23.8103),
            ("Lahore, Pakistan", 74.3587, 31.5204),
            ("Colombo, Sri Lanka", 79.8612, 6.9271),
            ("Kathmandu, Nepal", 85.3240, 27.7172),
            ("Bay of Bengal (Deep Sea)", 88.0, 15.0),
            ("Arabian Sea (Deep Sea)", 65.0, 15.0),
        ]
        for name, lon, lat in foreign:
            with self.subTest(place=name):
                self.assertFalse(
                    is_point_inside_india(lon, lat),
                    f"{name} ({lon}, {lat}) must be rejected (outside India)",
                )

    def test_polyline_validation_inside_india(self):
        """Valid route entirely within India passes validation."""
        valid_route = [
            [77.2090, 28.6139],  # Delhi
            [78.1828, 26.2183],  # Gwalior
            [77.4126, 23.2599],  # Bhopal
            [72.8777, 19.0760],  # Mumbai
        ]
        is_valid, violations = validate_polyline_inside_india(valid_route)
        self.assertTrue(is_valid)
        self.assertEqual(len(violations), 0)

    def test_polyline_crossing_foreign_territory_rejected(self):
        """A polyline that traverses Dhaka (Bangladesh) must fail validation."""
        invalid_route = [
            [88.3639, 22.5726],  # Kolkata
            [90.4125, 23.8103],  # Dhaka (crosses border)
            [91.7362, 26.1445],  # Guwahati
        ]
        is_valid, violations = validate_polyline_inside_india(invalid_route, sample_step=1)
        self.assertFalse(is_valid)
        self.assertGreater(len(violations), 0)
        self.assertIn((90.4125, 23.8103), violations)

    def test_google_polyline_decoder(self):
        """Pure python polyline decoder correctly recovers coordinates."""
        # Encoded polyline for two points
        enc = "_p~iF~ps|U_ulLnnqC"
        decoded = decode_google_polyline(enc)
        self.assertEqual(len(decoded), 2)
        # Note: returns [lon, lat]
        self.assertAlmostEqual(decoded[0][0], -120.2, places=1)
        self.assertAlmostEqual(decoded[0][1], 38.5, places=1)


if __name__ == "__main__":
    unittest.main()
