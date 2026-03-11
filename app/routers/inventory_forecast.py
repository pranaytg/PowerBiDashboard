from fastapi import APIRouter, HTTPException, Depends
from typing import Any
import logging
from datetime import datetime

from app.database import get_db
from app.services.sp_api_service import SPAPIService
from app.services.forecasting_engine import calculate_forecast_and_alerts

router = APIRouter(prefix="/api/v1/forecast", tags=["forecast"])
logger = logging.getLogger(__name__)

@router.get("/multi-warehouse")
async def get_multi_warehouse_forecast() -> list[dict[str, Any]]:
    """
    Returns the comprehensive forecasting json output for the multi-warehouse system.
    Joins local inventory, historical sales, and computes reorder flags via Pandas.
    """
    try:
        db = get_db()
        
        # 1. Fetch Warehouses and Local Inventory
        inv_query = db.table("local_inventory").select(
            "sku, quantity_on_hand, quantity_reserved, warehouse_id, warehouses(alias, lead_time_days)"
        ).execute()
        
        inventory_data = []
        for row in inv_query.data:
            lead_time = row.get("warehouses", {}).get("lead_time_days", 14) if row.get("warehouses") else 14
            inventory_data.append({
                "sku": row["sku"],
                "warehouse_id": row["warehouse_id"],
                "alias": row.get("warehouses", {}).get("alias", "Unknown"),
                "quantity_on_hand": row["quantity_on_hand"],
                "quantity_reserved": row["quantity_reserved"],
                "lead_time": lead_time
            })
            
        # Group to find max lead time (or just take default 14 for simplicity in demo)
        global_lead_time = 14
        if inventory_data:
            global_lead_time = max([item.get("lead_time", 14) for item in inventory_data])

        # 2. Fetch Historical Sales Velocity
        # We fetch the last 45 days just to be safe for a 30-day moving average
        sales_query = db.table("historical_sales_velocity").select("*").order("date", desc=True).limit(10000).execute()
        historical_sales = sales_query.data

        # 3. Calculate forecast
        forecast_results = calculate_forecast_and_alerts(
            historical_sales=historical_sales,
            inventory_data=inventory_data,
            lead_time_days=global_lead_time,
            safety_stock_days=5
        )
        
        return forecast_results
        
    except Exception as e:
        logger.error(f"Failed to generate multi-warehouse forecast: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sync-orders")
async def sync_unshipped_orders_and_deduct() -> dict[str, Any]:
    """
    Poll the Orders API for Unshipped and PartiallyShipped orders.
    Parse supplySourceId and deduct quantity_reserved in local_inventory.
    """
    try:
        sp_api = SPAPIService()
        db = get_db()
        
        # Fetch unshipped orders
        # Typically we'd only query the last few days to catch new unshipped orders
        now = datetime.utcnow()
        start = (now - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
        end = now.strftime("%Y-%m-%d")
        
        orders = sp_api.fetch_orders_with_items(start_date=start, end_date=end, max_pages=10)
        
        unshipped_orders = [o for o in orders if o.get("OrderStatus") in ["Unshipped", "PartiallyShipped"]]
        
        # Aggregate reserved quantity by SKU and supplySourceId
        reserved_map = {}
        for order in unshipped_orders:
            supply_source = order.get("FulfillmentInstruction", {}).get("SupplySourceId")
            sku = order.get("SellerSKU")
            qty = int(order.get("QuantityOrdered", 0)) - int(order.get("QuantityShipped", 0))
            if supply_source and sku and qty > 0:
                key = (supply_source, sku)
                reserved_map[key] = reserved_map.get(key, 0) + qty
                
        # Update Database
        if reserved_map:
            # Get warehouse mapping
            wh_query = db.table("warehouses").select("id, supply_source_id").execute()
            wh_map = {w["supply_source_id"]: w["id"] for w in wh_query.data}
            
            for (supply_source, sku), reserved_qty in reserved_map.items():
                warehouse_id = wh_map.get(supply_source)
                if not warehouse_id:
                    continue # Not one of our managed supply sources
                    
                # Upsert local_inventory with new reserved quantity
                db.table("local_inventory").upsert({
                    "warehouse_id": warehouse_id,
                    "sku": sku,
                    "quantity_reserved": reserved_qty,
                    "updated_at": datetime.utcnow().isoformat()
                }, on_conflict="warehouse_id,sku").execute()
                
        return {"status": "success", "orders_processed": len(unshipped_orders), "skus_updated": len(reserved_map)}

    except Exception as e:
        logger.error(f"Failed to sync orders for multi-warehouse: {e}")
        raise HTTPException(status_code=500, detail=str(e))
