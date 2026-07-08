"""
service.main — Shadow Lamp STL microservice (FastAPI).

Internal-only HTTP service that wraps `scripts/generate_shadow_casing.run()`
behind two endpoints (/preview, /generate). Stateless, no DB.

Plan 02 Phase A.
"""
from fastapi import FastAPI

from service.routes import check_islands as check_islands_route
from service.routes import convert as convert_route
from service.routes import generate as generate_route
from service.routes import preview as preview_route

app = FastAPI(
    title="Shadow Lamp STL Service",
    description="Internal microservice that turns silhouette + config into shadow PNG / STL.",
    version="0.1.0",
)

app.include_router(preview_route.router)
app.include_router(generate_route.router)
app.include_router(convert_route.router)
app.include_router(check_islands_route.router)


@app.get("/health")
def health() -> dict:
    """Liveness probe — no auth required."""
    return {"status": "ok", "service": "stl-service", "version": app.version}
