from app.services.forecasting_engine import calculate_forecast_and_alerts
import pandas as pd
from datetime import datetime, timedelta

def run_test():
    # Construct mock historical sales for 1 SKU over last 30 days
    # Let's say:
    # Days 1-16 (30d block, older 16 days) -> 10 units/day
    # Days 17-23 (14d block, older 7 days) -> 20 units/day
    # Days 24-30 (7d block, most recent 7 days) -> 30 units/day
    
    # Calculate expected:
    # MA_7 = 30
    # MA_14 = (7*30 + 7*20) / 14 = (210 + 140)/14 = 350/14 = 25
    # MA_30 = (7*30 + 7*20 + 16*10) / 30 = (210 + 140 + 160)/30 = 510/30 = 17
    
    # Expected Forcast = 0.5 * 30 + 0.3 * 25 + 0.2 * 17
    #                  = 15 + 7.5 + 3.4
    #                  = 25.9
    
    today = pd.Timestamp.utcnow().normalize()
    sales = []
    
    # Create the dataset perfectly matching these averages
    for i in range(1, 31):
        d = today - timedelta(days=30-i)
        
        if 30-i < 7:
            units = 30
        elif 30-i < 14:
            units = 20
        else:
            units = 10
            
        sales.append({
            "date": d.strftime("%Y-%m-%d"),
            "sku": "TEST-SKU",
            "units_sold": units
        })
        
    inv = [{
        "sku": "TEST-SKU",
        "warehouse_id": "WH-1",
        "alias": "Main FC",
        "quantity_on_hand": 500,
        "quantity_reserved": 0
    }]
    
    res = calculate_forecast_and_alerts(sales, inv, lead_time_days=10, safety_stock_days=5)
    
    print("Test Results:")
    print(f"Velocity 7d: {res[0]['velocity_7d']} (Expected: 30.0)")
    print(f"Velocity 14d: {res[0]['velocity_14d']} (Expected: 25.0)")
    print(f"Velocity 30d: {res[0]['velocity_30d']} (Expected: 17.0)")
    print(f"Forecasted Daily: {res[0]['forecasted_daily_velocity']} (Expected: 25.9)")
    
    expected_dos = 500 / 25.9
    print(f"Days of Supply: {res[0]['days_of_supply']} (Expected: {round(expected_dos, 1)})")
    
    if res[0]['forecasted_daily_velocity'] == 25.9:
        print("PASS => Math is perfect!")
    else:
        print("FAIL => Math mismatch!")

if __name__ == "__main__":
    run_test()
