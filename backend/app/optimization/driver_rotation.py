
from __future__ import annotations

from datetime import datetime, timedelta



def build_driver_rotation_schedule(
    distance_km: float,
    drivers: list,
    start_datetime: datetime,
    average_speed_kmh: float = 50.0,
    daily_limit_hours: float = 8.0,
    existing_assignments_by_driver: dict | None = None,
    existing_driving_hours_by_driver: dict | None = None,
):

    """
    Build a sequential driver-rotation schedule.

    working_hours:
        Total driving hours available to a driver across
        this generated schedule.

    daily_limit_hours:
        Maximum generated driving hours per calendar day.

    Existing assignments:
        Prevent time overlaps with known assignment windows.
        Existing driving hours are not included in the daily
        totals because only their time windows are provided.
    """

    if distance_km <= 0:
        raise ValueError("Distance must be positive.")

    if average_speed_kmh <= 0 or daily_limit_hours <= 0:
        raise ValueError(
            "Speed and daily limit must be positive."
        )
    existing_assignments_by_driver = (
        existing_assignments_by_driver or {}
    )

    existing_driving_hours_by_driver = (
        existing_driving_hours_by_driver or {}
    )

    remaining_km = float(distance_km)
    current_time = start_datetime
    assignments = []

    # Total hours consumed across this generated schedule.
    hours_used = {
        driver.id: 0.0
        for driver in drivers
    }

    # Generated driving hours, indexed by driver and calendar date.
    daily_hours_used = {
        driver.id: {}
        for driver in drivers
    }

    # Earliest time each driver can start another segment.
    available_at = {
        driver.id: start_datetime
        for driver in drivers
    }


    # Enforce rest after existing assignments as well.
    for driver in drivers:
        windows = existing_assignments_by_driver.get(
            driver.id, []
        )

        required_rest_hours = max(
            0.0,
            float(driver.rest_hours or 0),
        )

        for existing_start, existing_end in windows:
            # Reject incompatible naive/aware timestamps safely.
            if (
                start_datetime.tzinfo is None
            ) != (existing_start.tzinfo is None):
                raise ValueError(
                    "Start time and existing assignment "
                    "must use compatible timezone information."
                )

            if (
                start_datetime.tzinfo is None
            ) != (existing_end.tzinfo is None):
                raise ValueError(
                    "Start time and existing assignment "
                    "must use compatible timezone information."
                )

            # If the existing shift ends before the new schedule,
            # require the configured rest period.
            if existing_end <= start_datetime:
                rest_end = existing_end + timedelta(
                    hours=required_rest_hours
                )

                if rest_end > available_at[driver.id]:
                    available_at[driver.id] = rest_end



    def get_existing_daily_hours(driver_id, target_date):
        """Calculate existing assignment hours on a calendar date."""
        total_hours = 0.0

        for record in existing_driving_hours_by_driver.get(
            driver_id, []
        ):
            existing_start = record["start"]
            existing_end = record["end"]

            # Count only the portion that falls on target_date.
            day_start = datetime.combine(
                target_date,
                datetime.min.time(),
            )
            day_end = day_start + timedelta(days=1)

            if existing_start.tzinfo is not None:
                day_start = day_start.replace(
                    tzinfo=existing_start.tzinfo
                )
                day_end = day_end.replace(
                    tzinfo=existing_start.tzinfo
                )

            overlap_start = max(existing_start, day_start)
            overlap_end = min(existing_end, day_end)

            if overlap_end > overlap_start:
                total_hours += (
                    overlap_end - overlap_start
                ).total_seconds() / 3600

        return total_hours


    def find_conflict_free_start(
        driver,
        proposed_start,
        duration,
    ):
        """Find a start time that avoids existing time windows."""

        candidate_start = proposed_start
        windows = existing_assignments_by_driver.get(
            driver.id, []
        )

        while True:
            candidate_end = candidate_start + timedelta(
                hours=duration
            )

            conflict_found = False

            for existing_start, existing_end in windows:
                # Naive and timezone-aware timestamps cannot
                # safely be compared directly.
                if (
                    candidate_start.tzinfo is None
                ) != (existing_start.tzinfo is None):
                    return None

                if (
                    candidate_start.tzinfo is None
                ) != (existing_end.tzinfo is None):
                    return None

                if (
                    candidate_start < existing_end
                    and candidate_end > existing_start
                ):
                    candidate_start = existing_end
                    conflict_found = True
                    break

            if not conflict_found:
                return candidate_start

    while remaining_km > 0.001:
        candidates = []

        for driver in drivers:
            total_hours = max(
                0.0,
                float(driver.working_hours or 0),
            )

            remaining_driver_hours = (
                total_hours - hours_used[driver.id]
            )

            if remaining_driver_hours <= 0.000001:
                continue

            proposed_start = max(
                current_time,
                available_at[driver.id],
            )

            # Count driving hours already generated on this date.

            date_hours = daily_hours_used[
                driver.id
            ].get(proposed_start.date(), 0.0)

            existing_date_hours = get_existing_daily_hours(
                driver.id,
                proposed_start.date(),
            )

            remaining_daily_hours = (
                daily_limit_hours
                - date_hours
                - existing_date_hours
            )


            if remaining_daily_hours <= 0.000001:
                continue

            # Never let a generated segment cross midnight.
            next_midnight = datetime.combine(
                proposed_start.date() + timedelta(days=1),
                datetime.min.time(),
            )

            # Preserve the timezone of the proposed timestamp.
            if proposed_start.tzinfo is not None:
                next_midnight = next_midnight.replace(
                    tzinfo=proposed_start.tzinfo
                )

            hours_until_midnight = (
                next_midnight - proposed_start
            ).total_seconds() / 3600

            driving_hours = min(
                remaining_driver_hours,
                remaining_daily_hours,
                hours_until_midnight,
                remaining_km / average_speed_kmh,
            )

            if driving_hours <= 0.000001:
                continue

            conflict_free_start = find_conflict_free_start(
                driver,
                proposed_start,
                driving_hours,
            )

            if conflict_free_start is not None:
                candidates.append(
                    (
                        conflict_free_start,
                        driver.id,
                        driver,
                        driving_hours,
                    )
                )

        if not candidates:
            # Stop if no driver has any total driving hours left.
            any_hours_left = any(
                hours_used[driver.id]
                < max(0.0, float(driver.working_hours or 0))
                for driver in drivers
            )

            if not any_hours_left:
                break

            # Advance to the next calendar day.
            next_day = datetime.combine(
                current_time.date() + timedelta(days=1),
                datetime.min.time(),
            )

            if current_time.tzinfo is not None:
                next_day = next_day.replace(
                    tzinfo=current_time.tzinfo
                )

            current_time = next_day

            for driver in drivers:
                if available_at[driver.id] < current_time:
                    available_at[driver.id] = current_time

            continue
            break

        (
            shift_start,
            _,
            driver,
            candidate_hours,
        ) = min(
            candidates,
            key=lambda item: (item[0], item[1]),
        )

        # Recalculate limits if conflict handling moved the start.
        total_hours = max(
            0.0,
            float(driver.working_hours or 0),
        )

        remaining_driver_hours = (
            total_hours - hours_used[driver.id]
        )


        date_hours = daily_hours_used[
            driver.id
        ].get(shift_start.date(), 0.0)

        existing_date_hours = get_existing_daily_hours(
            driver.id,
            shift_start.date(),
        )

        remaining_daily_hours = (
            daily_limit_hours
            - date_hours
            - existing_date_hours
        )


        next_midnight = datetime.combine(
            shift_start.date() + timedelta(days=1),
            datetime.min.time(),
        )

        if shift_start.tzinfo is not None:
            next_midnight = next_midnight.replace(
                tzinfo=shift_start.tzinfo
            )

        hours_until_midnight = (
            next_midnight - shift_start
        ).total_seconds() / 3600

        driving_hours = min(
            candidate_hours,
            remaining_driver_hours,
            remaining_daily_hours,
            hours_until_midnight,
            remaining_km / average_speed_kmh,
        )

        if driving_hours <= 0.000001:
            break

        # Recheck the actual interval against existing assignments.
        verified_start = find_conflict_free_start(
            driver,
            shift_start,
            driving_hours,
        )

        if verified_start is None:
            break

        if verified_start != shift_start:
            # Recalculate on the next scheduling iteration.
            current_time = verified_start
            continue

        segment_start_km = distance_km - remaining_km

        distance_to_cover = min(
            remaining_km,
            driving_hours * average_speed_kmh,
        )

        actual_hours = (
            distance_to_cover / average_speed_kmh
        )

        segment_end_km = (
            segment_start_km + distance_to_cover
        )

        shift_end = shift_start + timedelta(
            hours=actual_hours
        )

        rest_hours = max(
            0.0,
            float(driver.rest_hours or 0),
        )

        assignments.append(
            {
                "driver_id": driver.id,
                "segment_start_km": round(
                    segment_start_km, 2
                ),
                "segment_end_km": round(
                    segment_end_km, 2
                ),
                "start_time": shift_start.isoformat(),
                "end_time": shift_end.isoformat(),
                "driving_hours": round(actual_hours, 2),
                "rest_hours_after": rest_hours,
            }
        )

        hours_used[driver.id] += actual_hours

        daily_hours_used[driver.id][
            shift_start.date()
        ] = (
            daily_hours_used[driver.id].get(
                shift_start.date(), 0.0
            ) + actual_hours
        )

        remaining_km = max(
            0.0,
            distance_km - segment_end_km,
        )

        available_at[driver.id] = (
            shift_end + timedelta(hours=rest_hours)
        )

        current_time = shift_end

    covered_distance = distance_km - remaining_km

    return {
        "distance_km": float(distance_km),
        "covered_distance_km": round(
            covered_distance, 2
        ),
        "uncovered_distance_km": round(
            max(0.0, remaining_km), 2
        ),
        "complete": remaining_km <= 0.001,
        "assignments": assignments,
    }
