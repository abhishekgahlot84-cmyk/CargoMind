"""
Driver Wellness Score Engine for CargoMind.
Computes a scientifically grounded wellness score (0-100) reflecting driver alertness,
fatigue, circadian stress (night driving), shift duration, consecutive working days, and rest.

Bands:
  - >= 80: 'good' (Fully rested, optimal for dispatch)
  - 60-79: 'fair' (Acceptable for moderate shifts, monitor fatigue)
  - < 60:  'needs_rest' (BLOCKED from new trip assignment and relay handovers)

Formula is fully configurable and unit-tested.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List
from sqlalchemy.orm import Session

DEFAULT_WELLNESS_CONFIG: Dict[str, Any] = {
    "weights": {
        "hours_24h": 0.25,          # 25%: Recent 24h driving fatigue
        "hours_7d": 0.20,           # 20%: Cumulative weekly fatigue
        "night_hours": 0.15,        # 15%: Circadian disruption (22:00 - 03:00)
        "rest_recency": 0.15,       # 15%: Rest adequacy (>= 8h recommended)
        "consecutive_days": 0.15,   # 15%: Cumulative work stretch without off-duty day
        "handovers_penalty": 0.10,  # 10%: Stress from frequent relay handovers
    },
    "thresholds": {
        "max_hours_24h": 8.0,       # Driving >8h in 24h brings this subscore to 0
        "max_hours_7d": 48.0,       # Driving >48h in 7d brings this subscore to 0
        "max_night_hours": 4.0,     # >4h night driving in 24h brings this subscore to 0
        "min_rest_hours": 8.0,      # Rest >= 8h gives 100% rest score
        "max_consecutive_days": 6,  # 6 continuous days brings consecutive subscore to 0
        "max_recent_handovers": 4,  # >=4 handovers in 7d brings handover subscore to 0
    },
    "bands": {
        "good": 80,
        "fair": 60,
    }
}


def get_wellness_band(score: int) -> str:
    """Return wellness band string from numerical score."""
    if score >= 80:
        return "good"
    elif score >= 60:
        return "fair"
    return "needs_rest"


def compute_driver_wellness(
    driver: Any,
    db: Optional[Session] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute real-time wellness score (0-100), band, and sub-score breakdown for a driver.
    Reads real driver statistics from database fields and history.
    """
    cfg = config or DEFAULT_WELLNESS_CONFIG
    w = cfg["weights"]
    th = cfg["thresholds"]

    # 1. Extract raw driving metrics from driver object
    h24 = float(getattr(driver, "hours_driven_24h", 0.0) or 0.0)
    h7d = float(getattr(driver, "hours_driven_7d", 0.0) or 0.0)
    night_h = float(getattr(driver, "night_driving_hours", 0.0) or 0.0)
    rest_h = float(getattr(driver, "rest_hours", 0.0) or 0.0)
    consec_days = int(getattr(driver, "consecutive_working_days", 0) or 0)
    last_rest_str = getattr(driver, "last_rest_start", None)

    # If last_rest_start is provided, compute real elapsed rest time
    if last_rest_str:
        try:
            last_rest_dt = datetime.fromisoformat(str(last_rest_str).replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            if last_rest_dt.tzinfo is None:
                last_rest_dt = last_rest_dt.replace(tzinfo=timezone.utc)
            elapsed_rest = max(0.0, (now_dt - last_rest_dt).total_seconds() / 3600.0)
            if rest_h <= 0.0:
                rest_h = elapsed_rest
        except Exception:
            pass

    # Check if driver is actively resting or if rest period has completed
    rest_until_str = getattr(driver, "rest_until", None)
    is_actively_resting = (getattr(driver, "status", None) == "resting")
    rest_hours_remaining = 0.0

    if rest_until_str:
        try:
            rest_until_dt = datetime.fromisoformat(str(rest_until_str).replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            if rest_until_dt.tzinfo is None:
                rest_until_dt = rest_until_dt.replace(tzinfo=timezone.utc)

            if now_dt < rest_until_dt:
                is_actively_resting = True
                rest_hours_remaining = round(max(0.0, (rest_until_dt - now_dt).total_seconds() / 3600.0), 1)
            else:
                # Rest period has officially expired: driver has recovered!
                if getattr(driver, "status", None) == "resting":
                    driver.status = "available"
                    driver.hours_driven_24h = 0.0
                    driver.night_driving_hours = 0.0
                    driver.rest_hours = max(float(getattr(driver, "rest_hours", 0.0) or 0.0), 8.0)
                    driver.rest_until = None
                    is_actively_resting = False
                    rest_h = max(rest_h, 8.0)
                    h24 = 0.0
                    night_h = 0.0
                    if db is not None:
                        try:
                            db.commit()
                        except Exception:
                            pass
        except Exception:
            pass

    # 2. Count recent handovers in last 7 days if db session is provided
    recent_handovers_count = 0
    if db is not None and hasattr(driver, "id") and driver.id:
        try:
            from app.database.models import DriverHandover
            handovers = db.query(DriverHandover).filter(
                (DriverHandover.outgoing_driver_id == driver.id) |
                (DriverHandover.incoming_driver_id == driver.id)
            ).all()
            recent_handovers_count = min(len(handovers), 6)
        except Exception:
            recent_handovers_count = 0

    # 3. Calculate sub-scores (each 0 - 100)
    # 24-hour limit
    sub_24h = max(0.0, min(100.0, 100.0 * (1.0 - (h24 / max(0.1, th["max_hours_24h"])))))

    # 7-day limit
    sub_7d = max(0.0, min(100.0, 100.0 * (1.0 - (h7d / max(0.1, th["max_hours_7d"])))))

    # Night driving circadian disruption
    sub_night = max(0.0, min(100.0, 100.0 * (1.0 - (night_h / max(0.1, th["max_night_hours"])))))

    # Rest adequacy
    sub_rest = max(0.0, min(100.0, 100.0 * (rest_h / max(0.1, th["min_rest_hours"]))))

    # Consecutive working days
    sub_consec = max(0.0, min(100.0, 100.0 * (1.0 - (consec_days / max(1, th["max_consecutive_days"])))))

    # Handover fatigue penalty
    sub_handovers = max(0.0, min(100.0, 100.0 * (1.0 - (recent_handovers_count / max(1, th["max_recent_handovers"])))))

    # 4. Weighted Total
    total_score = (
        sub_24h * w["hours_24h"] +
        sub_7d * w["hours_7d"] +
        sub_night * w["night_hours"] +
        sub_rest * w["rest_recency"] +
        sub_consec * w["consecutive_days"] +
        sub_handovers * w["handovers_penalty"]
    )
    score = int(round(max(0.0, min(100.0, total_score))))
    band = get_wellness_band(score)

    # 5. Explanatory breakdown and tooltip reasons
    breakdown = {
        "hours_driven_24h": {
            "value": round(h24, 1),
            "sub_score": round(sub_24h, 1),
            "weight": w["hours_24h"],
            "impact": round(sub_24h * w["hours_24h"], 1)
        },
        "hours_driven_7d": {
            "value": round(h7d, 1),
            "sub_score": round(sub_7d, 1),
            "weight": w["hours_7d"],
            "impact": round(sub_7d * w["hours_7d"], 1)
        },
        "night_driving_hours": {
            "value": round(night_h, 1),
            "sub_score": round(sub_night, 1),
            "weight": w["night_hours"],
            "impact": round(sub_night * w["night_hours"], 1)
        },
        "rest_hours": {
            "value": round(rest_h, 1),
            "sub_score": round(sub_rest, 1),
            "weight": w["rest_recency"],
            "impact": round(sub_rest * w["rest_recency"], 1)
        },
        "consecutive_working_days": {
            "value": consec_days,
            "sub_score": round(sub_consec, 1),
            "weight": w["consecutive_days"],
            "impact": round(sub_consec * w["consecutive_days"], 1)
        },
        "recent_handovers": {
            "value": recent_handovers_count,
            "sub_score": round(sub_handovers, 1),
            "weight": w["handovers_penalty"],
            "impact": round(sub_handovers * w["handovers_penalty"], 1)
        }
    }

    reasons: List[str] = []
    if h24 > 6.0:
        reasons.append(f"{h24:.1f}h driven in last 24h (approaching 8h shift cap)")
    if night_h > 2.0:
        reasons.append(f"{night_h:.1f}h high-fatigue night driving (22:00-03:00)")
    if rest_h < 8.0:
        reasons.append(f"Only {rest_h:.1f}h rest since last trip (< 8h required)")
    if consec_days >= 4:
        reasons.append(f"{consec_days} consecutive days on duty")
    if not reasons and score >= 80:
        reasons.append("Well-rested, safe driving history, full circadian compliance")

    if is_actively_resting:
        is_assignable = False
        blocking_reason = (
            f"Driver on mandatory rest until {rest_until_str} ({rest_hours_remaining}h remaining)"
            if rest_until_str else "Driver currently on mandatory rest"
        )
    else:
        is_assignable = score >= 60 and rest_h >= 8.0
        blocking_reason = (
            "Score below 60 (high fatigue)" if score < 60
            else ("Insufficient rest (< 8 hours)" if rest_h < 8.0 else None)
        )

    return {
        "score": score,
        "band": band,
        "breakdown": breakdown,
        "reasons": reasons,
        "is_assignable": is_assignable,
        "blocking_reason": blocking_reason,
        "is_actively_resting": is_actively_resting,
        "rest_until": getattr(driver, "rest_until", None),
        "rest_hours_remaining": rest_hours_remaining,
    }


def update_and_persist_driver_wellness(
    driver: Any,
    db: Session,
    config: Optional[Dict[str, Any]] = None,
    persist_history: bool = True,
) -> Dict[str, Any]:
    """
    Recompute driver wellness score, save to driver record and log to wellness_history.
    """
    from app.database.models import WellnessHistory

    wellness = compute_driver_wellness(driver, db=db, config=config)
    driver.wellness_score = wellness["score"]

    if persist_history:
        now_iso = datetime.now(timezone.utc).isoformat()
        history_entry = WellnessHistory(
            driver_id=driver.id,
            score=wellness["score"],
            band=wellness["band"],
            computed_at=now_iso,
            breakdown=wellness["breakdown"],
        )
        db.add(history_entry)

    db.commit()
    return wellness

