"""SP-API refresh endpoints."""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.database import get_supabase_client
from app.models import RefreshRequest, RefreshStatusResponse, RefreshHistoryResponse
from app.services.supabase_service import SupabaseService
from app.services.sp_api_service import SPAPIService, SPAPIAuthError, SPAPIReportError
from app.services.data_processor import transform_sp_api_mtr_row, transform_sp_api_orders_row

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/refresh", tags=["Data Refresh"])


def get_service() -> SupabaseService:
    return SupabaseService(get_supabase_client())


def get_sp_api() -> SPAPIService:
    return SPAPIService()


def _run_refresh(
    service: SupabaseService,
    sp_api: SPAPIService,
    log_id: int,
    start_date: str,
    end_date: str,
    report_types: list[str],
):
    """Background task to fetch SP-API data and store in Supabase.
    
    Primary: Uses Orders API (works with 'Inventory and Order Tracking' role).
    Fallback: GST MTR reports (only if report_types contains 'B2C'/'B2B' AND
              the Restricted Tax role is available).
    """
    total_fetched = 0
    total_inserted = 0
    errors = []

    try:
        # Get product catalog for ASIN mapping
        product_catalog = service.get_product_catalog()
        logger.info(
            "Loaded product catalog with %d entries", len(product_catalog)
        )

        all_records = []
        use_orders_api = "ORDERS" in report_types or not any(
            t in report_types for t in ("B2C", "B2B")
        )

        if use_orders_api:
            # ---- Primary path: Orders API ----
            logger.info("Using Orders API to fetch data for %s to %s", start_date, end_date)
            try:
                raw_data = sp_api.fetch_orders_with_items(start_date, end_date)
                total_fetched = len(raw_data)
                for row in raw_data:
                    record = transform_sp_api_orders_row(row, product_catalog)
                    all_records.append(record)
                logger.info("Transformed %d records from Orders API", len(all_records))
            except Exception as e:
                logger.error("Orders API failed: %s", e)
                errors.append(f"Orders API: {e}")
        else:
            # ---- Fallback path: GST MTR Reports ----
            logger.info("Using GST MTR Reports (requires Restricted Tax role)")
            raw_data = sp_api.fetch_all_data(start_date, end_date, report_types)

            if "b2c" in raw_data:
                for row in raw_data["b2c"]:
                    record = transform_sp_api_mtr_row(row, "b2c", product_catalog)
                    all_records.append(record)
                total_fetched += len(raw_data["b2c"])
            if "b2c_error" in raw_data:
                errors.append(f"B2C: {raw_data['b2c_error']}")

            if "b2b" in raw_data:
                for row in raw_data["b2b"]:
                    record = transform_sp_api_mtr_row(row, "b2b", product_catalog)
                    all_records.append(record)
                total_fetched += len(raw_data["b2b"])
            if "b2b_error" in raw_data:
                errors.append(f"B2B: {raw_data['b2b_error']}")

        # Insert into Supabase
        if all_records:
            # Strip extra fields that don't exist in the DB schema
            for rec in all_records:
                rec.pop("Fulfillment_Type", None)

            inserted, updated = service.upsert_sales_batch(all_records)
            total_inserted = inserted
            logger.info(
                "Inserted %d records from SP-API refresh", total_inserted
            )

        # Update refresh log
        status = "completed" if not errors else "completed_with_errors"
        error_msg = "; ".join(errors) if errors else None

        service.update_refresh_log(
            log_id,
            {
                "completed_at": datetime.utcnow().isoformat(),
                "status": status,
                "records_fetched": total_fetched,
                "records_inserted": total_inserted,
                "error_message": error_msg,
            },
        )
        logger.info(
            "Refresh completed: fetched=%d, inserted=%d, errors=%s",
            total_fetched,
            total_inserted,
            error_msg,
        )

    except Exception as e:
        logger.error("Refresh failed: %s", e)
        service.update_refresh_log(
            log_id,
            {
                "completed_at": datetime.utcnow().isoformat(),
                "status": "failed",
                "records_fetched": total_fetched,
                "records_inserted": total_inserted,
                "error_message": str(e),
            },
        )


