"""Create database tables in Supabase via direct PostgreSQL connection."""

import psycopg2

# Supabase direct connection
conn = psycopg2.connect(
    host="db.yquqkoeptxqgfaiatstk.supabase.co",
    port=5432,
    dbname="postgres",
    user="postgres",
    password="RamanSir1234@",
    sslmode="require",
)
conn.autocommit = True
cur = conn.cursor()

# Read and execute the SQL file
with open("scripts/init_db.sql", "r") as f:
    sql = f.read()

print("Executing SQL schema...")
cur.execute(sql)
print("Database tables created successfully!")

# Verify tables exist
cur.execute("""
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('sales_data', 'product_catalog', 'refresh_log')
    ORDER BY table_name;
""")
tables = cur.fetchall()
print("Tables found:", [t[0] for t in tables])

# Check columns of sales_data
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'sales_data' ORDER BY ordinal_position;
""")
cols = cur.fetchall()
print(f"sales_data columns ({len(cols)}):")
for name, dtype in cols:
    print(f"  {name}: {dtype}")

cur.close()
conn.close()
print("\nDone!")
