import asyncio
import logging
from datetime import datetime

from app.services.sp_api_service import SPAPIService
from app.database import get_supabase_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_sync():
    sp_api = SPAPIService()
    client = get_supabase_client()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    if not sp_api.is_configured:
        logger.error("SP-API NOT CONFIGURED!")
        return

    # 1. Fetch Inventory Snapshots
    logger.info("Fetching FBA Inventory Report...")
    try:
        inv_rows = sp_api.fetch_inventory_report()
        batch = []
        for row in inv_rows:
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
            for i in range(0, len(batch), 500):
                client.table("inventory_snapshots").upsert(
                    batch[i:i + 500], on_conflict="snapshot_date,sku"
                ).execute()
        logger.info(f"Saved {len(batch)} inventory records for {today}")
    except Exception as e:
        logger.error(f"Error fetching inventory: {e}")

    # 2. Fetch Warehouse Inventory Snapshots
    logger.info("Fetching FBA Warehouse Inventory Report...")
    try:
        wh_rows = sp_api.fetch_warehouse_inventory_report()
        batch = []
        for row in wh_rows:
            sku = row.get("sku", row.get("seller-sku", ""))
            fc = row.get("fulfillment-center-id", "")
            if not sku or not fc:
                continue
                
            qty = SPAPIService._safe_int(row.get("quantity", 0))
            cond = row.get("disposition", "SELLABLE")
            
            # For warehouse inventory snapshots we only care about sellable or the total.
            batch.append({
                "snapshot_date": today,
                "sku": sku,
                "fulfillment_center_id": fc,
                "quantity": qty,
                "condition": cond
            })
            
        if batch:
            for i in range(0, len(batch), 500):
                client.table("warehouse_inventory_snapshots").upsert(
                    batch[i:i + 500], on_conflict="snapshot_date,sku,fulfillment_center_id,condition"
                ).execute()
        logger.info(f"Saved {len(batch)} warehouse records for {today}")
    except Exception as e:
        logger.error(f"Error fetching warehouse inventory: {e}")

if __name__ == "__main__":
    run_sync()
