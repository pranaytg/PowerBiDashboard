"""FastAPI application entry point - production grade setup."""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import get_supabase_client
from app.models import HealthResponse
from app.routers import sales, refresh
from app.services.supabase_service import SupabaseService

# ---- Logging ----

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ---- Lifespan ----

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    logger.info("Starting QnA Analytics API [env=%s]", settings.app_env)
    # Warm up Supabase client
    try:
        client = get_supabase_client()
        logger.info("Supabase client connected successfully")
    except Exception as e:
        logger.warning("Supabase connection warning: %s", e)
    yield
    logger.info("Shutting down QnA Analytics API")


# ---- App ----

app = FastAPI(
    title="QnA Analytics API",
    description=(
        "Production-grade FastAPI service for Amazon sales data analytics. "
        "Fetches data from Amazon SP-API, stores in Supabase, and serves "
        "Power BI-compatible data with column names matching combined2.xlsx."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---- CORS ----

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----

app.include_router(sales.router)
app.include_router(refresh.router)


# ---- Root & Health ----

@app.get("/", tags=["Root"])
def root():
    """API root - basic info."""
    return {
        "name": "QnA Analytics API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """Health check endpoint with system status."""
    supabase_ok = False
    total_records = 0
    last_refresh = None

    try:
        client = get_supabase_client()
        service = SupabaseService(client)
        total_records = service.get_sales_count()
        supabase_ok = True

        last = service.get_last_successful_refresh()
        if last:
            last_refresh = last.get("completed_at")
    except Exception as e:
        logger.warning("Health check - Supabase issue: %s", e)

    return HealthResponse(
        status="healthy" if supabase_ok else "degraded",
        environment=settings.app_env,
        supabase_connected=supabase_ok,
        sp_api_configured=settings.sp_api_configured,
        last_refresh=last_refresh,
        total_records=total_records,
    )


# ---- Run directly ----

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.app_env != "production",
        log_level=settings.log_level,
    )
