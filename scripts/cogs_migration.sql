-- ============================================
-- COGS & Profitability Tables - Supabase Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================

-- 1) COGS table - Cost of Goods Sold per SKU
CREATE TABLE IF NOT EXISTS cogs (
    id BIGSERIAL PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    product_name TEXT,

    -- Import pricing
    import_price NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'EUR', 'INR')),
    exchange_rate NUMERIC DEFAULT 1,
    import_price_inr NUMERIC GENERATED ALWAYS AS (import_price * exchange_rate) STORED,

    -- Custom duty
    custom_duty_pct NUMERIC DEFAULT 0,
    custom_duty_amt NUMERIC GENERATED ALWAYS AS (import_price * exchange_rate * custom_duty_pct / 100) STORED,

    -- GST on import
    gst1_pct NUMERIC DEFAULT 0,
    gst1_amt NUMERIC GENERATED ALWAYS AS (
        (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
    ) STORED,

    -- Shipping cost per unit
    shipping_cost NUMERIC DEFAULT 0,

    -- Landed cost = import_price_inr + custom_duty + gst1 + shipping
    landed_cost NUMERIC GENERATED ALWAYS AS (
        import_price * exchange_rate
        + import_price * exchange_rate * custom_duty_pct / 100
        + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
        + shipping_cost
    ) STORED,

    -- JH Margin
    margin1_pct NUMERIC DEFAULT 0,
    margin1_amt NUMERIC GENERATED ALWAYS AS (
        (
            import_price * exchange_rate
            + import_price * exchange_rate * custom_duty_pct / 100
            + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
            + shipping_cost
        ) * margin1_pct / 100
    ) STORED,

    -- Halte cost price = landed_cost + margin1
    halte_cost_price NUMERIC GENERATED ALWAYS AS (
        (
            import_price * exchange_rate
            + import_price * exchange_rate * custom_duty_pct / 100
            + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
            + shipping_cost
        ) * (1 + margin1_pct / 100)
    ) STORED,

    -- Marketing & Halte margin
    marketing_cost NUMERIC DEFAULT 0,
    margin2_pct NUMERIC DEFAULT 0,
    margin2_amt NUMERIC GENERATED ALWAYS AS (
        (
            (
                import_price * exchange_rate
                + import_price * exchange_rate * custom_duty_pct / 100
                + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
                + shipping_cost
            ) * (1 + margin1_pct / 100)
        ) * margin2_pct / 100
    ) STORED,

    -- Selling price = halte_cost_price + marketing + margin2
    selling_price NUMERIC GENERATED ALWAYS AS (
        (
            (
                import_price * exchange_rate
                + import_price * exchange_rate * custom_duty_pct / 100
                + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
                + shipping_cost
            ) * (1 + margin1_pct / 100)
        ) * (1 + margin2_pct / 100)
        + marketing_cost
    ) STORED,

    -- GST on selling
    gst2_pct NUMERIC DEFAULT 0,
    gst2_amt NUMERIC GENERATED ALWAYS AS (
        (
            (
                (
                    import_price * exchange_rate
                    + import_price * exchange_rate * custom_duty_pct / 100
                    + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
                    + shipping_cost
                ) * (1 + margin1_pct / 100)
            ) * (1 + margin2_pct / 100)
            + marketing_cost
        ) * gst2_pct / 100
    ) STORED,

    -- MSP = selling_price + gst2
    msp NUMERIC GENERATED ALWAYS AS (
        (
            (
                (
                    import_price * exchange_rate
                    + import_price * exchange_rate * custom_duty_pct / 100
                    + (import_price * exchange_rate + import_price * exchange_rate * custom_duty_pct / 100) * gst1_pct / 100
                    + shipping_cost
                ) * (1 + margin1_pct / 100)
            ) * (1 + margin2_pct / 100)
            + marketing_cost
        ) * (1 + gst2_pct / 100)
    ) STORED,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for COGS
CREATE INDEX IF NOT EXISTS idx_cogs_sku ON cogs (sku);

-- 2) Shipments table - shipping costs per order
CREATE TABLE IF NOT EXISTS shipments (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL,
    sku TEXT,
    shipping_cost NUMERIC DEFAULT 0,
    carrier TEXT,
    tracking_number TEXT,
    shipped_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_sku ON shipments (sku);

-- 3) Row Level Security
ALTER TABLE cogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cogs" ON cogs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to shipments" ON shipments
    FOR ALL USING (true) WITH CHECK (true);

-- 4) Auto-update triggers
CREATE TRIGGER update_cogs_updated_at
    BEFORE UPDATE ON cogs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at
    BEFORE UPDATE ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
