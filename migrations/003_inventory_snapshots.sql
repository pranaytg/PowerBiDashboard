-- ============================================================
-- Migration 003: Inventory Snapshots
-- Purpose: Store daily FBA inventory levels per SKU from
--          SP-API GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA
--          report. Used by the advanced forecasting engine.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id                     bigserial PRIMARY KEY,
    snapshot_date          date NOT NULL DEFAULT CURRENT_DATE,
    sku                    text NOT NULL,
    fnsku                  text,
    asin                   text,
    product_name           text,
    fulfillable_quantity   int DEFAULT 0,
    inbound_quantity       int DEFAULT 0,
    reserved_quantity      int DEFAULT 0,
    unfulfillable_quantity int DEFAULT 0,
    total_quantity         int DEFAULT 0,
    UNIQUE(snapshot_date, sku)
);

-- Indexes for forecasting queries
CREATE INDEX IF NOT EXISTS idx_inv_snap_sku      ON inventory_snapshots(sku);
CREATE INDEX IF NOT EXISTS idx_inv_snap_date     ON inventory_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_snap_sku_date ON inventory_snapshots(sku, snapshot_date DESC);

ANALYZE inventory_snapshots;
