"""
India Boundary Validation Service for CargoMind.
Loads the official Survey of India boundary (simplified) and provides
high-performance point-in-polygon and polyline validation to ensure all
routes, hubs, and consignments stay strictly within Indian territory.
"""

import json
import os
import math
from typing import List, Tuple, Optional, Dict, Any

BOUNDARY_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
    "india_boundary.geojson"
)

# India approximate geographic bounding box:
# SW: 6.5° N, 68.0° E / NE: 37.5° N, 97.5° E
INDIA_BBOX = {
    "min_lon": 68.0,
    "max_lon": 97.5,
    "min_lat": 6.5,
    "max_lat": 37.5,
}

_BOUNDARY_POLYGONS: Optional[List[List[List[List[float]]]]] = None


def load_india_boundary() -> List[List[List[List[float]]]]:
    """
    Loads and caches India MultiPolygon coordinate rings.
    Structure: List of Polygons, where each Polygon is a List of Rings,
    and each Ring is a List of [lon, lat] points.
    """
    global _BOUNDARY_POLYGONS
    if _BOUNDARY_POLYGONS is not None:
        return _BOUNDARY_POLYGONS

    if not os.path.exists(BOUNDARY_FILE):
        raise FileNotFoundError(f"India boundary file not found at: {BOUNDARY_FILE}")

    with open(BOUNDARY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    polygons = []
    features = data.get("features", [])
    for feat in features:
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        if gtype == "Polygon":
            polygons.append(coords)
        elif gtype == "MultiPolygon":
            for poly in coords:
                polygons.append(poly)

    _BOUNDARY_POLYGONS = polygons
    return _BOUNDARY_POLYGONS


def _point_in_ring(x: float, y: float, ring: List[List[float]]) -> bool:
    """Standard ray-casting point-in-polygon algorithm."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    p1x, p1y = ring[0]
    for i in range(n + 1):
        p2x, p2y = ring[i % n]
        if y > min(p1y, p2y) and y <= max(p1y, p2y) and (x <= max(p1x, p2x)):
            if p1y != p2y:
                xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
            if p1x == p2x or x <= xinters:
                inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def _dist_to_segment_deg(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Computes minimum Euclidean distance in degrees from point (px, py) to segment (x1, y1)-(x2, y2)."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    projx = x1 + t * dx
    projy = y1 + t * dy
    return math.hypot(px - projx, py - projy)


def is_point_inside_india(lon: float, lat: float, buffer_deg: float = 0.035) -> bool:
    """
    Check if a (lon, lat) coordinate lies inside India's borders.
    Includes a small coastal/bridge tolerance buffer (~0.035 deg ≈ 3.8 km)
    to accommodate highway bridges, creeks, and coastal causeways (e.g. Thane creek,
    Ganjam coastal highway, Pamban bridge), while strictly rejecting points outside India
    (e.g., Bangladesh, Pakistan, Nepal, Sri Lanka, or open oceans).
    """
    # 1. Fast bounding box check
    if not (INDIA_BBOX["min_lon"] - buffer_deg <= lon <= INDIA_BBOX["max_lon"] + buffer_deg and
            INDIA_BBOX["min_lat"] - buffer_deg <= lat <= INDIA_BBOX["max_lat"] + buffer_deg):
        return False

    polygons = load_india_boundary()

    # 2. Exact ray-cast check inside outer boundaries (and not inside holes)
    for poly in polygons:
        if not poly:
            continue
        outer = poly[0]
        if _point_in_ring(lon, lat, outer):
            in_hole = False
            for hole in poly[1:]:
                if _point_in_ring(lon, lat, hole):
                    in_hole = True
                    break
            if not in_hole:
                return True

    # 3. Buffer check: if point is within buffer_deg of any outer boundary edge
    if buffer_deg > 0:
        for poly in polygons:
            if not poly:
                continue
            outer = poly[0]
            n = len(outer)
            for i in range(n):
                p1 = outer[i]
                p2 = outer[(i + 1) % n]
                if _dist_to_segment_deg(lon, lat, p1[0], p1[1], p2[0], p2[1]) <= buffer_deg:
                    return True

    return False


def validate_polyline_inside_india(
    coordinates: List[List[float]],
    sample_step: int = 25,
    buffer_deg: float = 0.035
) -> Tuple[bool, List[Tuple[float, float]]]:
    """
    Validates that all points along a route polyline stay strictly inside India.
    Samples every `sample_step` points plus start, end, and quarter points.
    Returns: (is_valid, list_of_violating_coords)
    """
    if not coordinates:
        return False, []

    # Build list of indices to check
    total_pts = len(coordinates)
    indices = set(range(0, total_pts, sample_step))
    indices.add(0)
    indices.add(total_pts - 1)
    if total_pts > 4:
        indices.add(total_pts // 4)
        indices.add(total_pts // 2)
        indices.add((3 * total_pts) // 4)

    violating_points: List[Tuple[float, float]] = []

    for idx in sorted(indices):
        pt = coordinates[idx]
        lon, lat = float(pt[0]), float(pt[1])
        if not is_point_inside_india(lon, lat, buffer_deg=buffer_deg):
            violating_points.append((lon, lat))

    is_valid = len(violating_points) == 0
    return is_valid, violating_points
