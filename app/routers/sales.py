"""Sales data API endpoints with in-memory caching."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException

from app.cache import cache_get, cache_set, make_cache_key
from app.database import get_supabase_client
from app.models import SalesResponse
from app.services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sales", tags=["Sales Data"])


def get_service() -> SupabaseService:
    return SupabaseService(get_supabase_client())


@router.get("", response_model=SalesResponse)
def get_sales(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(1000, ge=1, le=10000, description="Records per page"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    year: Optional[int] = Query(None, description="Filter by year"),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    business: Optional[str] = Query(None, description="Filter by business type (b2b/b2c)"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    category: Optional[str] = Query(None, description="Filter by category"),
    transaction_type: Optional[str] = Query(None, description="Filter by transaction type"),
    source: Optional[str] = Query(None, description="Filter by source/fiscal year"),
    asin: Optional[str] = Query(None, description="Filter by ASIN"),
    order_id: Optional[str] = Query(None, description="Filter by Order ID"),
    service: SupabaseService = Depends(get_service),
):
    """Get paginated sales data with optional filters.
    
    Power BI compatible - column names match combined2.xlsx headers exactly.
    All string data values are lowercase.
    """
    filters = {}
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to
    if year:
        filters["year"] = year
    if channel:
        filters["channel"] = channel
    if business:
        filters["business"] = business
    if brand:
        filters["brand"] = brand
    if category:
        filters["category"] = category
    if transaction_type:
        filters["transaction_type"] = transaction_type
    if source:
        filters["source"] = source
    if asin:
        filters["asin"] = asin
    if order_id:
        filters["order_id"] = order_id

    cache_key = make_cache_key("sales", page=page, per_page=per_page, **filters)
    cached = cache_get("sales", cache_key)
    if cached is not None:
        return SalesResponse(**cached)

    try:
        result = service.get_sales(page=page, per_page=per_page, filters=filters or None)
        cache_set("sales", cache_key, result)
        return SalesResponse(**result)
    except Exception as e:
        logger.error("Error fetching sales data: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/count")
def get_sales_count(service: SupabaseService = Depends(get_service)):
    """Get total number of sales records."""
    cache_key = make_cache_key("sales_count")
    cached = cache_get("count", cache_key)
    if cached is not None:
        return cached

    try:
        count = service.get_sales_count()
        result = {"total": count}
        cache_set("count", cache_key, result)
        return result
    except Exception as e:
        logger.error("Error getting sales count: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filters")
def get_available_filters(service: SupabaseService = Depends(get_service)):
    """Get available filter values for the UI.
    
    Returns distinct values for key columns to populate filter dropdowns.
    """
    cache_key = make_cache_key("all_filters")
    cached = cache_get("filters", cache_key)
    if cached is not None:
        return cached

    try:
        result = {
            "channels": service.get_distinct_values("Channel"),
            "businesses": service.get_distinct_values("Business"),
            "brands": service.get_distinct_values("BRAND"),
            "categories": service.get_distinct_values("Category"),
            "transaction_types": service.get_distinct_values("Transaction Type"),
            "sources": service.get_distinct_values("Source"),
            "years": service.get_distinct_values("Year"),
        }
        cache_set("filters", cache_key, result)
        return result
    except Exception as e:
        logger.error("Error getting filter values: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
def get_sales_summary(
    year: Optional[int] = Query(None),
    channel: Optional[str] = Query(None),
    service: SupabaseService = Depends(get_service),
):
    """Get a summary of sales data (total records, date range, etc.)."""
    cache_key = make_cache_key("summary", year=year, channel=channel)
    cached = cache_get("summary", cache_key)
    if cached is not None:
        return cached

    try:
        filters = {}
        if year:
            filters["year"] = year
        if channel:
            filters["channel"] = channel

        result = service.get_sales(page=1, per_page=1, filters=filters or None)
        total = result["total"]

        response = {
            "total_records": total,
            "filters_applied": filters,
        }
        cache_set("summary", cache_key, response)
        return response
    except Exception as e:
        logger.error("Error getting sales summary: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
