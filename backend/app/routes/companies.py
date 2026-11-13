from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database.connection import get_db
from app.database.models import Company, User
from app.routes.auth import get_current_user, require_admin


router = APIRouter(
    prefix="/companies",
    tags=["Companies"]
)


class CompanyResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CompanyCreateRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None


@router.post("/", response_model=dict)
def create_company(
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    payload: Optional[CompanyCreateRequest] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new company workspace. Restricted to administrators.
    """
    c_name = (payload.name if payload else name or "").strip()
    c_email = (payload.email if payload else email or "").strip().lower()
    c_phone = (payload.phone if payload else phone or "").strip() if (payload and payload.phone) or phone else None

    if not c_name or not c_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company name and email are required."
        )

    existing_company = db.query(Company).filter(Company.email == c_email).first()
    if existing_company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company with this email already exists"
        )

    company = Company(
        name=c_name,
        email=c_email,
        phone=c_phone
    )

    db.add(company)
    db.commit()
    db.refresh(company)

    return {
        "message": "Company created successfully",
        "company": CompanyResponse.from_orm(company).dict()
    }


@router.get("/", response_model=List[CompanyResponse])
def get_companies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve companies.
    Standard operators and workspace admins see only their own company workspace.
    System administrators (role='admin' in company 1) can list all companies.
    """
    if current_user.role == "admin" and current_user.company_id == 1:
        companies = db.query(Company).all()
    else:
        companies = db.query(Company).filter(Company.id == current_user.company_id).all()

    return [CompanyResponse.from_orm(c) for c in companies]


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve details for a specific company workspace with authorization check."""
    is_sys_admin = current_user.role == "admin" and current_user.company_id == 1
    if not is_sys_admin and current_user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this company workspace."
        )

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )

    return CompanyResponse.from_orm(company)
