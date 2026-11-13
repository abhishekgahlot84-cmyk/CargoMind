import os
import re
from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import engine, Base, run_migrations
from app.security import validate_and_get_jwt_secret, is_production_environment
# Explicitly import all models so every table is registered in Base.metadata before create_all
from app.database.models import (  # noqa: F401
    Company,
    User,
    Truck,
    Driver,
    Order,
    Trip,
    Maintenance,
    GPSTracking,
    TripDriverAssignment,
    Hub,
    DriverHandover,
    Location,
    WellnessHistory,
    MaintenanceLog,
)
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

# Validate JWT_SECRET on startup (fails fast if missing/weak in production)
validate_and_get_jwt_secret()

app = FastAPI(
    title="CargoMind Fleet Intelligence API",
    description="Backend API for CargoMind AI-powered fleet and logistics intelligence.",
    version="2.0.0"
)

# CORS configuration: allow production Vercel frontend, preview deployments, and localhost development
allowed_origins = [
    "https://cargo-mind-eight.vercel.app",
    "https://cargo-mind.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

frontend_url_env = os.getenv("FRONTEND_URL", "").strip()
if frontend_url_env:
    for url in frontend_url_env.split(","):
        cleaned = url.strip().rstrip("/")
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://cargo-mind(-[a-zA-Z0-9-]+)?\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

# Global exception handler to guarantee CORS headers are present even on internal errors
@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    import traceback
    print(f"[Unhandled Server Error] {request.method} {request.url.path}: {exc}")
    traceback.print_exc()
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error occurred. Please contact system administrator."}
    )

# Create database tables and run versioned Alembic migrations
Base.metadata.create_all(bind=engine)
run_migrations()

# Ensure default company exists
try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id FROM companies WHERE id = 1")).first()
        if not result:
            conn.execute(text("INSERT INTO companies (id, name, email, phone) VALUES (1, 'Fleet Default Org', 'admin@fleetai.com', '+1234567890')"))
            if engine.dialect.name == "postgresql":
                try:
                    conn.execute(text("SELECT setval(pg_get_serial_sequence('companies', 'id'), coalesce(max(id), 1)) FROM companies"))
                except Exception:
                    pass
            conn.commit()
except Exception as e:
    print("[Startup] Notice while seeding default company:", e)

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
            "message": "Database connection successful",
            "dialect": engine.dialect.name
        }

    except Exception as e:
        safe_error = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", str(e))
        return {
            "message": "Database connection failed",
            "error": safe_error
        }