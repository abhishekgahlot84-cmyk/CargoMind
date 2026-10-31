from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp


def optimize_fleet_routes(
    distance_matrix,
    orders,
    trucks,
    drivers
):
    """
    Optimize multi-vehicle routing for fleet trucks and drivers across consignments.
    Uses OR-Tools Constraint Programming Routing Engine (Vehicle Routing Problem).
    Respects:
      - Vehicle capacities (weight)
      - Delivery urgency / penalty prioritization
      - Vehicle stops sequencing
    """
    number_of_orders = len(orders)
    number_of_trucks = len(trucks)

    for truck in trucks:
        if truck.capacity is None or float(truck.capacity) <= 0:
            return {
                "status": "invalid_truck_capacity",
                "solver_backend": "OR-Tools VRP",
                "message": f"Truck {getattr(truck, 'registration_number', truck.id)} has missing or invalid capacity.",
                "routes": [],
                "unassigned_order_ids": [o.id for o in orders]
            }

    if number_of_orders == 0:
        return {
            "status": "no_orders",
            "solver_backend": "OR-Tools VRP",
            "message": "No pending orders to route.",
            "routes": [],
            "unassigned_order_ids": []
        }

    if number_of_trucks == 0:
        return {
            "status": "no_trucks",
            "solver_backend": "OR-Tools VRP",
            "message": "No available trucks found for fleet routing.",
            "routes": [],
            "unassigned_order_ids": [o.id for o in orders]
        }

    # Create routing index manager:
    # locations: 0 is Depot, 1..N are order delivery locations
    manager = pywrapcp.RoutingIndexManager(
        len(distance_matrix),
        number_of_trucks,
        0  # Depot node
    )

    # Create routing model
    routing = pywrapcp.RoutingModel(manager)

    # Distance transit callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    distance_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(distance_callback_index)

    # Disjunction penalties: allowing unassigned orders if capacity is exceeded,
    # with urgency weighting (critical / urgent / scheduled / normal)
    for order_index in range(number_of_orders):
        index = manager.NodeToIndex(order_index + 1)
        urgency = getattr(orders[order_index], "urgency", "normal") or "normal"
        if urgency == "critical":
            penalty = 5_000_000
        elif urgency == "urgent":
            penalty = 3_000_000
        elif urgency == "scheduled":
            penalty = 1_500_000
        else:
            penalty = 1_000_000

        routing.AddDisjunction([index], penalty)

    # Capacity callback & dimension
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        if from_node == 0:
            return 0
        order_index = from_node - 1
        if 0 <= order_index < len(orders):
            return int(float(getattr(orders[order_index], "weight", 0) or 0))
        return 0

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    capacities = [int(float(truck.capacity or 0)) for truck in trucks]

    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null capacity slack
        capacities,
        True,  # start cumul to zero
        "Capacity"
    )

    # Search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = 3

    # Solve VRP model
    solution = routing.SolveWithParameters(search_parameters)

    status_code = routing.status()
    # Status: 1 = SUCCESS, 2 = PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED
    is_success = solution is not None and status_code in (1, 2)

    if not is_success:
        return {
            "status": "route_not_feasible",
            "solver_status": "INFEASIBLE",
            "solver_backend": "OR-Tools VRP",
            "message": "No feasible fleet route could be constructed. Vehicle capacities or delivery constraints were exceeded.",
            "routes": [],
            "unassigned_order_ids": [o.id for o in orders]
        }

    # Extract vehicle routes
    routes = []
    assigned_order_indices = set()

    for vehicle_id in range(number_of_trucks):
        index = routing.Start(vehicle_id)
        route_nodes = []
        route_distance = 0
        route_weight = 0

        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            route_nodes.append(node_index)

            if node_index > 0:
                order_index = node_index - 1
                if 0 <= order_index < len(orders):
                    route_weight += float(getattr(orders[order_index], "weight", 0) or 0)
                    assigned_order_indices.add(order_index)

            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)

        route_nodes.append(manager.IndexToNode(index))

        # Only retain vehicles that received deliveries
        if len(route_nodes) > 2:
            routes.append({
                "truck_index": vehicle_id,
                "truck_id": trucks[vehicle_id].id,
                "route": route_nodes,
                "total_distance": round(route_distance / 100.0, 2),  # distance_matrix scaled by 100
                "total_weight": route_weight
            })

    unassigned_order_ids = [
        orders[idx].id
        for idx in range(len(orders))
        if idx not in assigned_order_indices
    ]

    objective_val = round(solution.ObjectiveValue() / 100.0, 2)

    return {
        "status": "optimal" if status_code in (1, 2) else "feasible",
        "solver_status": "OPTIMAL" if status_code == 1 else "FEASIBLE",
        "solver_backend": "OR-Tools VRP",
        "objective_value": objective_val,
        "routes": routes,
        "unassigned_order_ids": unassigned_order_ids
    }
