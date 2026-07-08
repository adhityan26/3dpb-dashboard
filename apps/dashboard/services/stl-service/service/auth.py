"""
Bearer token verification for the STL microservice.

The service is internal-only. The Next.js app and the Python service share a
secret token via the `STL_SERVICE_TOKEN` environment variable. Every protected
endpoint requires `Authorization: Bearer <token>`.
"""
import os

from fastapi import Header, HTTPException, status


def _expected_token() -> str:
    """Read the expected token from env at request time (not import time).

    Reading at request time lets tests monkey-patch os.environ between cases.
    Missing env var → 500 (server misconfiguration), not 401.
    """
    token = os.environ.get("STL_SERVICE_TOKEN")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STL_SERVICE_TOKEN is not configured on the server",
        )
    return token


def require_bearer_token(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency that verifies a bearer token in the Authorization header.

    Use as: `@router.post(..., dependencies=[Depends(require_bearer_token)])`
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must be 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token != _expected_token():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
