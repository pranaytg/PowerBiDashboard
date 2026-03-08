-- ============================================================
-- Migration 002: Performance Indexes
-- Purpose: Add optimized indexes to all tables based on
--          actual query patterns used by both the FastAPI
--          backend and Next.js frontend API routes.
-- ============================================================

-- =========================
-- sales_data  (main table, 30k+ rows)
-- =========================

-- Single-column indexes for individual filter predicates
CREATE INDEX IF NOT EXISTS idx_sales_data_date         ON sales_data ("Date");
CREATE INDEX IF NOT EXISTS idx_sales_data_year         ON sales_data ("Year");
CREATE INDEX IF NOT EXISTS idx_sales_data_channel      ON sales_data ("Channel");
CREATE INDEX IF NOT EXISTS idx_sales_data_business     ON sales_data ("Business");
CREATE INDEX IF NOT EXISTS idx_sales_data_brand        ON sales_data ("BRAND");
CREATE INDEX IF NOT EXISTS idx_sales_data_category     ON sales_data ("Category");
CREATE INDEX IF NOT EXISTS idx_sales_data_txn_type     ON sales_data ("Transaction Type");
CREATE INDEX IF NOT EXISTS idx_sales_data_source       ON sales_data ("Source");
CREATE INDEX IF NOT EXISTS idx_sales_data_sku          ON sales_data ("Sku");
CREATE INDEX IF NOT EXISTS idx_sales_data_asin         ON sales_data ("Asin");
CREATE INDEX IF NOT EXISTS idx_sales_data_order_id     ON sales_data ("Order Id");
CREATE INDEX IF NOT EXISTS idx_sales_data_ship_state   ON sales_data ("Ship To State");

-- Composite indexes for the most common combined query patterns:

-- 1. Almost every frontend query starts with `WHERE "Transaction Type" != 'return'`
--    combined with ORDER BY id DESC  →  covers the hot path
CREATE INDEX IF NOT EXISTS idx_sales_data_txn_id_desc
    ON sales_data ("Transaction Type", id DESC);

-- 2. Date-range + transaction type (dashboard date filtering)
CREATE INDEX IF NOT EXISTS idx_sales_data_txn_date
    ON sales_data ("Transaction Type", "Date" DESC);

-- 3. Transaction type + SKU (profitability, inventory routes)
CREATE INDEX IF NOT EXISTS idx_sales_data_txn_sku
    ON sales_data ("Transaction Type", "Sku");

-- 4. Year + Month_Num (inventory forecasting monthly aggregation)
CREATE INDEX IF NOT EXISTS idx_sales_data_year_month
    ON sales_data ("Year", "Month_Num");

-- =========================
-- order_cogs_snapshot
-- =========================
-- Profitability route does: WHERE order_id IN (...) 
CREATE INDEX IF NOT EXISTS idx_cogs_snapshot_order
    ON order_cogs_snapshot (order_id);

-- =========================
-- cogs
-- =========================
-- Lookup by SKU in profitability calculations
CREATE INDEX IF NOT EXISTS idx_cogs_sku
    ON cogs (sku);

-- =========================
-- shipments
-- =========================
-- JOIN on order_id for profitability route
CREATE INDEX IF NOT EXISTS idx_shipments_order
    ON shipments (order_id);

-- =========================
-- Analyze all tables so the planner uses the new indexes
-- =========================
ANALYZE sales_data;
ANALYZE financial_events;
ANALYZE returns;
ANALYZE order_cogs_snapshot;
ANALYZE cogs;
ANALYZE shipments;
