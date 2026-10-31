import math
from ortools.linear_solver import pywraplp
from app.optimization.multi_day_scheduler import schedule_multi_day_trip


def get_order_effective_volume(order):
    raw_vol = getattr(order, "volume_m3", None)
    if raw_vol is not None and float(raw_vol) > 0:
        return round(float(raw_vol), 2)
    weight = float(getattr(order, "weight", 0) or 0)
    # Standard freight density: ~2.5 m³ per 1,000 kg (approx 400 kg/m³)
    return max(0.5, round((weight / 1000.0) * 2.5, 2))


def optimize_loads_v4(trucks, drivers, orders, fuel_price=90):
    """
    Optimizes load allocation using the OR-Tools SCIP mixed-integer programming solver.
    Respects:
      - Truck weight capacity
      - Truck volume capacity (m³)
      - Driver working hours across planning horizon
      - Single driver per truck, single truck per driver
      - Single assignment per consignment
    Two-stage objective:
      1. Maximize the total number of assigned orders
      2. Minimize total fuel cost while preserving the maximum order count
    """
    solver = pywraplp.Solver.CreateSolver("SCIP")

    if not solver:
        raise RuntimeError(
            "OR-Tools SCIP solver could not be created. Ensure ortools is installed with SCIP support."
        )

    # 8-second time limit per phase to ensure responsive UI execution
    solver.SetTimeLimit(8000)

    # -----------------------------------------------
    # 1. Input Validation
    # -----------------------------------------------
    if not trucks:
        return {
            "status": "no_trucks",
            "solver_status": "NO_RESOURCES",
            "solver_backend": "OR-Tools SCIP",
            "message": "No available trucks found in fleet.",
            "assignments": [],
            "unassigned_orders": [
                {
                    "order_id": getattr(o, "id", None),
                    "reason": "No available trucks in the fleet."
                }
                for o in orders
            ]
        }

    if not drivers:
        return {
            "status": "no_drivers",
            "solver_status": "NO_RESOURCES",
            "solver_backend": "OR-Tools SCIP",
            "message": "No available drivers found in fleet.",
            "assignments": [],
            "unassigned_orders": [
                {
                    "order_id": getattr(o, "id", None),
                    "reason": "No available drivers in the fleet."
                }
                for o in orders
            ]
        }

    if not orders:
        return {
            "status": "no_orders",
            "solver_status": "EMPTY_DATASET",
            "solver_backend": "OR-Tools SCIP",
            "message": "No pending orders provided for allocation.",
            "assignments": [],
            "unassigned_orders": []
        }

    valid_orders = []
    unassigned_orders = []

    max_truck_capacity = max(float(getattr(t, "capacity", 0) or 0) for t in trucks)
    max_truck_volume = max(float(getattr(t, "volume_capacity", 0) or 80.0) for t in trucks)

    for order in orders:
        try:
            weight = float(getattr(order, "weight", 0) or 0)
            distance = float(getattr(order, "distance_km", 0) or 0)
        except (TypeError, ValueError):
            unassigned_orders.append({
                "order_id": getattr(order, "id", None),
                "reason": "Invalid or non-numeric order weight or distance."
            })
            continue

        if weight <= 0:
            unassigned_orders.append({
                "order_id": getattr(order, "id", None),
                "reason": f"Order payload weight must be greater than 0 kg (received {weight})."
            })
            continue

        if distance < 0:
            unassigned_orders.append({
                "order_id": getattr(order, "id", None),
                "reason": f"Order distance cannot be negative (received {distance} km)."
            })
            continue

        if weight > max_truck_capacity:
            unassigned_orders.append({
                "order_id": getattr(order, "id", None),
                "reason": f"Order weight ({weight} kg) exceeds every available truck's capacity (max: {max_truck_capacity} kg).",
                "weight": weight,
                "largest_truck_capacity": max_truck_capacity
            })
            continue

        order_volume = get_order_effective_volume(order)
        if order_volume > max_truck_volume:
            unassigned_orders.append({
                "order_id": getattr(order, "id", None),
                "reason": f"Order volume ({order_volume} m³) exceeds every available truck's volume limit (max: {max_truck_volume} m³).",
                "volume_m3": order_volume,
                "largest_truck_volume": max_truck_volume
            })
            continue

        valid_orders.append(order)

    if not valid_orders:
        return {
            "status": "infeasible",
            "solver_status": "NO_FEASIBLE_ORDERS",
            "solver_backend": "OR-Tools SCIP",
            "message": "None of the pending orders can be accommodated by the available vehicles.",
            "assignments": [],
            "unassigned_orders": unassigned_orders
        }

    # -----------------------------------------------
    # 2. Decision Variables
    # x[t,d,o] = binary: 1 if order o is assigned to truck t and driver d
    # y[t,d]   = binary: 1 if driver d is assigned to truck t
    # -----------------------------------------------
    x = {}
    y = {}

    for truck in trucks:
        for driver in drivers:
            y[truck.id, driver.id] = solver.BoolVar(f"y_{truck.id}_{driver.id}")
            for order in valid_orders:
                x[truck.id, driver.id, order.id] = solver.BoolVar(
                    f"x_{truck.id}_{driver.id}_{order.id}"
                )

    # Constraint 1: Each truck is assigned to at most one driver
    for truck in trucks:
        solver.Add(sum(y[truck.id, driver.id] for driver in drivers) <= 1)

    # Constraint 2: Each driver is assigned to at most one truck
    for driver in drivers:
        solver.Add(sum(y[truck.id, driver.id] for truck in trucks) <= 1)

    # Constraint 3: Linking — order o assigned to (t, d) only if driver d is paired with truck t
    for truck in trucks:
        for driver in drivers:
            for order in valid_orders:
                solver.Add(x[truck.id, driver.id, order.id] <= y[truck.id, driver.id])

    # Constraint 4: Each order can be assigned at most once
    for order in valid_orders:
        solver.Add(
            sum(
                x[truck.id, driver.id, order.id]
                for truck in trucks
                for driver in drivers
            ) <= 1
        )

    # Constraint 5: Truck weight capacity
    for truck in trucks:
        capacity = float(getattr(truck, "capacity", 0) or 0)
        solver.Add(
            sum(
                float(getattr(order, "weight", 0) or 0) * x[truck.id, driver.id, order.id]
                for driver in drivers
                for order in valid_orders
            ) <= capacity
        )

    # Constraint 6: Truck volume capacity (m³) - strictly enforced on all orders
    for truck in trucks:
        truck_vol = float(getattr(truck, "volume_capacity", 0) or 80.0)
        if truck_vol > 0:
            solver.Add(
                sum(
                    get_order_effective_volume(order) * x[truck.id, driver.id, order.id]
                    for driver in drivers
                    for order in valid_orders
                ) <= truck_vol
            )

    # Constraint 7: Driver multi-day driving hours limit using individual truck speed settings
    PLANNING_HORIZON_DAYS = 7.0

    for driver in drivers:
        daily_hours = float(getattr(driver, "working_hours", 0) or 8.0)
        max_total_hours = daily_hours * PLANNING_HORIZON_DAYS

        solver.Add(
            sum(
                (float(getattr(order, "distance_km", 0) or 0) / min(float(getattr(truck, "avg_speed_kmph", 45.0) or 45.0), float(getattr(truck, "max_speed_kmph", 80.0) or 80.0)))
                * x[truck.id, driver.id, order.id]
                for truck in trucks
                for order in valid_orders
            ) <= max_total_hours
        )

    # -----------------------------------------------
    # 3. Stage 1: Maximize number of assigned orders
    # -----------------------------------------------
    assigned_count_expr = sum(
        x[truck.id, driver.id, order.id]
        for truck in trucks
        for driver in drivers
        for order in valid_orders
    )

    solver.Maximize(assigned_count_expr)
    status_stage1 = solver.Solve()

    if status_stage1 not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return {
            "status": "infeasible",
            "solver_status": "INFEASIBLE",
            "solver_backend": "OR-Tools SCIP",
            "message": "The allocation constraints could not be satisfied with the current fleet resources.",
            "assignments": [],
            "unassigned_orders": unassigned_orders + [
                {
                    "order_id": o.id,
                    "reason": "Solver found no feasible assignment satisfying capacity and driver constraints."
                }
                for o in valid_orders
            ]
        }

    best_count = int(round(assigned_count_expr.solution_value()))

    # If 0 orders could be assigned, return infeasible
    if best_count == 0:
        return {
            "status": "infeasible",
            "solver_status": "ZERO_ASSIGNMENTS",
            "solver_backend": "OR-Tools SCIP",
            "message": "No orders could be feasibly assigned within fleet capacity limits.",
            "assignments": [],
            "unassigned_orders": unassigned_orders + [
                {
                    "order_id": o.id,
                    "reason": "Could not be packed into available truck capacities."
                }
                for o in valid_orders
            ]
        }

    # -----------------------------------------------
    # 4. Stage 2: Minimize total fuel cost preserving best_count
    # -----------------------------------------------
    solver.Add(assigned_count_expr == best_count)

    objective = solver.Objective()
    objective.Clear()

    for truck in trucks:
        efficiency = float(getattr(truck, "fuel_efficiency", 0) or 0)
        for driver in drivers:
            for order in valid_orders:
                dist = float(getattr(order, "distance_km", 0) or 0)
                if efficiency > 0:
                    cost = (dist / efficiency) * fuel_price
                else:
                    cost = 1_000_000.0  # Penalty for unrated efficiency

                objective.SetCoefficient(x[truck.id, driver.id, order.id], cost)

    objective.SetMinimization()
    status_stage2 = solver.Solve()

    solver_status_str = (
        "OPTIMAL" if status_stage2 == pywraplp.Solver.OPTIMAL else
        "FEASIBLE" if status_stage2 == pywraplp.Solver.FEASIBLE else
        "SUBOPTIMAL"
    )
    objective_val = round(objective.Value(), 2) if status_stage2 in (
        pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE
    ) else None

    # -----------------------------------------------
    # 5. Extract and format solution
    # -----------------------------------------------
    assignments = []
    assigned_order_ids = set()

    for truck in trucks:
        for driver in drivers:
            if y[truck.id, driver.id].solution_value() < 0.5:
                continue

            assigned_orders = []

            for order in valid_orders:
                if x[truck.id, driver.id, order.id].solution_value() < 0.5:
                    continue

                dist = float(getattr(order, "distance_km", 0) or 0)
                efficiency = float(getattr(truck, "fuel_efficiency", 0) or 0)
                fuel_used = (dist / efficiency) if efficiency > 0 else 0.0
                fuel_cost = fuel_used * fuel_price

                truck_speed = min(
                    float(getattr(truck, "avg_speed_kmph", 45.0) or 45.0),
                    float(getattr(truck, "max_speed_kmph", 80.0) or 80.0)
                )

                trip_schedule = schedule_multi_day_trip(
                    distance_km=dist,
                    daily_working_hours=float(getattr(driver, "working_hours", 0) or 8.0),
                    average_speed_kmh=truck_speed,
                )

                assigned_orders.append({
                    "order_id": order.id,
                    "pickup_location": getattr(order, "pickup_location", "Origin"),
                    "delivery_location": getattr(order, "delivery_location", "Destination"),
                    "weight": float(getattr(order, "weight", 0) or 0),
                    "volume_m3": get_order_effective_volume(order),
                    "distance_km": dist,
                    "cargo_category": getattr(order, "cargo_category", "General Cargo"),
                    "urgency": getattr(order, "urgency", "normal"),
                    "estimated_driving_hours": round(dist / truck_speed, 2),
                    "estimated_days": trip_schedule.get("estimated_days", 1),
                    "daily_schedule": trip_schedule.get("daily_schedule", []),
                    "fuel_used_liters": round(fuel_used, 2),
                    "fuel_cost": round(fuel_cost, 2),
                })
                assigned_order_ids.add(order.id)

            if not assigned_orders:
                continue

            total_weight = sum(item["weight"] for item in assigned_orders)
            total_volume = sum(item["volume_m3"] for item in assigned_orders)
            total_distance = sum(item["distance_km"] for item in assigned_orders)
            total_hours = sum(item["estimated_driving_hours"] for item in assigned_orders)
            total_fuel_cost = sum(item["fuel_cost"] for item in assigned_orders)

            capacity = float(getattr(truck, "capacity", 0) or 0)
            vol_capacity = float(getattr(truck, "volume_capacity", 0) or 80.0)

            assignments.append({
                "truck_id": truck.id,
                "truck_registration": truck.registration_number,
                "driver_id": driver.id,
                "driver_name": driver.name,
                "truck_capacity": capacity,
                "volume_capacity": vol_capacity,
                "total_weight": total_weight,
                "total_weight_kg": total_weight,
                "total_volume_m3": round(total_volume, 2),
                "utilization_percentage": round(
                    (total_weight / capacity) * 100, 2
                ) if capacity > 0 else 0,
                "volume_utilization_percentage": round(
                    (total_volume / vol_capacity) * 100, 2
                ) if vol_capacity > 0 else 0,
                "driver_working_hours": driver.working_hours,
                "total_driving_hours": round(total_hours, 2),
                "total_distance_km": round(total_distance, 2),
                "total_fuel_cost": round(total_fuel_cost, 2),
                "fuel_cost": round(total_fuel_cost, 2),
                "orders": assigned_orders
            })

    # Unassigned orders with explanations
    for order in valid_orders:
        if order.id not in assigned_order_ids:
            unassigned_orders.append({
                "order_id": order.id,
                "pickup_location": getattr(order, "pickup_location", "Origin"),
                "delivery_location": getattr(order, "delivery_location", "Destination"),
                "weight": float(getattr(order, "weight", 0) or 0),
                "reason": (
                    "Could not be allocated within the remaining "
                    "truck capacity (weight/volume) and driver hours constraints."
                )
            })

    return {
        "status": "optimal" if solver_status_str == "OPTIMAL" else "feasible",
        "solver_status": solver_status_str,
        "solver_backend": "OR-Tools SCIP",
        "objective_value": objective_val,
        "fuel_price_per_liter": fuel_price,
        "average_speed_kmh": 45,
        "total_orders_evaluated": len(orders),
        "total_orders_assigned": len(assigned_order_ids),
        "total_orders_unassigned": len(unassigned_orders),
        "assignments": assignments,
        "unassigned_orders": unassigned_orders
    }
