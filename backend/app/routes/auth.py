import os
import time
import hmac
import hashlib
import base64
import json
import requests
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import User, Company

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

JWT_SECRET = os.getenv("JWT_SECRET", "cargomind-fleet-intelligence-secret-key-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_SECONDS = 7 * 24 * 3600  # 7 days


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def base64url_decode(data_str: str) -> bytes:
    padding = "=" * (4 - (len(data_str) % 4))
    return base64.urlsafe_b64decode(data_str + padding)


def create_access_token(user_id: int, email: str, role: str) -> str:
    """Create a standard HS256 signed JWT token."""
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + JWT_EXPIRATION_SECONDS
    }

    header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    header_encoded = base64url_encode(header_bytes)
    payload_encoded = base64url_encode(payload_bytes)

    signing_input = f"{header_encoded}.{payload_encoded}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_encoded = base64url_encode(signature)

    return f"{header_encoded}.{payload_encoded}.{signature_encoded}"


def verify_access_token(token: str) -> dict:
    """Verify standard HS256 signed JWT token."""
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token structure"
        )

    header_encoded, payload_encoded, signature_encoded = parts
    signing_input = f"{header_encoded}.{payload_encoded}".encode("utf-8")
    expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    expected_sig_encoded = base64url_encode(expected_sig)

    if not hmac.compare_digest(signature_encoded, expected_sig_encoded):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token signature"
        )

    try:
        payload_bytes = base64url_decode(payload_encoded)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not parse token payload"
        )

    if "exp" in payload and int(time.time()) > payload["exp"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )

    return payload


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """FastAPI dependency to extract and validate the authenticated user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication credentials."
        )

    token = authorization.split(" ")[1]
    payload = verify_access_token(token)

    user_id = int(payload.get("sub", 0))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token does not exist."
        )

    return user


def get_current_user_optional(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency: Returns the authenticated User if a valid Bearer token is provided.
    If no token is provided or invalid, falls back to the default demo admin user (company_id=1).
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            payload = verify_access_token(token)
            user_id = int(payload.get("sub", 0))
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                return user
        except Exception:
            pass

    # Fallback to default admin or first user
    fallback = db.query(User).filter(User.id == 1).first()
    if not fallback:
        company = db.query(Company).filter(Company.id == 1).first()
        if not company:
            company = Company(id=1, name="CargoMind Fleet Org", email="admin@cargomind.ai", phone="+1234567890")
            db.add(company)
            db.commit()
            db.refresh(company)
        fallback = User(
            id=1,
            name="Fleet Administrator",
            email="admin@cargomind.ai",
            password="admin",
            role="admin",
            company_id=1
        )
    return fallback


def seed_starter_fleet_for_company(db: Session, company_id: int, user_name: str, user_id: Optional[int] = None):
    """Seed initial sample trucks, drivers, and orders for a newly created company/user."""
    from app.database.models import Truck, Driver, Order, Hub

    # Only seed if company has no trucks yet
    existing_trucks = db.query(Truck).filter(Truck.company_id == company_id).first()
    if existing_trucks:
        return

    # 1. Trucks
    trucks_data = [
        {"reg": f"CM{company_id}-DL-01-101", "cap": 16000, "fuel": "Diesel", "eff": 4, "model": "Tata Signa 4825.TK", "year": 2024},
        {"reg": f"CM{company_id}-MH-02-202", "cap": 12000, "fuel": "Diesel", "eff": 5, "model": "Ashok Leyland 2820", "year": 2023},
        {"reg": f"CM{company_id}-KA-03-303", "cap": 8000, "fuel": "CNG", "eff": 6, "model": "BharatBenz 1617R", "year": 2024},
    ]
    for td in trucks_data:
        truck = Truck(
            registration_number=td["reg"],
            capacity=td["cap"],
            fuel_type=td["fuel"],
            fuel_efficiency=td["eff"],
            model=td["model"],
            year=td["year"],
            status="available",
            volume_capacity=80.0,
            company_id=company_id,
            user_id=user_id
        )
        db.add(truck)

    # 2. Drivers
    drivers_data = [
        {"name": f"Rajesh Kumar ({user_name.split()[0]})", "lic": "Heavy Rigid", "lic_num": f"DL-01-202{company_id}001", "exp": 8, "phone": "+91 98765 00001"},
        {"name": f"Amit Sharma ({user_name.split()[0]})", "lic": "Heavy Combination", "lic_num": f"MH-02-202{company_id}002", "exp": 6, "phone": "+91 98765 00002"},
        {"name": f"Sunil Verma ({user_name.split()[0]})", "lic": "Medium Rigid", "lic_num": f"KA-03-202{company_id}003", "exp": 5, "phone": "+91 98765 00003"},
    ]
    for dd in drivers_data:
        driver = Driver(
            name=dd["name"],
            license_category=dd["lic"],
            license_number=dd["lic_num"],
            experience_years=dd["exp"],
            phone=dd["phone"],
            working_hours=0,
            rest_hours=10,
            status="available",
            company_id=company_id,
            user_id=user_id
        )
        db.add(driver)

    # 3. Hub
    hub = Hub(
        name=f"{user_name.split()[0]}'s Central Hub",
        hub_type="distribution_hub",
        address="Sector 18, Industrial Logistics Zone",
        city="Delhi",
        state="Delhi",
        country="India",
        operational_status="active",
        capacity_tons=500.0,
        company_id=company_id,
        user_id=user_id
    )
    db.add(hub)

    # 4. Orders
    orders_data = [
        {
            "pickup": "Delhi Hub, NCR", "delivery": "Jaipur Logistics Hub",
            "weight": 5200, "distance_km": 280, "deadline": "2026-10-30",
            "cargo": "Consumer Electronics", "urgency": "urgent", "priority": 8
        },
        {
            "pickup": "Mumbai Terminal 2", "delivery": "Pune Industrial Park",
            "weight": 7400, "distance_km": 150, "deadline": "2026-10-29",
            "cargo": "Industrial Parts", "urgency": "normal", "priority": 5
        },
        {
            "pickup": "Bengaluru Tech Park", "delivery": "Chennai Port Road",
            "weight": 6100, "distance_km": 345, "deadline": "2026-10-28",
            "cargo": "Technology", "urgency": "critical", "priority": 9
        },
        {
            "pickup": "Ahmedabad Port Logistics", "delivery": "Surat Diamond City",
            "weight": 4300, "distance_km": 260, "deadline": "2026-11-01",
            "cargo": "General Cargo", "urgency": "scheduled", "priority": 4
        }
    ]
    for od in orders_data:
        order = Order(
            pickup_location=od["pickup"],
            delivery_location=od["delivery"],
            weight=od["weight"],
            distance_km=od["distance_km"],
            deadline=od["deadline"],
            cargo_category=od["cargo"],
            urgency=od["urgency"],
            priority=od["priority"],
            status="pending",
            company_id=company_id,
            user_id=user_id
        )
        db.add(order)

    db.commit()


class GoogleAuthRequest(BaseModel):
    credential: str


class StandardLoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "operator"


@router.post("/google")
def authenticate_google(
    request: GoogleAuthRequest,
    db: Session = Depends(get_db)
):
    """
    Validates a Google ID token from Google Identity Services.
    Creates or looks up the User with dedicated company workspace per user ID.
    Returns a secure JWT access token.
    """
    if not request.credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Google OAuth credential."
        )

    # Validate the ID token with Google's public tokeninfo endpoint
    try:
        response = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": request.credential},
            timeout=10
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Google token verification failed: {response.text}"
            )
        id_info = response.json()
    except requests.RequestException as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not contact Google authentication server: {str(e)}"
        )

    email = id_info.get("email", "").strip().lower()
    name = id_info.get("name") or email.split("@")[0]

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide a verified email."
        )

    # Check if user already exists
    user = db.query(User).filter(User.email == email).first()
    is_new_user = False

    if not user:
        is_new_user = True
        # If admin email, attach to default company 1
        if email in ("admin@cargomind.ai", "admin@fleetai.com"):
            company = db.query(Company).filter(Company.id == 1).first()
            if not company:
                company = Company(id=1, name="CargoMind Fleet Org", email=email, phone="+1234567890")
                db.add(company)
                db.flush()
            comp_id = company.id
        else:
            # Create a separate Company specifically for this user ID
            company = db.query(Company).filter(Company.email == email).first()
            if not company:
                company = Company(
                    name=f"{name}'s Fleet Workspace",
                    email=email,
                    phone=""
                )
                db.add(company)
                db.flush()
            comp_id = company.id

        user = User(
            name=name,
            email=email,
            password="[google_oauth_authenticated]",
            role="operator",
            company_id=comp_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Seed starter fleet for new non-admin user
        if comp_id != 1:
            seed_starter_fleet_for_company(db, comp_id, name, user_id=user.id)
    else:
        # User already exists - verify they have their own company if non-admin
        if email not in ("admin@cargomind.ai", "admin@fleetai.com") and user.company_id == 1:
            company = db.query(Company).filter(Company.email == email).first()
            if not company:
                company = Company(
                    name=f"{name}'s Fleet Workspace",
                    email=email,
                    phone=""
                )
                db.add(company)
                db.flush()
            user.company_id = company.id
            db.commit()
            db.refresh(user)
            # Ensure they have their starter fleet
            seed_starter_fleet_for_company(db, user.company_id, name, user_id=user.id)

    token = create_access_token(user.id, user.email, user.role)
    comp_record = db.query(Company).filter(Company.id == user.company_id).first()
    comp_name = comp_record.name if comp_record else f"Workspace #{user.company_id}"

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company_id": user.company_id,
            "company_name": comp_name,
            "picture": id_info.get("picture")
        }
    }


@router.post("/login")
def login_standard(
    request: StandardLoginRequest,
    db: Session = Depends(get_db)
):
    """
    Standard email and password login.
    Supports existing registered users or provides automatic seeding for demo administrator.
    """
    email = request.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # If demo admin user is logging in and not yet in database, seed it automatically
    if not user and email in ("admin@cargomind.ai", "admin@fleetai.com"):
        company = db.query(Company).filter(Company.id == 1).first()
        if not company:
            company = Company(id=1, name="CargoMind Fleet Org", email="admin@cargomind.ai", phone="+1234567890")
            db.add(company)
            db.flush()

        user = User(
            name="Fleet Administrator",
            email=email,
            password=request.password,
            role="admin",
            company_id=company.id
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user or (user.password != request.password and user.password != "[google_oauth_authenticated]"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = create_access_token(user.id, user.email, user.role)
    comp_record = db.query(Company).filter(Company.id == user.company_id).first()
    comp_name = comp_record.name if comp_record else f"Workspace #{user.company_id}"

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company_id": user.company_id,
            "company_name": comp_name
        }
    }


@router.post("/register")
def register_user(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Register a new user account with email and password."""
    email = request.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please sign in."
        )

    clean_name = request.name.strip() or email.split("@")[0]

    if email in ("admin@cargomind.ai", "admin@fleetai.com"):
        company = db.query(Company).filter(Company.id == 1).first()
        if not company:
            company = Company(id=1, name="CargoMind Fleet Org", email="admin@cargomind.ai", phone="+1234567890")
            db.add(company)
            db.flush()
        comp_id = company.id
    else:
        company = db.query(Company).filter(Company.email == email).first()
        if not company:
            company = Company(
                name=f"{clean_name}'s Fleet Workspace",
                email=email,
                phone=""
            )
            db.add(company)
            db.flush()
        comp_id = company.id

    user = User(
        name=clean_name,
        email=email,
        password=request.password,
        role=request.role or "operator",
        company_id=comp_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed starter fleet for newly registered company
    if comp_id != 1:
        seed_starter_fleet_for_company(db, comp_id, clean_name, user_id=user.id)

    token = create_access_token(user.id, user.email, user.role)
    comp_record = db.query(Company).filter(Company.id == user.company_id).first()
    comp_name = comp_record.name if comp_record else f"Workspace #{user.company_id}"

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company_id": user.company_id,
            "company_name": comp_name
        }
    }


