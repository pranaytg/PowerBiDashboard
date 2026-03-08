"""SP-API data fetching endpoints for catalog, finances, and returns — with caching."""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.cache import cache_get, cache_set, make_cache_key
from app.database import get_supabase_client
from app.services.supabase_service import SupabaseService
from app.services.sp_api_service import SPAPIService, SPAPIAuthError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["SP-API Data"])


def get_service() -> SupabaseService:
    return SupabaseService(get_supabase_client())


def get_sp_api() -> SPAPIService:
    return SPAPIService()


# ------------------------------------------------------------------ #
#  Catalog  – fetch product info by ASIN
# ------------------------------------------------------------------ #

@router.post("/catalog/sync")
def sync_catalog(
    background_tasks: BackgroundTasks,
    sp_api: SPAPIService = Depends(get_sp_api),
    service: SupabaseService = Depends(get_service),
):
    """Fetch catalog info for all ASINs in the sales table."""
    if not sp_api.is_configured:
        raise HTTPException(status_code=400, detail="SP-API not configured")

    def _run():
        try:
            # Get distinct ASINs from sales
            client = get_supabase_client()
            result = client.table("sales").select("Asin").execute()
            asins = list({r["Asin"] for r in (result.data or []) if r.get("Asin")})
            logger.info("Found %d distinct ASINs to sync", len(asins))

            catalog_items = sp_api.fetch_catalog_batch(asins[:100])  # Cap at 100

            # Upsert into product_catalog
            for item in catalog_items:
                record = {
                    "asin": item["asin"],
                    "brand": item.get("brand", ""),
                    "category": item.get("classification", ""),
                    "segment": item.get("color", ""),
                    "title": item.get("title", ""),
                    "image_url": item.get("image_url", ""),
                }
                try:
                    client.table("product_catalog").upsert(
                        record, on_conflict="asin"
                    ).execute()
                except Exception as e:
                    logger.warning("Catalog upsert failed for %s: %s", item["asin"], e)

            logger.info("Synced %d catalog items", len(catalog_items))
        except Exception as e:
            logger.error("Catalog sync failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Catalog sync started in background"}


@router.get("/catalog")
def get_catalog(service: SupabaseService = Depends(get_service)):
    """Get all product catalog entries."""
    cache_key = make_cache_key("catalog_all")
    cached = cache_get("catalog", cache_key)
    if cached is not None:
        return cached

    catalog = service.get_product_catalog()
    result = {"data": list(catalog.values()), "total": len(catalog)}
    cache_set("catalog", cache_key, result)
    return result


# ------------------------------------------------------------------ #
#  Financial Events  – fees, charges, refunds
# ------------------------------------------------------------------ #

