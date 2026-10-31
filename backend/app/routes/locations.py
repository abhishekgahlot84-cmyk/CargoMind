"""
FastAPI Router for Unified India Location Search, Autocomplete & Geocoding.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database.connection import get_db
from app.database.models import User
from app.routes.auth import get_current_user_optional
from app.optimization.india_gazetteer import (
    search_unified_locations,
    geocode_place_id,
    POPULAR_INDIAN_METROS,
)

router = APIRouter(
    prefix="/locations",
    tags=["Locations & Autocomplete"]
)


@router.get("/search")
def search_locations_endpoint(
    q: str = Query("", description="Search term, city name, airport code (BOM, DEL), or railway station (NDLS)"),
    limit: int = Query(10, ge=1, le=30),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Search unified locations across India:
    - Merges local alias table (BOM, DEL, GWL, BLR, etc.)
    - Bundled 3,780+ Indian cities and towns gazetteer
    - Server-side Google Places Autocomplete proxy with India restriction
    - User's saved company hubs
    """
    company_id = current_user.company_id if current_user else None
    return search_unified_locations(
        query=q,
        limit=limit,
        company_id=company_id,
        db=db
    )


@router.get("/popular")
def get_popular_locations_endpoint():
    """Returns curated list of top Indian freight metros and logistics centers."""
    return {
        "status": "success",
        "total": len(POPULAR_INDIAN_METROS),
        "results": [
            {
                "id": m["place_id"],
                "place_id": m["place_id"],
                "name": m["name"],
                "state": m["state"],
                "country": "India",
                "full_address": f"{m['name']}, {m['state']}, India",
                "latitude": m["lat"],
                "longitude": m["lon"],
                "hub_type": m["type"],
                "match_badge": "Popular Hub",
                "is_popular": True,
            }
            for m in POPULAR_INDIAN_METROS
        ]
    }


@router.get("/geocode")
def geocode_location_endpoint(
    place_id: str = Query(..., description="Google place_id to geocode to lat/lng"),
):
    """
    Geocode a place_id via server-side Google Places API.
    """
    geo = geocode_place_id(place_id)
    if not geo:
        raise HTTPException(
            status_code=404,
            detail=f"Unable to geocode place_id: {place_id}. Verify Google Places API credentials."
        )
    return geo
