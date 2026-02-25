import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from supabase import create_client
import psycopg2

sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

# 1. Total count
r = sb.table("sales_data").select("id", count="exact").limit(1).execute()
print(f"Total sales_data rows: {r.count}")

r2 = sb.table("product_catalog").select("id", count="exact").limit(1).execute()
print(f"Total product_catalog rows: {r2.count}")

# 2. Sample rows
r3 = sb.table("sales_data").select("*").limit(2).execute()
for row in r3.data:
    print("\n--- Sample Row ---")
    for k, v in row.items():
        print(f"  {k}: {v!r} ({type(v).__name__})")

# 3. Direct SQL checks
conn = psycopg2.connect(
    host="db.yquqkoeptxqgfaiatstk.supabase.co", port=5432,
    dbname="postgres", user="postgres", password="RamanSir1234@", sslmode="require"
)
cur = conn.cursor()

# Distinct states
cur.execute('SELECT DISTINCT "Ship To State" FROM sales_data WHERE "Ship To State" IS NOT NULL ORDER BY 1')
states = [r[0] for r in cur.fetchall()]
print(f"\nDistinct states in DB: {len(states)}")
for s in states:
    print(f"  {s}")

# Uppercase checks
for col in ["Ship To State", "Business", "Channel", "Source", "Transaction Type", "BRAND"]:
    cur.execute(f"""SELECT COUNT(*) FROM sales_data WHERE "{col}" ~ '[A-Z]'""")
    count = cur.fetchone()[0]
    print(f"Uppercase in '{col}': {count}")

# Type samples
cur.execute('SELECT "Year", "Month_Num", "Quarter", "Quantity", "Invoice Amount", "Ship To Postal Code", "Date" FROM sales_data LIMIT 5')
print("\nType samples:")
for row in cur.fetchall():
    print(f"  Year={row[0]}, Month_Num={row[1]}, Quarter={row[2]}, Qty={row[3]}, Amt={row[4]}, Postal={row[5]}, Date={row[6]}")

# Null checks
for col in ["Ship To State", "Date", "Year", "Quantity", "Source", "Channel"]:
    cur.execute(f"""SELECT COUNT(*) FROM sales_data WHERE "{col}" IS NULL""")
    count = cur.fetchone()[0]
    print(f"Nulls in '{col}': {count}")

cur.close()
conn.close()
print("\nVerification complete!")
