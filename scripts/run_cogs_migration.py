"""Run COGS migration on Supabase."""

import psycopg2

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

with open("scripts/cogs_migration.sql", "r") as f:
    sql = f.read()

print("Executing COGS migration SQL...")
cur.execute(sql)
print("COGS tables and functions created successfully!")

cur.execute("""
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('cogs', 'shipments')
    ORDER BY table_name;
""")
tables = cur.fetchall()
print("Tables found:", [t[0] for t in tables])

cur.close()
conn.close()
print("\nDone!")
