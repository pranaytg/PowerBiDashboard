"""SP-API refresh endpoints."""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.cache import invalidate_all as invalidate_all_caches
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
    
    Performs a GLOBAL sync: Orders, Finances, Returns, Inventory, Warehouse Inventory.
    """
    total_fetched = 0
    total_inserted = 0
    errors = []

    try:
        # 1. Orders / Sales
        product_catalog = service.get_product_catalog()
        logger.info("Loaded product catalog with %d entries", len(product_catalog))

        all_records = []
        try:
            logger.info("Syncing Orders API for %s to %s", start_date, end_date)
            raw_data = sp_api.fetch_orders_with_items(start_date, end_date)
            total_fetched += len(raw_data)
            for row in raw_data:
                record = transform_sp_api_orders_row(row, product_catalog)
                record.pop("Fulfillment_Type", None)
                all_records.append(record)
            
            if all_records:
                inserted, updated = service.upsert_sales_batch(all_records)
                total_inserted += inserted
                logger.info("Inserted %d sales records limit", inserted)
        except Exception as e:
            logger.error("Orders API failed: %s", e)
            errors.append(f"Orders API: {e}")

        # 2. Finances
        try:
            logger.info("Syncing Financial Events for %s to %s", start_date, end_date)
            fin_events = sp_api.fetch_financial_events(start_date, end_date)
            batch = []
            for ev in fin_events:
                batch.append({
                    "order_id": ev.get("order_id", ""),
                    "posted_date": ev.get("posted_date", ""),
                    "sku": ev.get("sku", ""),
                    "asin": ev.get("asin", ""),
                    "quantity": ev.get("quantity", 0),
                    "event_type": ev.get("event_type", ""),
                    "total_charges": ev.get("total_charges", 0),
                    "total_fees": ev.get("total_fees", 0),
                    "net_amount": ev.get("net_amount", 0),
                    "charge_principal": ev.get("charge_Principal", 0),
                    "charge_tax": ev.get("charge_Tax", 0),
                    "fee_commission": ev.get("fee_Commission", 0),
                    "fee_fba_fees": ev.get("fee_FBAPerUnitFulfillmentFee", 0),
                    "fee_shipping_charge_back": ev.get("fee_ShippingChargeback", 0),
                })
            if batch:
                inserted = service.upsert_finances_batch(batch)
                logger.info("Inserted %d financial events", inserted)
        except Exception as e:
            logger.error("Finances API failed: %s", e)
            errors.append(f"Finances API: {e}")

        # 3. Returns
        try:
            logger.info("Syncing Returns for %s to %s", start_date, end_date)
            returns_data = sp_api.fetch_returns_report(start_date, end_date)
            batch = []
            for r in returns_data:
                batch.append({
                    "return_date": r.get("return-date", ""),
                    "order_id": r.get("order-id", ""),
                    "sku": r.get("sku", ""),
                    "asin": r.get("asin", ""),
                    "fnsku": r.get("fnsku", ""),
                    "product_name": r.get("product-name", ""),
                    "quantity": int(r.get("quantity", 0) or 0),
                    "fulfillment_center_id": r.get("fulfillment-center-id", ""),
                    "detailed_disposition": r.get("detailed-disposition", ""),
                    "reason": r.get("reason", ""),
                    "status": r.get("status", ""),
                    "license_plate_number": r.get("license-plate-number", ""),
                    "customer_comments": r.get("customer-comments", ""),
                })
            if batch:
                inserted = service.upsert_returns_batch(batch)
                logger.info("Inserted %d returns records", inserted)
        except Exception as e:
            logger.error("Returns API failed: %s", e)
            errors.append(f"Returns API: {e}")

        # 4. Inventory Snapshots
        today = datetime.utcnow().strftime("%Y-%m-%d")
        try:
            logger.info("Syncing FBA Inventory")
            inventory_rows = sp_api.fetch_inventory_report()
            batch = []
            for row in inventory_rows:
                batch.append({
                    "snapshot_date": today,
                    "sku": row["sku"],
                    "fnsku": row.get("fnsku", ""),
                    "asin": row.get("asin", ""),
                    "product_name": row.get("product_name", ""),
                    "fulfillable_quantity": row.get("fulfillable_quantity", 0),
                    "inbound_quantity": row.get("inbound_quantity", 0),
                    "reserved_quantity": row.get("reserved_quantity", 0),
                    "unfulfillable_quantity": row.get("unfulfillable_quantity", 0),
                    "total_quantity": row.get("total_quantity", 0),
                })
            if batch:
                inserted = service.upsert_inventory_snapshots_batch(batch)
                logger.info("Inserted %d inventory snapshots", inserted)
        except Exception as e:
            logger.error("Inventory API failed: %s", e)
            errors.append(f"Inventory API: {e}")

        # 5. Warehouse Inventory
        try:
            logger.info("Syncing Warehouse Inventory")
            wh_inventory_rows = sp_api.fetch_warehouse_inventory_report()
            batch = []
            for row in wh_inventory_rows:
                qty = int(row.get("quantity", 0) or 0)
                sku = row.get("sku", row.get("seller-sku", ""))
                if not sku:
                    continue
                batch.append({
                    "snapshot_date": today,
                    "sku": sku,
                    "fnsku": row.get("fnsku", ""),
                    "asin": row.get("asin", ""),
                    "fulfillment_center_id": row.get("fulfillment-center-id", ""),
                    "quantity": qty,
                    "condition": row.get("condition", ""),
                })
            if batch:
                inserted = service.upsert_warehouse_inventory_batch(batch)
                logger.info("Inserted %d warehouse inventory snapshots", inserted)
        except Exception as e:
            logger.error("Warehouse Inventory API failed: %s", e)
            errors.append(f"Warehouse Inventory API: {e}")

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
            total_fetched, total_inserted, error_msg,
        )

        # Invalidate all caches
        invalidate_all_caches()

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
