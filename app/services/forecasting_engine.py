import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def calculate_forecast_and_alerts(
    historical_sales: List[Dict[str, Any]], 
    inventory_data: List[Dict[str, Any]], 
    lead_time_days: int = 14,
    safety_stock_days: int = 5
) -> List[Dict[str, Any]]:
    """
    Core Forecasting Engine Logic for Multi-Warehouse Inventory.
    
    Args:
        historical_sales: List of dicts with {'date': 'YYYY-MM-DD', 'sku': 'str', 'units_sold': int}
        inventory_data: List of dicts with {'sku': 'str', 'warehouse_id': 'str', 'alias': 'str', 'quantity_on_hand': int, 'quantity_reserved': int}
        lead_time_days: Number of days to restock.
        safety_stock_days: Minimum threshold of days cover required.
        
    Returns:
        List of dicts containing the forecast and reorder alerts per warehouse & SKU.
    """
    if not historical_sales:
        logger.warning("No historical sales data provided to forecasting engine.")
        # If no sales data, return inventory with 0 velocities
        results = []
        for inv in inventory_data:
            available = max(0, inv.get('quantity_on_hand', 0) - inv.get('quantity_reserved', 0))
            results.append({
                "sku": inv['sku'],
                "warehouse_id": inv['warehouse_id'],
                "warehouse_alias": inv.get('alias', 'Unknown'),
                "available_stock": available,
                "velocity_7d": 0,
                "velocity_14d": 0,
                "velocity_30d": 0,
                "forecasted_daily_velocity": 0,
                "days_of_supply": 9999,
                "reorder_alert": False,
                "reorder_qty_needed": 0
            })
        return results

    # Convert to pandas DataFrame for vectorized moving average calculations
    df = pd.DataFrame(historical_sales)
    df['date'] = pd.to_datetime(df['date'], utc=True).dt.normalize()
    df = df.sort_values('date')
    
    # Calculate velocities per SKU
    skus = df['sku'].unique()
    today = pd.Timestamp.utcnow().normalize()
    
    velocity_map = {}
    
    for sku in skus:
        sku_df = df[df['sku'] == sku].copy()
        sku_df = sku_df.set_index('date')
        
        # Ensure we have a complete date range up to today for accurate 0-fill
        if not sku_df.empty:
            min_date = sku_df.index.min()
            # Let's say we look back up to 30 days minimum
            lookback_start = min(min_date, today - timedelta(days=30))
            idx = pd.date_range(lookback_start, today, freq='D') # Ensure all days are covered
            # Handle duplicates if any by summing them up first
            sku_df = sku_df.groupby('date').sum()
            sku_df = sku_df.reindex(idx, fill_value=0)
            
            # Get last 7, 14, 30 days sums
            last_30_days = sku_df.iloc[-30:] if len(sku_df) >= 30 else sku_df
            last_14_days = sku_df.iloc[-14:] if len(sku_df) >= 14 else sku_df
            last_7_days = sku_df.iloc[-7:] if len(sku_df) >= 7 else sku_df
            
            # Averages
            ma_7 = float(last_7_days['units_sold'].mean()) if not last_7_days.empty else 0.0
            ma_14 = float(last_14_days['units_sold'].mean()) if not last_14_days.empty else 0.0
            ma_30 = float(last_30_days['units_sold'].mean()) if not last_30_days.empty else 0.0
            
            # Weighted Average Formula
            # 50% recent (7d), 30% medium (14d), 20% long (30d)
            forecasted_velocity = (0.50 * ma_7) + (0.30 * ma_14) + (0.20 * ma_30)
            
            velocity_map[sku] = {
                "velocity_7d": round(ma_7, 2),
                "velocity_14d": round(ma_14, 2),
                "velocity_30d": round(ma_30, 2),
                "forecasted_daily_velocity": round(forecasted_velocity, 2)
            }
            
    # Now merge with inventory and calculate alerts
    results = []
    for inv in inventory_data:
        sku = inv['sku']
        available = max(0, inv.get('quantity_on_hand', 0) - inv.get('quantity_reserved', 0))
        
        v_data = velocity_map.get(sku, {
            "velocity_7d": 0, "velocity_14d": 0, "velocity_30d": 0, "forecasted_daily_velocity": 0
        })
        
        fdv = v_data["forecasted_daily_velocity"]
        
        # Calculate Days of Supply (DoS)
        if fdv > 0.01:
            dos = available / fdv
        else:
            dos = 9999.0 # Effectively infinite
            
        # Reorder Alert Trigger: DoS < Lead Time + Safety Stock
        reorder_threshold = lead_time_days + safety_stock_days
        reorder_alert = False
        reorder_qty_needed = 0
        
        if dos < reorder_threshold:
            reorder_alert = True
            # Suggested reorder quantity: target say 60 days of cover
            target_cover_days = lead_time_days + safety_stock_days + 30 # cover for 30 more days
            target_stock = int(target_cover_days * fdv)
            reorder_qty_needed = max(0, target_stock - available)
            
        results.append({
            "sku": sku,
            "warehouse_id": inv['warehouse_id'],
            "warehouse_alias": inv.get('alias', 'Unknown'),
            "available_stock": available,
            "quantity_on_hand": inv.get('quantity_on_hand', 0),
            "quantity_reserved": inv.get('quantity_reserved', 0),
            "velocity_7d": v_data["velocity_7d"],
            "velocity_14d": v_data["velocity_14d"],
            "velocity_30d": v_data["velocity_30d"],
            "forecasted_daily_velocity": fdv,
            "days_of_supply": round(dos, 1) if dos < 9999 else 9999,
            "reorder_alert": reorder_alert,
            "reorder_qty_needed": reorder_qty_needed,
            "lead_time_days": lead_time_days
        })

    return results
