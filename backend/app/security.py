"""
Security and Cryptography Module for CargoMind.
Provides:
- Strong bcrypt password hashing and transparent plaintext migration.
- Production-enforced JWT secret validation.
- Secure, constant-time JWT signature verification.
- Production environment detection.
"""

import os
import time
import hmac
import hashlib
import base64
import json
import bcrypt
from typing import Tuple, Optional, Dict, Any
from fastapi import HTTPException, status

DEFAULT_DEV_JWT_SECRET = "cargomind-fleet-intelligence-dev-secret-only-2026"
WEAK_SECRETS = {
    "",
    "cargomind-fleet-intelligence-secret-key-2026",
    "your_jwt_secret_key_here",
    "secret",
    "change_me",
    "password",
    "12345678",
    DEFAULT_DEV_JWT_SECRET,
}

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_SECONDS = 7 * 24 * 3600  # 7 days


def is_production_environment() -> bool:
    """
    Check if running in a cloud/production environment like Render.
    """
    render_flag = os.getenv("RENDER", "").lower() in ("true", "1")
    service_id = bool(os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_SERVICE_NAME"))
    env_flag = os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
    return render_flag or service_id or env_flag


def validate_and_get_jwt_secret() -> str:
    """
    Retrieve and validate JWT_SECRET.
    In production: strictly required, >= 32 characters, and not in default placeholder list.
    Fails startup with RuntimeError if insecure.
    In local development: falls back to dev key if not provided.
    """
    secret = os.getenv("JWT_SECRET", "").strip().strip("'\"")
    is_prod = is_production_environment()

    if is_prod:
        if not secret or len(secret) < 32 or secret in WEAK_SECRETS:
            raise RuntimeError(
                "[Security] CRITICAL: JWT_SECRET environment variable is missing, too short (<32 chars), "
                "or configured with an insecure placeholder in production. "
                "Set a strong cryptographically random secret in your production environment variables."
            )
        return secret

    # Development mode fallback
    if secret:
        return secret
    return DEFAULT_DEV_JWT_SECRET


def hash_password(plain_password: str) -> str:
    """Hash password using bcrypt with salt."""
    if not plain_password:
        raise ValueError("Password cannot be empty")
    # Truncate to 72 bytes if necessary per bcrypt limits
    pw_bytes = plain_password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_and_update_password(plain_password: str, stored_password_or_hash: str) -> Tuple[bool, Optional[str]]:
    """
    Verify password against stored value.
    - If stored value is a bcrypt hash ($2b$, $2a$, $2y$), verifies with bcrypt.
    - If stored value is legacy plain text, compares securely and returns (True, new_bcrypt_hash)
      so the caller can transparently migrate the database record.
    Returns: (is_valid, new_hash_if_migration_needed)
    """
    if not stored_password_or_hash or not plain_password:
        return False, None

    # Google OAuth placeholder passwords can never be used for password login
    if stored_password_or_hash.startswith(("[google_oauth_authenticated]", "$oauth$")):
        return False, None

    is_bcrypt = stored_password_or_hash.startswith(("$2b$", "$2a$", "$2y$"))

    if is_bcrypt:
        try:
            pw_bytes = plain_password.encode("utf-8")[:72]
            hash_bytes = stored_password_or_hash.encode("utf-8")
            valid = bcrypt.checkpw(pw_bytes, hash_bytes)
            return valid, None
        except Exception:
            return False, None
    else:
        # Legacy plaintext password check
        valid = hmac.compare_digest(plain_password, stored_password_or_hash)
        if valid:
            # Upgrade legacy plaintext to secure bcrypt hash
            new_hash = hash_password(plain_password)
            return True, new_hash
        return False, None


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def base64url_decode(data_str: str) -> bytes:
    padding = "=" * (4 - (len(data_str) % 4))
    return base64.urlsafe_b64decode(data_str + padding)


def create_access_token(user_id: int, email: str, role: str) -> str:
    """Create a standard HS256 signed JWT token."""
    secret = validate_and_get_jwt_secret()
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
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_encoded = base64url_encode(signature)

    return f"{header_encoded}.{payload_encoded}.{signature_encoded}"


def verify_access_token(token: str) -> Dict[str, Any]:
    """Verify standard HS256 signed JWT token."""
    secret = validate_and_get_jwt_secret()
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token structure"
        )

    header_encoded, payload_encoded, signature_encoded = parts

    try:
        header_bytes = base64url_decode(header_encoded)
        header = json.loads(header_bytes.decode("utf-8"))
        if header.get("alg") != JWT_ALGORITHM:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unsupported token algorithm"
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token header"
        )

    signing_input = f"{header_encoded}.{payload_encoded}".encode("utf-8")
    expected_sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
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

