from datetime import datetime, timedelta

AVERAGE_SPEED_KMH = 50
DEFAULT_DAILY_WORKING_HOURS = 8
DEFAULT_REST_HOURS = 9


def schedule_multi_day_trip(
    distance_km,
    daily_working_hours=DEFAULT_DAILY_WORKING_HOURS,
    start_datetime=None,
    rest_hours=DEFAULT_REST_HOURS,
    estimated_time_hours=None,
    average_speed_kmh=45.0,
):
    distance_km = float(distance_km)
    daily_working_hours = float(daily_working_hours)
    rest_hours = float(rest_hours)
    avg_speed = float(average_speed_kmh or 45.0)

    if distance_km < 0:
        raise ValueError("Distance cannot be negative.")
    if daily_working_hours <= 0:
        raise ValueError("Daily working hours must be positive.")
    if rest_hours < 0:
        raise ValueError("Rest hours cannot be negative.")
    if avg_speed <= 0:
        avg_speed = 45.0

    if estimated_time_hours is None:
        total_driving_hours = distance_km / avg_speed
    else:
        total_driving_hours = float(estimated_time_hours)

    if total_driving_hours < 0:
        raise ValueError("Estimated time cannot be negative.")

    if start_datetime is None:
        start_datetime = datetime.now().replace(
            minute=0, second=0, microsecond=0
        )

    remaining_hours = total_driving_hours
    current_time = start_datetime
    daily_schedule = []

    while remaining_hours > 0:
        driving_today = min(remaining_hours, daily_working_hours)
        arrival_time = current_time + timedelta(hours=driving_today)
        is_last_day = remaining_hours <= daily_working_hours

        daily_schedule.append({
            "day": len(daily_schedule) + 1,
            "hours": round(driving_today, 2),
            "departure": current_time.isoformat(),
            "arrival": arrival_time.isoformat(),
            "rest_hours": 0 if is_last_day else rest_hours,
        })

        remaining_hours = max(0, remaining_hours - driving_today)

        if remaining_hours > 0:
            current_time = arrival_time + timedelta(hours=rest_hours)

    return {
        "distance_km": distance_km,
        "total_driving_hours": round(total_driving_hours, 2),
        "estimated_days": len(daily_schedule),
        "average_speed_kmh": AVERAGE_SPEED_KMH,
        "daily_schedule": daily_schedule,
    }