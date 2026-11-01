import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load local environment variables from .env if present (safely ignored in production)
load_dotenv()

Base = declarative_base()


def get_database_url() -> str:
    """
    Resolve the database URL with the following priority:
    1. DATABASE_URL environment variable (Render / Cloud production)
    2. Discrete DB_* environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
    3. SQLite local development fallback (sqlite:///./fleet_local.db)
    """
    raw_url = os.getenv("DATABASE_URL", "").strip()

    if raw_url:
        # Render supplies PostgreSQL URLs starting with 'postgres://'.
        # SQLAlchemy 1.4+ / 2.0 requires 'postgresql://' or 'postgresql+psycopg2://'.
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+psycopg2://"):
            raw_url = raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return raw_url

    # Check discrete DB_* environment variables if configured
    db_host = os.getenv("DB_HOST", "").strip()
    db_port = os.getenv("DB_PORT", "").strip()
    db_name = os.getenv("DB_NAME", "").strip()
    db_user = os.getenv("DB_USER", "").strip()
    db_password = os.getenv("DB_PASSWORD", "").strip()

    if db_host and db_port and db_name and db_user and db_password:
        return f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

    # Default local development SQLite database
    return "sqlite:///./fleet_local.db"


def init_engine():
    db_url = get_database_url()
    is_render = os.getenv("RENDER") == "true" or os.getenv("ENVIRONMENT") == "production"

    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False}
        )

    # PostgreSQL configuration
    postgres_connect_args = {
        "connect_timeout": 10
    }

    # In Render production, connect directly to PostgreSQL with pool resilience
    if is_render:
        return create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            connect_args=postgres_connect_args
        )

    # In local development: verify that remote PostgreSQL is reachable before binding.
    # If the user has a Render internal hostname (e.g. dpg-xxx-a) or an unreachable local Postgres,
    # safely fall back to local SQLite so developer workflow does not crash.
    try:
        test_engine = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 3}
        )
        with test_engine.connect() as conn:
            pass
        return test_engine
    except Exception as e:
        safe_msg = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", str(e))
        first_line = safe_msg.splitlines()[0] if safe_msg else "Connection failed"
        print(f"[Database] Local notice: PostgreSQL not reachable ({first_line}). Using local SQLite fallback.")
        return create_engine(
            "sqlite:///./fleet_local.db",
            connect_args={"check_same_thread": False}
        )


engine = init_engine()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
