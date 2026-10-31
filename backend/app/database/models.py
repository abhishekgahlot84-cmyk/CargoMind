from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, Boolean, DateTime, Text
from sqlalchemy.orm import relationship

from app.database.connection import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    phone = Column(String(20))

    users = relationship("User", back_populates="company")
    trucks = relationship("Truck", back_populates="company")
    drivers = relationship("Driver", back_populates="company")
    orders = relationship("Order", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)

    company_id = Column(Integer, ForeignKey("companies.id"))

    company = relationship("Company", back_populates="users")


class Truck(Base):
    __tablename__ = "trucks"

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String(50), unique=True, nullable=False)
    capacity = Column(Integer, nullable=False)
    fuel_type = Column(String(30), nullable=False)
    fuel_efficiency = Column(Integer)
    status = Column(String(30), default="available")
    volume_capacity = Column(Float, default=80.0)
    max_speed_kmph = Column(Float, default=80.0)
    avg_speed_kmph = Column(Float, default=45.0)
    # New fields
    model = Column(String(100))
    year = Column(Integer)
    notes = Column(Text)

    company_id = Column(Integer, ForeignKey("companies.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    company = relationship("Company", back_populates="trucks")
    user = relationship("User")
    trips = relationship("Trip", back_populates="truck")
    maintenance_records = relationship(
        "Maintenance",
        back_populates="truck"
    )
    gps_records = relationship(
        "GPSTracking",
        back_populates="truck"
    )


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    license_category = Column(String(50), nullable=False)
    experience_years = Column(Integer, default=0)
    working_hours = Column(Integer, default=0)
    rest_hours = Column(Integer, default=0)
    status = Column(String(30), default="available")
    # New fields
    phone = Column(String(20))
    license_number = Column(String(50))
    notes = Column(Text)

    company_id = Column(Integer, ForeignKey("companies.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    company = relationship("Company", back_populates="drivers")
    user = relationship("User")
    trips = relationship("Trip", back_populates="driver")

    trip_assignments = relationship(
        "TripDriverAssignment",
        back_populates="driver",
        cascade="all, delete-orphan"
    )

    handovers_as_outgoing = relationship(
        "DriverHandover",
        foreign_keys="DriverHandover.outgoing_driver_id",
        back_populates="outgoing_driver",
        cascade="all, delete-orphan"
    )
    handovers_as_incoming = relationship(
        "DriverHandover",
        foreign_keys="DriverHandover.incoming_driver_id",
        back_populates="incoming_driver",
        cascade="all, delete-orphan"
    )


# Cargo categories
CARGO_CATEGORIES = [
    "Technology",
    "Organic Products",
    "Consumer Electronics",
    "Industrial Parts",
    "General Cargo",
    "Perishable Goods",
    "Fragile Goods",
    "Hazardous Materials",
    "Pharmaceuticals",
    "Other",
]

# Urgency levels
URGENCY_LEVELS = ["critical", "urgent", "normal", "scheduled"]


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    pickup_location = Column(String(255), nullable=False)
    delivery_location = Column(String(255), nullable=False)
    weight = Column(Integer, nullable=False)
    distance_km = Column(Integer, default=0)
    pickup_latitude = Column(String(50))
    pickup_longitude = Column(String(50))
    pickup_place_id = Column(String(255))

    delivery_latitude = Column(String(50))
    delivery_longitude = Column(String(50))
    delivery_place_id = Column(String(255))

    deadline = Column(String(50), nullable=False)
    status = Column(String(30), default="pending")

    # Smart shipment fields
    cargo_category = Column(String(100), default="General Cargo")
    pickup_time = Column(String(50))          # scheduled pickup datetime
    delivery_deadline = Column(String(50))    # delivery deadline datetime (same as deadline by default)
    earliest_pickup_time = Column(String(50))
    estimated_travel_hours = Column(Float)
    handling_time_hours = Column(Float, default=0.5)
    urgency = Column(String(30), default="normal")  # critical/urgent/normal/scheduled
    priority = Column(Integer, default=0)     # manual business priority (0-10)

    # Cargo handling attributes
    is_fragile = Column(Boolean, default=False)
    is_hazardous = Column(Boolean, default=False)
    is_perishable = Column(Boolean, default=False)
    requires_temperature_control = Column(Boolean, default=False)
    temperature_min_c = Column(Float)
    temperature_max_c = Column(Float)
    handling_instructions = Column(Text)
    volume_m3 = Column(Float)
    length = Column(Float, nullable=True)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    dimension_unit = Column(String(10), default="cm")
    package_count = Column(Integer, default=1)

    company_id = Column(Integer, ForeignKey("companies.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    company = relationship("Company", back_populates="orders")
    user = relationship("User")
    trips = relationship("Trip", back_populates="order")


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)

    truck_id = Column(Integer, ForeignKey("trucks.id"))
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    order_id = Column(Integer, ForeignKey("orders.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    distance = Column(Integer)
    estimated_time = Column(Integer)
    fuel_cost = Column(Integer)
    status = Column(String(30), default="planned")

    truck = relationship("Truck", back_populates="trips")
    driver = relationship("Driver", back_populates="trips")
    order = relationship("Order", back_populates="trips")
    user = relationship("User")

    daily_schedule = Column(JSON, nullable=True)
    planned_route = Column(JSON, nullable=True)
    start_time = Column(String(50), nullable=True)
    completed_at = Column(String(50), nullable=True)
    average_speed_kmph = Column(Float, default=45.0)

    driver_assignments = relationship(
        "TripDriverAssignment",
        back_populates="trip",
        cascade="all, delete-orphan"
    )

    handovers = relationship(
        "DriverHandover",
        back_populates="trip",
        cascade="all, delete-orphan"
    )


class Maintenance(Base):
    __tablename__ = "maintenance"

    id = Column(Integer, primary_key=True, index=True)

    truck_id = Column(Integer, ForeignKey("trucks.id"))

    service_date = Column(String(50), nullable=False)
    maintenance_type = Column(String(100), nullable=False)
    odometer = Column(Integer)
    engine_hours = Column(Integer)
    cost = Column(Integer)
    status = Column(String(30), default="completed")

    truck = relationship(
        "Truck",
        back_populates="maintenance_records"
    )


class GPSTracking(Base):
    __tablename__ = "gps_tracking"

    id = Column(Integer, primary_key=True, index=True)

    truck_id = Column(Integer, ForeignKey("trucks.id"))

    latitude = Column(String(50), nullable=False)
    longitude = Column(String(50), nullable=False)
    speed = Column(Integer, default=0)
    timestamp = Column(String(50), nullable=False)

    truck = relationship(
        "Truck",
        back_populates="gps_records"
    )


class TripDriverAssignment(Base):
    __tablename__ = "trip_driver_assignments"

    id = Column(Integer, primary_key=True, index=True)

    trip_id = Column(
        Integer,
        ForeignKey("trips.id"),
        nullable=False
    )

    driver_id = Column(
        Integer,
        ForeignKey("drivers.id"),
        nullable=False
    )

    segment_start_km = Column(Float, nullable=False)
    segment_end_km = Column(Float, nullable=False)

    start_time = Column(String(50), nullable=False)
    end_time = Column(String(50), nullable=False)

    status = Column(String(30), default="planned")

    trip = relationship(
        "Trip",
        back_populates="driver_assignments"
    )

    driver = relationship(
        "Driver",
        back_populates="trip_assignments"
    )


# Warehouse / Hub
class Hub(Base):
    __tablename__ = "hubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    hub_type = Column(String(50), default="warehouse")  # warehouse, distribution_hub, rest_stop, handover_hub
    address = Column(String(500))
    city = Column(String(100))
    state = Column(String(100))
    country = Column(String(100), default="India")
    latitude = Column(String(50))
    longitude = Column(String(50))
    place_id = Column(String(255))
    operational_status = Column(String(30), default="active")  # active, inactive, under_maintenance
    capacity_tons = Column(Float)
    available_facilities = Column(JSON)  # list of strings
    contact_name = Column(String(100))
    contact_phone = Column(String(20))
    notes = Column(Text)

    company_id = Column(Integer, ForeignKey("companies.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    handovers = relationship("DriverHandover", back_populates="hub")
    user = relationship("User")


# Driver Handover
class DriverHandover(Base):
    __tablename__ = "driver_handovers"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    hub_id = Column(Integer, ForeignKey("hubs.id"))
    outgoing_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    incoming_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id"))

    planned_handover_time = Column(String(50))
    actual_handover_time = Column(String(50))

    status = Column(String(30), default="planned")  # planned, confirmed, executed, cancelled
    outgoing_km = Column(Float)
    notes = Column(Text)

    trip = relationship("Trip", back_populates="handovers")
    hub = relationship("Hub", back_populates="handovers")
    outgoing_driver = relationship(
        "Driver",
        foreign_keys=[outgoing_driver_id],
        back_populates="handovers_as_outgoing"
    )
    incoming_driver = relationship(
        "Driver",
        foreign_keys=[incoming_driver_id],
        back_populates="handovers_as_incoming"
    )


# India Gazetteer Location Database
class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, index=True)
    ascii_name = Column(String(150), index=True)
    state = Column(String(100), index=True)
    country = Column(String(50), default="India")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    feature_code = Column(String(20), default="PPL")
    population = Column(Integer, default=0)
    popularity_score = Column(Integer, default=50)
    hub_type = Column(String(50), default="City")
    aliases = Column(JSON)  # list of strings: ["gwl", "gwalior"]
    place_id = Column(String(255), nullable=True)