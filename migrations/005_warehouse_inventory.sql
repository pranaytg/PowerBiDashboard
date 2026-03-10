-- ============================================================
-- Migration 005: Warehouse Inventory Snapshots
-- Purpose: Store daily FBA inventory levels per warehouse
--          (fulfillment_center_id) per SKU from SP-API.
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouse_inventory_snapshots (
    id                    bigserial PRIMARY KEY,
    snapshot_date         date NOT NULL DEFAULT CURRENT_DATE,
    sku                   text NOT NULL,
    fnsku                 text,
    asin                  text,
    fulfillment_center_id text NOT NULL,
    quantity              int DEFAULT 0,
    condition             text,
    UNIQUE(snapshot_date, sku, fulfillment_center_id, condition)
);

-- Indexes for quick lookup
CREATE INDEX IF NOT EXISTS idx_wh_inv_sku  ON warehouse_inventory_snapshots(sku);
CREATE INDEX IF NOT EXISTS idx_wh_inv_date ON warehouse_inventory_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_wh_inv_fc   ON warehouse_inventory_snapshots(fulfillment_center_id);

ANALYZE warehouse_inventory_snapshots;
