import asyncio
import logging
from app.services.sp_api_service import SPAPIService
from datetime import datetime

logging.basicConfig(level=logging.DEBUG)

def main():
    service = SPAPIService()
    try:
        res = service.fetch_orders(start_date="2026-02-28", end_date="2026-03-09")
        print(f"Success, fetched {len(res)} orders")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
