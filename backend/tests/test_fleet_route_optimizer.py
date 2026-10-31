from types import SimpleNamespace

from app.optimization.fleet_route_optimizer import optimize_fleet_routes


def make_order(order_id, weight):
    return SimpleNamespace(id=order_id, weight=weight)


def make_truck(truck_id, capacity):
    return SimpleNamespace(id=truck_id, capacity=capacity)


def test_order_fits_truck_capacity():
    orders = [make_order(1, 500)]
    trucks = [make_truck(9, 5000)]
    drivers = []

    distance_matrix = [
        [0, 100],
        [100, 0],
    ]

    result = optimize_fleet_routes(
        distance_matrix, orders, trucks, drivers
    )

    assert result["status"] == "optimal"
    assert result["unassigned_order_ids"] == []
    assert result["routes"][0]["total_weight"] == 500


def test_order_exceeding_all_truck_capacities_is_unassigned():
    orders = [make_order(2, 6000)]
    trucks = [make_truck(9, 5000)]
    drivers = []

    distance_matrix = [
        [0, 100],
        [100, 0],
    ]

    result = optimize_fleet_routes(
        distance_matrix, orders, trucks, drivers
    )

    assert result["status"] == "optimal"
    assert result["routes"] == []
    assert result["unassigned_order_ids"] == [2]


def test_empty_orders():
    result = optimize_fleet_routes(
        distance_matrix=[[0]],
        orders=[],
        trucks=[make_truck(9, 5000)],
        drivers=[],
    )

    assert result["status"] == "no_orders"
    assert result["routes"] == []


def test_multiple_orders_distributed_across_trucks():
    orders = [
        make_order(1, 4000),
        make_order(2, 4000),
    ]
    trucks = [
        make_truck(9, 5000),
        make_truck(7, 5000),
    ]
    drivers = []

    distance_matrix = [
        [0, 100, 200],
        [100, 0, 150],
        [200, 150, 0],
    ]

    result = optimize_fleet_routes(
        distance_matrix, orders, trucks, drivers
    )

    assert result["status"] == "optimal"
    assert result["unassigned_order_ids"] == []

    assigned_order_ids = {
        order_id
        for route in result["routes"]
        for order_id in [
            orders[location - 1].id
            for location in route["route"]
            if location > 0
        ]
    }

    assert assigned_order_ids == {1, 2}
    assert all(route["total_weight"] <= 5000 for route in result["routes"])

def test_no_trucks():
    orders = [make_order(1, 500)]
    trucks = []
    drivers = []

    result = optimize_fleet_routes(
        distance_matrix=[[0, 100], [100, 0]],
        orders=orders,
        trucks=trucks,
        drivers=drivers,
    )

    assert result["status"] == "no_trucks"
    assert result["routes"] == []

def test_zero_capacity_truck_is_rejected():
    orders = [make_order(1, 500)]
    trucks = [make_truck(9, 0)]
    drivers = []

    result = optimize_fleet_routes(
        [[0, 100], [100, 0]],
        orders,
        trucks,
        drivers,
    )

    assert result["status"] == "invalid_truck_capacity"
    assert result["routes"] == []