import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base


def is_production_environment() -> bool:
    """
    Check if running in a cloud/production environment like Render.
    Render sets RENDER=true, RENDER_SERVICE_ID, RENDER_SERVICE_NAME, etc.
    """
    render_flag = os.getenv("RENDER", "").lower() in ("true", "1")
    service_id = bool(os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_SERVICE_NAME"))
    env_flag = os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
    return render_flag or service_id or env_flag


# Only load local .env if NOT running in cloud production.
# On Render, environment variables are injected directly by the platform and must never be overridden.
if not is_production_environment():
    load_dotenv(override=False)

Base = declarative_base()


def get_database_url_and_source():
    """
    Resolve the database URL with the following priority:
    1. DATABASE_URL environment variable (Render / Cloud production)
    2. Discrete DB_* environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
    3. SQLite local development fallback (sqlite:///./fleet_local.db)

    In production (Render), DATABASE_URL is strictly required. Localhost and SQLite
    fallbacks are explicitly forbidden to prevent silent misconfiguration.
    """
    is_prod = is_production_environment()

    # 1. Primary: DATABASE_URL (and standard cloud variants)
    raw_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_INTERNAL_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip().strip("'\"")

    if raw_url:
        source = "DATABASE_URL environment variable"
        normalized = raw_url

        # Render supplies PostgreSQL URLs starting with 'postgres://'.
        # SQLAlchemy 1.4+ / 2.0 requires 'postgresql://' or 'postgresql+psycopg2://'.
        if normalized.startswith("postgres://"):
            normalized = normalized.replace("postgres://", "postgresql+psycopg2://", 1)
        elif normalized.startswith("postgresql://") and not normalized.startswith("postgresql+psycopg2://"):
            normalized = normalized.replace("postgresql://", "postgresql+psycopg2://", 1)

        # In production, guard against accidental localhost configuration
        if is_prod:
            try:
                parsed = make_url(normalized)
                if parsed.host in ("localhost", "127.0.0.1", "::1"):
                    raise RuntimeError(
                        f"[Database] CRITICAL: DATABASE_URL is configured with localhost host '{parsed.host}'. "
                        "Render Web Services cannot connect to localhost. "
                        "Please configure DATABASE_URL with your Render PostgreSQL hostname (e.g. dpg-xxx-a)."
                    )
            except Exception as e:
                if isinstance(e, RuntimeError):
                    raise
                pass

        return normalized, source

    # Production on Render MUST have DATABASE_URL; never fall back to localhost or SQLite!
    if is_prod:
        raise RuntimeError(
            "[Database] CRITICAL: DATABASE_URL environment variable is missing on Render. "
            "Production requires a PostgreSQL DATABASE_URL. "
            "Please configure DATABASE_URL in your Render Web Service dashboard."
        )

    # 2. Check discrete DB_* environment variables (local development only)
    db_host = os.getenv("DB_HOST", "").strip()
    db_port = os.getenv("DB_PORT", "").strip()
    db_name = os.getenv("DB_NAME", "").strip()
    db_user = os.getenv("DB_USER", "").strip()
    db_password = os.getenv("DB_PASSWORD", "").strip()

    if db_host and db_port and db_name and db_user and db_password:
        return (
            f"postgresql+psycopg2://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}",
            "Discrete DB_* environment variables",
        )

    # 3. Default local development SQLite database
    return "sqlite:///./fleet_local.db", "Local SQLite development fallback"


def log_safe_diagnostics(db_url: str, source: str):
    """
    Log safe diagnostics required for verifying configuration in Render logs.
    Never exposes username, password, or sensitive tokens.
    """
    has_db_url = bool(
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_INTERNAL_URL")
        or os.getenv("POSTGRES_URL")
    )

    try:
        parsed = make_url(db_url)
        host = parsed.host if parsed.host else "(local file / SQLite)"
        dialect = parsed.get_backend_name()
        driver = parsed.get_driver_name()
    except Exception:
        host = "unknown"
        dialect = "unknown"
        driver = "unknown"

    print("==================================================")
    print("[Database Configuration Diagnostics]")
    print(f"  DATABASE_URL configured : {has_db_url}")
    print(f"  Configuration source    : {source}")
    print(f"  Selected database host  : {host}")
    print(f"  SQLAlchemy dialect      : {dialect}")
    print(f"  SQLAlchemy driver       : {driver}")
    print("==================================================")


def init_engine():
    db_url, source = get_database_url_and_source()
    is_prod = is_production_environment()

    # Emit safe diagnostics to logs
    log_safe_diagnostics(db_url, source)

    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False}
        )

    # PostgreSQL configuration
    postgres_connect_args = {
        "connect_timeout": 10
    }

    # In production on Render: connect directly to PostgreSQL with pool resilience
    if is_prod:
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

# Safe auto-migration for newly added model columns
try:
    from sqlalchemy import text
    with engine.connect() as _conn:
        if engine.dialect.name == "sqlite":
            _tbl = _conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='drivers';")).first()
            if _tbl:
                _cols = [r[1] for r in _conn.execute(text("PRAGMA table_info(drivers);")).fetchall()]
                if "rest_until" not in _cols:
                    _conn.execute(text("ALTER TABLE drivers ADD COLUMN rest_until VARCHAR(50);"))
                    _conn.commit()
        elif engine.dialect.name == "postgresql":
            _conn.execute(text("ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rest_until VARCHAR(50);"))
            try:
                _conn.execute(text("ALTER TABLE orders ALTER COLUMN distance_km TYPE DOUBLE PRECISION;"))
                _conn.execute(text("ALTER TABLE trips ALTER COLUMN distance TYPE DOUBLE PRECISION;"))
            except Exception:
                pass
            _conn.commit()
except Exception:
    pass

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