@router.post("/seed-starter-fleet")
def seed_my_fleet(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Seed starter fleet (trucks, drivers, orders, hub) for the authenticated user's workspace."""
    seed_starter_fleet_for_company(db, current_user.company_id, current_user.name, user_id=current_user.id)
    return {
        "message": f"Starter fleet seeded successfully for workspace #{current_user.company_id}",
        "company_id": current_user.company_id
    }


@router.get("/me")
def get_authenticated_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve the currently authenticated user session."""
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "company_id": current_user.company_id,
        "company_name": company.name if company else f"Workspace #{current_user.company_id}"
    }


class ProfileUpdateRequest(BaseModel):
    name: str
    company_name: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.put("/profile")
def update_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    current_user.name = clean_name
    if req.company_name and req.company_name.strip():
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        if company:
            company.name = req.company_name.strip()
    db.commit()
    db.refresh(current_user)
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    return {
        "message": "Profile updated successfully",
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
            "company_id": current_user.company_id,
            "company_name": company.name if company else f"Workspace #{current_user.company_id}"
        }
    }


@router.put("/change-password")
def change_password(
    req: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.password == "[google_oauth_authenticated]":
        raise HTTPException(
            status_code=400,
            detail="Accounts created via Google Sign-In manage passwords through their Google Account."
        )
    if current_user.password != req.current_password:
        raise HTTPException(status_code=400, detail="Incorrect current password.")
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters.")
    current_user.password = req.new_password
    db.commit()
    return {"message": "Password updated successfully."}


@router.get("/config-status")
def get_config_status(
    db: Session = Depends(get_db)
):
    """
    Check status of system APIs and database.
    Never exposes API keys or secrets.
    """
    from app.optimization.distance_service import is_google_routes_configured
    from ortools.linear_solver import pywraplp
    from ortools.constraint_solver import pywrapcp
    from sqlalchemy import text

    scip_ok = False
    try:
        solver = pywraplp.Solver.CreateSolver("SCIP")
        scip_ok = solver is not None
    except Exception:
        pass

    vrp_ok = False
    try:
        mgr = pywrapcp.RoutingIndexManager(2, 1, 0)
        model = pywrapcp.RoutingModel(mgr)
        vrp_ok = model is not None
    except Exception:
        pass

    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    return {
        "google_routes_api": {
            "status": "configured" if is_google_routes_configured() else "missing",
            "description": "Server-side Google Routes API (Directions v2)"
        },
        "or_tools_scip": {
            "status": "available" if scip_ok else "unavailable",
            "backend": "SCIP Mixed-Integer Linear Solver"
        },
        "or_tools_vrp": {
            "status": "available" if vrp_ok else "unavailable",
            "backend": "Constraint Programming VRP Routing Engine"
        },
        "database": {
            "status": "operational" if db_ok else "error",
            "engine": "SQLite (fleet_local.db)"
        }
    }