@router.post("/finances/sync")
def sync_finances(
    date_from: str = Query(None),
    date_to: str = Query(None),
    background_tasks: BackgroundTasks = None,
    sp_api: SPAPIService = Depends(get_sp_api),
):
    """Fetch financial events from SP-API and store in Supabase."""
    if not sp_api.is_configured:
        raise HTTPException(status_code=400, detail="SP-API not configured")

    end = date_to or datetime.utcnow().strftime("%Y-%m-%d")
    start = date_from or (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    def _run():
        try:
            events = sp_api.fetch_financial_events(start, end)
            client = get_supabase_client()

            # Store in financial_events table
            batch = []
            for ev in events:
                record = {
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
                }
                batch.append(record)

            if batch:
                # Insert in chunks
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    client.table("financial_events").upsert(
                        chunk, on_conflict="order_id,sku,event_type"
                    ).execute()

            logger.info("Synced %d financial events", len(batch))
        except Exception as e:
            logger.error("Finance sync failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": f"Finance sync started ({start} to {end})"}


@router.get("/finances")
def get_finances(
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=5000),
):
    """Get financial events from DB."""
    cache_key = make_cache_key("finances", page=page, per_page=per_page)
    cached = cache_get("finances", cache_key)
    if cached is not None:
        return cached

    client = get_supabase_client()
    offset = (page - 1) * per_page
    result = (
        client.table("financial_events")
        .select("*")
        .order("posted_date", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    count_result = client.table("financial_events").select("*", count="exact").execute()
    response = {
        "data": result.data or [],
        "total": count_result.count or 0,
        "page": page,
        "per_page": per_page,
    }
    cache_set("finances", cache_key, response)
    return response


# ------------------------------------------------------------------ #
#  Returns  – FBA customer returns
# ------------------------------------------------------------------ #

@router.post("/returns/sync")
def sync_returns(
    date_from: str = Query(None),
    date_to: str = Query(None),
    background_tasks: BackgroundTasks = None,
    sp_api: SPAPIService = Depends(get_sp_api),
):
    """Fetch FBA returns report and store in Supabase."""
    if not sp_api.is_configured:
        raise HTTPException(status_code=400, detail="SP-API not configured")

    end = date_to or datetime.utcnow().strftime("%Y-%m-%d")
    start = date_from or (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    def _run():
        try:
            returns_data = sp_api.fetch_returns_report(start, end)
            client = get_supabase_client()

            batch = []
            for r in returns_data:
                record = {
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
                }
                batch.append(record)

            if batch:
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    client.table("returns").upsert(
                        chunk, on_conflict="order_id,sku,return_date"
                    ).execute()

            logger.info("Synced %d returns records", len(batch))
        except Exception as e:
            logger.error("Returns sync failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": f"Returns sync started ({start} to {end})"}


@router.get("/returns")
def get_returns(
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=5000),
):
    """Get returns from DB."""
    cache_key = make_cache_key("returns", page=page, per_page=per_page)
    cached = cache_get("returns", cache_key)
    if cached is not None:
        return cached

    client = get_supabase_client()
    offset = (page - 1) * per_page
    result = (
        client.table("returns")
        .select("*")
        .order("return_date", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    count_result = client.table("returns").select("*", count="exact").execute()
    response = {
        "data": result.data or [],
        "total": count_result.count or 0,
        "page": page,
        "per_page": per_page,
    }
    cache_set("returns", cache_key, response)
    return response


# ------------------------------------------------------------------ #
#  Inventory Snapshots  – daily FBA stock levels
# ------------------------------------------------------------------ #

@router.post("/inventory/sync")
def sync_inventory(
    background_tasks: BackgroundTasks,
    sp_api: SPAPIService = Depends(get_sp_api),
):
    """Fetch current FBA inventory levels and store as a daily snapshot."""
    if not sp_api.is_configured:
        raise HTTPException(status_code=400, detail="SP-API not configured")

    def _run():
        try:
            inventory_rows = sp_api.fetch_inventory_report()
            client = get_supabase_client()
            today = datetime.utcnow().strftime("%Y-%m-%d")

            batch = []
            for row in inventory_rows:
                record = {
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
                }
                batch.append(record)

            if batch:
                for i in range(0, len(batch), 500):
                    chunk = batch[i:i + 500]
                    client.table("inventory_snapshots").upsert(
                        chunk, on_conflict="snapshot_date,sku"
                    ).execute()

            logger.info("Saved inventory snapshot: %d SKUs for %s", len(batch), today)
        except Exception as e:
            logger.error("Inventory sync failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Inventory snapshot sync started"}


@router.get("/inventory/snapshots")
def get_inventory_snapshots(
    sku: Optional[str] = Query(None),
    days: int = Query(90, ge=1, le=365),
):
    """Get inventory snapshot history (for charts and analysis)."""
    cache_key = make_cache_key("inv_snapshots", sku=sku, days=days)
    cached = cache_get("catalog", cache_key)  # reuse catalog cache slot
    if cached is not None:
        return cached

    client = get_supabase_client()
    q = client.table("inventory_snapshots").select("*").order("snapshot_date", desc=True)

    if sku:
        q = q.eq("sku", sku)

    q = q.limit(days * 100)  # reasonable upper bound
    result = q.execute()

    response = {"data": result.data or [], "total": len(result.data or [])}
    cache_set("catalog", cache_key, response)
    return response
