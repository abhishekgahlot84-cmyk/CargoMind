from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import engine, Base
from app.database import models
from app.routes import (
    auth,
    companies,
    users,
    trucks,
    drivers,
    orders,
    trips,
    maintenance,
    gps,
    optimization,
    dashboard,
    hubs,
    handovers,
    locations,
)

app = FastAPI(
    title="CargoMind Fleet Intelligence API",
    description="Backend API for CargoMind AI-powered fleet and logistics intelligence.",
    version="2.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create database tables (adds new columns via SQLAlchemy for SQLite)
Base.metadata.create_all(bind=engine)

# Ensure default company exists (prevents foreign key errors when adding truck/driver)
try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id FROM companies WHERE id = 1")).first()
        if not result:
            conn.execute(text("INSERT INTO companies (id, name, email, phone) VALUES (1, 'Fleet Default Org', 'admin@fleetai.com', '+1234567890')"))
            conn.commit()
except Exception as e:
    print("Default company seeding notice:", e)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(users.router)
app.include_router(trucks.router)
app.include_router(drivers.router)
app.include_router(orders.router)
app.include_router(trips.router)
app.include_router(maintenance.router)
app.include_router(gps.router)
app.include_router(optimization.router)
app.include_router(dashboard.router)
app.include_router(hubs.router)
app.include_router(handovers.router)
app.include_router(locations.router)


@app.get("/", tags=["System"])
def home():
    return {
        "message": "CargoMind Fleet Intelligence API is running",
        "version": "2.0.0"
    }


@app.get("/test-db", tags=["System"])
def test_database():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "message": "Database connection successful"
        }

    except Exception as e:
        return {
            "message": "Database connection failed",
            "error": str(e)
        }