import asyncio
from app.services.sp_api_service import SPAPIService
import logging

logging.basicConfig(level=logging.INFO)

async def test_orders():
    sp_api = SPAPIService()
    try:
        # trying the exact date range that failed
        orders = sp_api.fetch_orders_with_items("2026-02-28", "2026-03-09")
        print(f"Success! Fetched {len(orders)} orders.")
    except Exception as e:
        print(f"Error fetching orders: {e}")

if __name__ == "__main__":
    asyncio.run(test_orders())
