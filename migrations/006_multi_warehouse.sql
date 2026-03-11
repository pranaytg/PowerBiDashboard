-- ============================================================
-- Migration 006: Multi-Warehouse & Forecasting
-- Purpose: Support multi-warehouse supply sources, local
--          inventory deductions, and historical sales velocity
--          for custom weighted average forecasting.
-- ============================================================

-- Table for Warehouses (Supply Sources)
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_source_id text UNIQUE NOT NULL,
    alias text NOT NULL,
    lead_time_days int DEFAULT 14,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for Local Inventory per Warehouse
CREATE TABLE IF NOT EXISTS local_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    sku text NOT NULL,
    quantity_on_hand int DEFAULT 0,
    quantity_reserved int DEFAULT 0,  -- Unshipped orders
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(warehouse_id, sku)
);

-- Table for Historical Sales Velocity (Aggregated from Orders/Reports API)
CREATE TABLE IF NOT EXISTS historical_sales_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL,
    sku text NOT NULL,
    units_sold int DEFAULT 0,
    UNIQUE(date, sku)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_local_inventory_sku ON local_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_historical_velocity_sku ON historical_sales_velocity(sku);
CREATE INDEX IF NOT EXISTS idx_historical_velocity_date ON historical_sales_velocity(date DESC);

ANALYZE warehouses;
ANALYZE local_inventory;
ANALYZE historical_sales_velocity;
