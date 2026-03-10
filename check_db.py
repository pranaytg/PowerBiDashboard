import asyncio
from app.database import get_supabase_client

def check():
    db = get_supabase_client()
    tables = [
        "sales_data", "financial_events", "returns", 
        "inventory_snapshots", "warehouse_inventory_snapshots", "product_catalog"
    ]
    for t in tables:
        try:
            res = db.table(t).select("count", count="exact").limit(1).execute()
            print(f"Table {t.ljust(30)} count: {res.count}")
        except Exception as e:
            print(f"Table {t.ljust(30)} Error: {e}")

if __name__ == "__main__":
    check()
