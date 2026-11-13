from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.connection import get_db
from app.database.models import User
from app.routes.auth import get_current_user, require_admin
from app.security import hash_password


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    company_id: int

    model_config = ConfigDict(from_attributes=True)


class UserCreateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = "operator"
    company_id: Optional[int] = None


@router.post("/", response_model=dict)
def create_user(
    name: Optional[str] = None,
    email: Optional[str] = None,
    password: Optional[str] = None,
    role: Optional[str] = None,
    company_id: Optional[int] = None,
    payload: Optional[UserCreateRequest] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user within the authenticated admin's workspace.
    Derives company_id from current_user to prevent cross-workspace tampering.
    Hashes passwords with bcrypt.
    """
    u_name = (payload.name if payload else name or "").strip()
    u_email = (payload.email if payload else email or "").strip().lower()
    u_pass = (payload.password if payload else password or "").strip()
    u_role = (payload.role if payload else role or "operator").strip().lower()

    if not u_name or not u_email or not u_pass:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name, email, and password are required."
        )

    if len(u_pass) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    # Enforce workspace isolation: assign to current admin's company
    # Only system admin (role='admin' and company_id=1) may optionally assign to another company
    if current_user.role == "admin" and current_user.company_id == 1 and (company_id or (payload and payload.company_id)):
        target_company_id = payload.company_id if (payload and payload.company_id) else (company_id or 1)
    else:
        target_company_id = current_user.company_id

    existing_user = db.query(User).filter(User.email == u_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists."
        )

    user = User(
        name=u_name,
        email=u_email,
        password=hash_password(u_pass),
        role=u_role,
        company_id=target_company_id
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "User created successfully",
        "user": UserResponse.from_orm(user).dict()
    }


@router.get("/", response_model=List[UserResponse])
def get_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List users scoped to the authenticated user's company workspace.
    Explicit schema prevents leaking password hashes or internal fields.
    """
    if current_user.role == "admin" and current_user.company_id == 1:
        # System administrator can view all users
        users = db.query(User).all()
    else:
        # Workspace users only see colleagues in their own company
        users = db.query(User).filter(User.company_id == current_user.company_id).all()

    return [UserResponse.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve details of a single user within the same workspace."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Authorize workspace access
    is_sys_admin = current_user.role == "admin" and current_user.company_id == 1
    if not is_sys_admin and user.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this user record.")

    return UserResponse.from_orm(user)
