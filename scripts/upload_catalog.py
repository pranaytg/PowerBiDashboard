import os, sys
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from supabase import create_client

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

df = pd.read_excel(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "combined2.xlsx"),
    sheet_name="Combined Data", engine="openpyxl"
)

catalog = []
seen = set()
for _, row in df.iterrows():
    sku = str(row.get("Sku", "")).strip().lower() if pd.notna(row.get("Sku")) else None
    if not sku or sku in seen:
        continue
    seen.add(sku)
    asin = str(row.get("Asin", "")).strip().lower() if pd.notna(row.get("Asin")) else None
    brand = str(row.get("BRAND", "")).strip().lower() if pd.notna(row.get("BRAND")) else None
    desc = str(row.get("Item Description", "")).strip().lower() if pd.notna(row.get("Item Description")) else None
    cat = str(row.get("Category", "")).strip().lower() if pd.notna(row.get("Category")) else None
    seg = str(row.get("Segment", "")).strip().lower() if pd.notna(row.get("Segment")) else None
    catalog.append({"sku": sku, "asin": asin, "item_description": desc, "brand": brand, "category": cat, "segment": seg})

print(f"Unique SKUs: {len(catalog)}")

BATCH = 500
uploaded = 0
for i in range(0, len(catalog), BATCH):
    batch = catalog[i:i+BATCH]
    try:
        supabase.table("product_catalog").insert(batch).execute()
        uploaded += len(batch)
    except Exception as e:
        print(f"Batch {i} error: {e}")
        for rec in batch:
            try:
                supabase.table("product_catalog").insert(rec).execute()
                uploaded += 1
            except Exception as e2:
                sku_val = rec.get("sku", "?")
                print(f"  Skip {sku_val}: {e2}")

print(f"Uploaded: {uploaded}/{len(catalog)}")
result = supabase.table("product_catalog").select("id", count="exact").limit(1).execute()
print(f"Final count: {result.count}")
