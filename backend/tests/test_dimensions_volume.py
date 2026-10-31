import unittest
from fastapi import HTTPException
from app.routes.orders import compute_and_validate_volume


class TestDimensionsVolume(unittest.TestCase):

    def test_cm_volume_single_package(self):
        """Verify standard cm conversion and calculation for a single package."""
        # 120cm x 80cm x 100cm = 1.2m x 0.8m x 1.0m = 0.960 m³
        l, w, h, unit, pkgs, vol = compute_and_validate_volume(
            length=120.0,
            width=80.0,
            height=100.0,
            dimension_unit="cm",
            package_count=1,
        )
        self.assertEqual(l, 120.0)
        self.assertEqual(w, 80.0)
        self.assertEqual(h, 100.0)
        self.assertEqual(unit, "cm")
        self.assertEqual(pkgs, 1)
        self.assertEqual(vol, 0.960)

    def test_cm_volume_multiple_packages(self):
        """Verify volume multiplies properly by package count."""
        # 120cm x 80cm x 100cm (2 pkgs) = 0.960 * 2 = 1.920 m³
        _, _, _, _, pkgs, vol = compute_and_validate_volume(
            length=120.0,
            width=80.0,
            height=100.0,
            dimension_unit="cm",
            package_count=2,
        )
        self.assertEqual(pkgs, 2)
        self.assertEqual(vol, 1.920)

    def test_meter_volume(self):
        """Verify meter conversion and calculation."""
        # 2.5m x 1.2m x 1.8m (1 pkg) = 5.400 m³
        l, w, h, unit, pkgs, vol = compute_and_validate_volume(
            length=2.5,
            width=1.2,
            height=1.8,
            dimension_unit="m",
            package_count=1,
        )
        self.assertEqual(unit, "m")
        self.assertEqual(vol, 5.400)

        # 1.5m x 1.0m x 1.0m (3 pkgs) = 4.500 m³
        _, _, _, _, pkgs, vol = compute_and_validate_volume(
            length=1.5,
            width=1.0,
            height=1.0,
            dimension_unit="m",
            package_count=3,
        )
        self.assertEqual(pkgs, 3)
        self.assertEqual(vol, 4.500)

    def test_feet_volume(self):
        """Verify feet to meter conversion (1 ft = 0.3048 m) and volume calculation."""
        # 5 ft x 3 ft x 4 ft (1 pkg)
        # 5 * 0.3048 = 1.524 m
        # 3 * 0.3048 = 0.9144 m
        # 4 * 0.3048 = 1.2192 m
        # 1.524 * 0.9144 * 1.2192 = 1.69901... -> 1.699 m³
        l, w, h, unit, pkgs, vol = compute_and_validate_volume(
            length=5.0,
            width=3.0,
            height=4.0,
            dimension_unit="ft",
            package_count=1,
        )
        self.assertEqual(unit, "ft")
        self.assertEqual(vol, 1.699)

    def test_decimal_dimensions_and_precision(self):
        """Verify decimal inputs and 3-decimal rounding precision."""
        # 35.5 cm x 24.2 cm x 18.7 cm (4 pkgs)
        # 0.355 * 0.242 * 0.187 = 0.01606517 * 4 = 0.06426... -> 0.064 m³
        _, _, _, _, _, vol = compute_and_validate_volume(
            length=35.5,
            width=24.2,
            height=18.7,
            dimension_unit="cm",
            package_count=4,
        )
        self.assertEqual(vol, 0.064)

    def test_large_quantity(self):
        """Verify calculation for larger quantities of small cartons."""
        # 40cm x 30cm x 20cm (100 pkgs)
        # 0.4 * 0.3 * 0.2 = 0.024 * 100 = 2.400 m³
        _, _, _, _, pkgs, vol = compute_and_validate_volume(
            length=40.0,
            width=30.0,
            height=20.0,
            dimension_unit="cm",
            package_count=100,
        )
        self.assertEqual(pkgs, 100)
        self.assertEqual(vol, 2.400)

    def test_reject_negative_dimensions(self):
        """Ensure negative length, width, or height raises 400 error."""
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=-10.0,
                width=50.0,
                height=50.0,
                dimension_unit="cm",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("strictly positive", ctx.exception.detail)

    def test_reject_zero_dimensions(self):
        """Ensure zero dimension raises 400 error."""
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=100.0,
                width=0.0,
                height=50.0,
                dimension_unit="cm",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("strictly positive", ctx.exception.detail)

    def test_reject_invalid_unit(self):
        """Ensure unsupported units (e.g., inches, yards) are rejected."""
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=10.0,
                width=10.0,
                height=10.0,
                dimension_unit="inches",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid dimension_unit", ctx.exception.detail)

    def test_reject_incomplete_dimensions(self):
        """Ensure all three dimensions must be supplied if any dimension is provided."""
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=100.0,
                width=None,
                height=50.0,
                dimension_unit="cm",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("All three dimensions", ctx.exception.detail)

    def test_reject_zero_or_negative_package_count(self):
        """Ensure package count < 1 raises 400 error."""
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=100.0,
                width=50.0,
                height=50.0,
                dimension_unit="cm",
                package_count=0,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Package count must be at least 1", ctx.exception.detail)

    def test_reject_exceeding_trailer_clearance(self):
        """Ensure single package dimensions exceeding trailer limits are rejected."""
        # Length > 18m (1800cm)
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=1900.0,
                width=100.0,
                height=100.0,
                dimension_unit="cm",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("clearances", ctx.exception.detail)

        # Width > 3.5m
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=5.0,
                width=4.0,
                height=2.0,
                dimension_unit="m",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("clearances", ctx.exception.detail)

    def test_reject_exceeding_max_cargo_capacity(self):
        """Ensure total volume exceeding heavy vehicle limit of 120 m³ is rejected."""
        # 15m x 3m x 3.5m = 157.5 m³ > 120 m³
        with self.assertRaises(HTTPException) as ctx:
            compute_and_validate_volume(
                length=15.0,
                width=3.0,
                height=3.5,
                dimension_unit="m",
                package_count=1,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("120 m³", ctx.exception.detail)

    def test_legacy_volume_fallback(self):
        """Ensure legacy orders with only volume_m3 provided continue to function."""
        l, w, h, unit, pkgs, vol = compute_and_validate_volume(
            length=None,
            width=None,
            height=None,
            volume_m3=14.5,
            allow_missing=False,
        )
        self.assertIsNone(l)
        self.assertIsNone(w)
        self.assertIsNone(h)
        self.assertEqual(vol, 14.5)


if __name__ == "__main__":
    unittest.main()
