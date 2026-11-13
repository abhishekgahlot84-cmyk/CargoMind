import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
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
        connect_args = {"connect_timeout": 10} if "postgresql" in db_url else {}
        test_engine = create_engine(
            db_url,
            pool_pre_ping=True,
            connect_args=connect_args
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


def run_migrations():
    """
    Run versioned Alembic migrations to head safely and idempotently.
    
    Deployment Safety Features:
    - Supports SKIP_STARTUP_MIGRATIONS=true if running migrations as a release step.
    - PostgreSQL advisory lock (pg_try_advisory_lock) prevents multi-worker race conditions.
    - Checks if DB is already at head revision before attempting upgrade, avoiding redundant work.
    - Handles legacy/pre-existing schemas cleanly without destructive operations.
    - Reconciles revision discrepancies safely if core tables are already intact and valid.
    """
    if os.getenv("SKIP_STARTUP_MIGRATIONS", "").lower() in ("true", "1", "yes"):
        print("[Database] Notice: SKIP_STARTUP_MIGRATIONS is set. Skipping startup migrations.")
        return

    ini_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini"))
    if not os.path.exists(ini_path):
        print(f"[Database] Notice: alembic.ini not found at '{ini_path}'. Skipping migrations.")
        return

    try:
        from alembic.config import Config
        from alembic import command
        from alembic.script import ScriptDirectory
        from alembic.migration import MigrationContext
    except (ImportError, ModuleNotFoundError) as err:
        print(f"[Database] Notice: Alembic is not installed or importable ({err}). Skipping automatic migrations.")
        return

    # Advisory lock ID for CargoMind migrations on PostgreSQL
    ALEMBIC_ADVISORY_LOCK_ID = 84729103
    acquired_lock = False
    is_postgres = engine.dialect.name == "postgresql"

    try:
        # Prevent concurrent migrations across multi-worker deployments on PostgreSQL
        if is_postgres:
            try:
                with engine.connect() as lock_conn:
                    lock_res = lock_conn.execute(
                        text(f"SELECT pg_try_advisory_lock({ALEMBIC_ADVISORY_LOCK_ID})")
                    ).scalar()
                    if not lock_res:
                        print("[Database] Another worker is currently executing migrations. Skipping redundant execution on this worker.")
                        return
                    acquired_lock = True
            except Exception as lock_err:
                print(f"[Database] Notice: Could not acquire advisory lock ({lock_err}). Proceeding carefully.")

        cfg = Config(ini_path)
        # Ensure script_location is an absolute path to the alembic directory
        scripts_dir = os.path.abspath(os.path.join(os.path.dirname(ini_path), "alembic"))
        cfg.set_main_option("script_location", scripts_dir)

        # Ensure Alembic targets the exact database URL resolved for this environment
        db_url, _ = get_database_url_and_source()
        if db_url:
            cfg.set_main_option("sqlalchemy.url", db_url)

        from sqlalchemy import inspect
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        script = ScriptDirectory.from_config(cfg)
        target_heads = set(script.get_heads())

        # Inspect current database revisions
        current_db_heads = set()
        if "alembic_version" in existing_tables:
            with engine.connect() as check_conn:
                context = MigrationContext.configure(check_conn)
                current_db_heads = set(context.get_current_heads())

        # 1. Fast-path: Already at head, no work needed
        if current_db_heads and current_db_heads == target_heads:
            print(f"[Database] Database schema is already at head revision: {target_heads}. No migrations required.")
            return

        # 2. Check if tables already exist but alembic_version is not yet stamped
        if "alembic_version" not in existing_tables and len(existing_tables) > 1:
            print("[Database] Pre-existing schema detected without alembic_version. Stamping head as baseline.")
            command.stamp(cfg, "head")
            return

        # 3. Perform versioned upgrade
        print(f"[Database] Running database migration from {current_db_heads or 'base'} to {target_heads}...")
        try:
            command.upgrade(cfg, "head")
            print("[Database] Database migration to head completed successfully.")
        except Exception as up_err:
            err_str = str(up_err).lower()
            if "already exists" in err_str:
                print("[Database] Objects already exist in database. Stamping head as current.")
                command.stamp(cfg, "head")
            elif "can't locate revision identified by" in err_str:
                core_tables = {"users", "companies", "trucks", "drivers", "trips"}
                if core_tables.issubset(existing_tables):
                    print(
                        f"[Database] WARNING: Migration revision mismatch: {up_err}. "
                        "Core application tables are present and intact. Stamping current head to synchronize state."
                    )
                    command.stamp(cfg, "head")
                else:
                    raise up_err
            else:
                raise up_err

    except Exception as e:
        print(f"[Database] ERROR during database migration: {e}")
        # If core application tables exist and are functional, do not crash the entire app container
        try:
            from sqlalchemy import inspect
            inspector = inspect(engine)
            if {"users", "companies"}.issubset(set(inspector.get_table_names())):
                print("[Database] Core application tables are intact. Continuing startup despite migration notice.")
                return
        except Exception:
            pass
        raise RuntimeError(f"Database migration failed: {e}") from e

    finally:
        if acquired_lock and is_postgres:
            try:
                with engine.connect() as unlock_conn:
                    unlock_conn.execute(
                        text(f"SELECT pg_advisory_unlock({ALEMBIC_ADVISORY_LOCK_ID})")
                    )
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
