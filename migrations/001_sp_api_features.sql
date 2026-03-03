-- Create financial_events table
CREATE TABLE IF NOT EXISTS financial_events (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL,
    posted_date TEXT,
    sku TEXT DEFAULT '',
    asin TEXT DEFAULT '',
    quantity INTEGER DEFAULT 0,
    event_type TEXT DEFAULT 'Shipment',  -- Shipment or Refund
    total_charges NUMERIC DEFAULT 0,
    total_fees NUMERIC DEFAULT 0,
    net_amount NUMERIC DEFAULT 0,
    charge_principal NUMERIC DEFAULT 0,
    charge_tax NUMERIC DEFAULT 0,
    fee_commission NUMERIC DEFAULT 0,
    fee_fba_fees NUMERIC DEFAULT 0,
    fee_shipping_charge_back NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(order_id, sku, event_type)
);

-- Create returns table
CREATE TABLE IF NOT EXISTS returns (
    id BIGSERIAL PRIMARY KEY,
    return_date TEXT,
    order_id TEXT NOT NULL,
    sku TEXT DEFAULT '',
    asin TEXT DEFAULT '',
    fnsku TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    quantity INTEGER DEFAULT 0,
    fulfillment_center_id TEXT DEFAULT '',
    detailed_disposition TEXT DEFAULT '',
    reason TEXT DEFAULT '',
    status TEXT DEFAULT '',
    license_plate_number TEXT DEFAULT '',
    customer_comments TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(order_id, sku, return_date)
);

-- Add title and image_url columns to product_catalog if not exist
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_financial_events_order ON financial_events(order_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_date ON financial_events(posted_date);
CREATE INDEX IF NOT EXISTS idx_financial_events_type ON financial_events(event_type);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(return_date);
CREATE INDEX IF NOT EXISTS idx_returns_sku ON returns(sku);
