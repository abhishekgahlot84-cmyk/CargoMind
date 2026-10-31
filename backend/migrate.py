"""
Migration script: Add new columns to existing SQLite tables for CargoMind v2.
Run this ONCE to migrate the existing fleet_local.db.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "fleet_local.db")


def column_exists(cursor, table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    cols = {row[1] for row in cursor.fetchall()}
    return column in cols


def add_column_if_missing(cursor, table, column, col_type, default=None):
    if not column_exists(cursor, table, column):
        if default is not None:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type} DEFAULT {default}")
        else:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        print(f"  Added column: {table}.{column}")
    else:
        print(f"  Already exists: {table}.{column}")


def run_migration():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Starting CargoMind v2 migration...")

    # ---- trucks ----
    print("\n[trucks]")
    add_column_if_missing(cursor, "trucks", "model", "VARCHAR(100)")
    add_column_if_missing(cursor, "trucks", "year", "INTEGER")
    add_column_if_missing(cursor, "trucks", "notes", "TEXT")
    add_column_if_missing(cursor, "trucks", "mileage_kmpl", "REAL", default="10.0")
    add_column_if_missing(cursor, "trucks", "trips_since_service", "INTEGER", default="0")
    add_column_if_missing(cursor, "trucks", "km_since_service", "REAL", default="0.0")
    add_column_if_missing(cursor, "trucks", "last_service_date", "VARCHAR(50)")

    # ---- drivers ----
    print("\n[drivers]")
    add_column_if_missing(cursor, "drivers", "phone", "VARCHAR(20)")
    add_column_if_missing(cursor, "drivers", "license_number", "VARCHAR(50)")
    add_column_if_missing(cursor, "drivers", "notes", "TEXT")
    add_column_if_missing(cursor, "drivers", "wellness_score", "INTEGER", default="85")
    add_column_if_missing(cursor, "drivers", "last_rest_start", "VARCHAR(50)")
    add_column_if_missing(cursor, "drivers", "hours_driven_24h", "REAL", default="0.0")
    add_column_if_missing(cursor, "drivers", "hours_driven_7d", "REAL", default="0.0")
    add_column_if_missing(cursor, "drivers", "night_driving_hours", "REAL", default="0.0")
    add_column_if_missing(cursor, "drivers", "consecutive_working_days", "INTEGER", default="0")

    # ---- orders ----
    print("\n[orders]")
    add_column_if_missing(cursor, "orders", "pickup_place_id", "VARCHAR(255)")
    add_column_if_missing(cursor, "orders", "delivery_place_id", "VARCHAR(255)")
    add_column_if_missing(cursor, "orders", "cargo_category", "VARCHAR(100)", default="'General Cargo'")
    add_column_if_missing(cursor, "orders", "pickup_time", "VARCHAR(50)")
    add_column_if_missing(cursor, "orders", "delivery_deadline", "VARCHAR(50)")
    add_column_if_missing(cursor, "orders", "earliest_pickup_time", "VARCHAR(50)")
    add_column_if_missing(cursor, "orders", "estimated_travel_hours", "REAL")
    add_column_if_missing(cursor, "orders", "handling_time_hours", "REAL", default="0.5")
    add_column_if_missing(cursor, "orders", "urgency", "VARCHAR(30)", default="'normal'")
    add_column_if_missing(cursor, "orders", "priority", "INTEGER", default="0")
    add_column_if_missing(cursor, "orders", "is_fragile", "BOOLEAN", default="0")
    add_column_if_missing(cursor, "orders", "is_hazardous", "BOOLEAN", default="0")
    add_column_if_missing(cursor, "orders", "is_perishable", "BOOLEAN", default="0")
    add_column_if_missing(cursor, "orders", "requires_temperature_control", "BOOLEAN", default="0")
    add_column_if_missing(cursor, "orders", "temperature_min_c", "REAL")
    add_column_if_missing(cursor, "orders", "temperature_max_c", "REAL")
    add_column_if_missing(cursor, "orders", "volume_m3", "REAL")
    add_column_if_missing(cursor, "orders", "length", "REAL")
    add_column_if_missing(cursor, "orders", "width", "REAL")
    add_column_if_missing(cursor, "orders", "height", "REAL")
    add_column_if_missing(cursor, "orders", "dimension_unit", "VARCHAR(10)", default="'cm'")
    add_column_if_missing(cursor, "orders", "package_count", "INTEGER", default="1")

    # ---- trips ----
    print("\n[trips]")
    add_column_if_missing(cursor, "trips", "start_time", "VARCHAR(50)")
    add_column_if_missing(cursor, "trips", "average_speed_kmph", "REAL", default="45.0")

    # ---- hubs (create if not exists) ----
    print("\n[hubs]")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hubs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(150) NOT NULL,
            hub_type VARCHAR(50) DEFAULT 'warehouse',
            address VARCHAR(500),
            city VARCHAR(100),
            state VARCHAR(100),
            country VARCHAR(100) DEFAULT 'India',
            latitude VARCHAR(50),
            longitude VARCHAR(50),
            place_id VARCHAR(255),
            operational_status VARCHAR(30) DEFAULT 'active',
            capacity_tons REAL,
            available_facilities JSON,
            contact_name VARCHAR(100),
            contact_phone VARCHAR(20),
            notes TEXT,
            company_id INTEGER REFERENCES companies(id),
            user_id INTEGER REFERENCES users(id)
        )
    """)
    add_column_if_missing(cursor, "hubs", "user_id", "INTEGER")
    print("  hubs table ready")

    # ---- driver_handovers (create if not exists) ----
    print("\n[driver_handovers]")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS driver_handovers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id),
            hub_id INTEGER REFERENCES hubs(id),
            outgoing_driver_id INTEGER NOT NULL REFERENCES drivers(id),
            incoming_driver_id INTEGER NOT NULL REFERENCES drivers(id),
            confirmed_by_user_id INTEGER REFERENCES users(id),
            planned_handover_time VARCHAR(50),
            actual_handover_time VARCHAR(50),
            status VARCHAR(30) DEFAULT 'planned',
            outgoing_km REAL,
            notes TEXT
        )
    """)
    print("  driver_handovers table ready")

    # ---- wellness_history (create if not exists) ----
    print("\n[wellness_history]")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS wellness_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            score INTEGER NOT NULL,
            band VARCHAR(20),
            computed_at VARCHAR(50) NOT NULL,
            breakdown JSON
        )
    """)
    print("  wellness_history table ready")

    # ---- maintenance_log (create if not exists) ----
    print("\n[maintenance_log]")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS maintenance_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            truck_id INTEGER NOT NULL REFERENCES trucks(id),
            action VARCHAR(50) NOT NULL,
            date VARCHAR(50) NOT NULL,
            maintenance_type VARCHAR(100),
            notes TEXT,
            cost REAL,
            trips_at_time INTEGER,
            km_at_time REAL
        )
    """)
    print("  maintenance_log table ready")

    conn.commit()
    conn.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    run_migration()