@router.post("", response_model=RefreshStatusResponse)
def trigger_refresh(
    request: RefreshRequest,
    background_tasks: BackgroundTasks,
    service: SupabaseService = Depends(get_service),
    sp_api: SPAPIService = Depends(get_sp_api),
):
    """Trigger a data refresh from Amazon SP-API.
    
    Fetches B2B and/or B2C MTR reports and stores in Supabase.
    The refresh runs in the background - check status via GET /api/v1/refresh/status.
    
    If no date range is specified, fetches from the last successful refresh date to now.
    """
    if not sp_api.is_configured:
        raise HTTPException(
            status_code=400,
            detail=(
                "SP-API credentials not configured. "
                "Set SP_API_REFRESH_TOKEN, SP_API_LWA_APP_ID, "
                "and SP_API_LWA_CLIENT_SECRET in .env"
            ),
        )

    # Check if a refresh is already in progress
    last_refresh = service.get_last_refresh()
    if last_refresh and last_refresh.get("status") == "in_progress":
        raise HTTPException(
            status_code=409,
            detail="A refresh is already in progress. Please wait for it to complete.",
        )

    # Determine date range
    end_date = request.date_to or datetime.utcnow().strftime("%Y-%m-%d")

    if request.date_from:
        start_date = request.date_from
    else:
        # Use last successful refresh date, or default to 30 days ago
        last_success = service.get_last_successful_refresh()
        if last_success and last_success.get("date_range_end"):
            start_date = last_success["date_range_end"]
        else:
            start_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    # Create refresh log entry
    report_type = ",".join(request.report_types)
    refresh_log = service.create_refresh_log(report_type, start_date, end_date)
    log_id = refresh_log["id"]

    # Run refresh in background
    background_tasks.add_task(
        _run_refresh, service, sp_api, log_id, start_date, end_date, request.report_types
    )

    return RefreshStatusResponse(
        id=log_id,
        started_at=refresh_log.get("started_at"),
        status="in_progress",
        report_type=report_type,
        date_range_start=start_date,
        date_range_end=end_date,
    )


@router.get("/status", response_model=RefreshStatusResponse)
def get_refresh_status(service: SupabaseService = Depends(get_service)):
    """Get the status of the most recent refresh operation."""
    last_refresh = service.get_last_refresh()

    if not last_refresh:
        return RefreshStatusResponse(
            status="no_refresh_found",
            records_fetched=0,
            records_inserted=0,
        )

    return RefreshStatusResponse(
        id=last_refresh.get("id"),
        started_at=last_refresh.get("started_at"),
        completed_at=last_refresh.get("completed_at"),
        status=last_refresh.get("status", "unknown"),
        records_fetched=last_refresh.get("records_fetched", 0),
        records_inserted=last_refresh.get("records_inserted", 0),
        records_updated=last_refresh.get("records_updated", 0),
        error_message=last_refresh.get("error_message"),
        report_type=last_refresh.get("report_type"),
        date_range_start=last_refresh.get("date_range_start"),
        date_range_end=last_refresh.get("date_range_end"),
    )


@router.get("/history", response_model=RefreshHistoryResponse)
def get_refresh_history(
    limit: int = Query(20, ge=1, le=100),
    service: SupabaseService = Depends(get_service),
):
    """Get history of all refresh operations."""
    history = service.get_refresh_history(limit=limit)
    items = [
        RefreshStatusResponse(
            id=item.get("id"),
            started_at=item.get("started_at"),
            completed_at=item.get("completed_at"),
            status=item.get("status", "unknown"),
            records_fetched=item.get("records_fetched", 0),
            records_inserted=item.get("records_inserted", 0),
            records_updated=item.get("records_updated", 0),
            error_message=item.get("error_message"),
            report_type=item.get("report_type"),
            date_range_start=item.get("date_range_start"),
            date_range_end=item.get("date_range_end"),
        )
        for item in history
    ]
    return RefreshHistoryResponse(data=items, total=len(items))
