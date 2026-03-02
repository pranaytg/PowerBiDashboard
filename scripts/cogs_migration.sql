-- 1. Table for global COGS settings per SKU
CREATE TABLE IF NOT EXISTS public.cogs (
    id BIGSERIAL PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    product_name TEXT,
    
    -- Inputs
    import_price NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    exchange_rate NUMERIC DEFAULT 1,
    custom_duty_pct NUMERIC DEFAULT 0,
    gst1_pct NUMERIC DEFAULT 18,
    shipping_cost NUMERIC DEFAULT 0,
    margin1_pct NUMERIC DEFAULT 0,
    marketing_cost NUMERIC DEFAULT 0,
    margin2_pct NUMERIC DEFAULT 0,
    gst2_pct NUMERIC DEFAULT 18,
    
    -- Auto-computed fields (Generated stored columns in Postgres)
    import_price_inr NUMERIC GENERATED ALWAYS AS (import_price * exchange_rate) STORED,
    custom_duty_amt NUMERIC GENERATED ALWAYS AS ((import_price * exchange_rate) * (custom_duty_pct / 100)) STORED,
    gst1_amt NUMERIC GENERATED ALWAYS AS (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) STORED,
    landed_cost NUMERIC GENERATED ALWAYS AS ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) STORED,
    
    margin1_amt NUMERIC GENERATED ALWAYS AS (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100)) STORED,
    halte_cost_price NUMERIC GENERATED ALWAYS AS (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))) STORED,
    
    margin2_amt NUMERIC GENERATED ALWAYS AS (
        (
            ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
        ) * (margin2_pct / 100)
    ) STORED,
    
    selling_price NUMERIC GENERATED ALWAYS AS (
        (
            ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
        ) + marketing_cost + 
        (
            (
                ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
            ) * (margin2_pct / 100)
        )
    ) STORED,
    
    gst2_amt NUMERIC GENERATED ALWAYS AS (
        (
            (
                ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
            ) + marketing_cost + 
            (
                (
                    ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
                ) * (margin2_pct / 100)
            )
        ) * (gst2_pct / 100)
    ) STORED,
    
    msp NUMERIC GENERATED ALWAYS AS (
        (
            (
                ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
            ) + marketing_cost + 
            (
                (
                    ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
                ) * (margin2_pct / 100)
            )
        ) + 
        (
            (
                (
                    ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
                ) + marketing_cost + 
                (
                    (
                        ((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100)) + (((import_price * exchange_rate) + ((import_price * exchange_rate) * (custom_duty_pct / 100))) * (gst1_pct / 100)) + shipping_cost) * (margin1_pct / 100))
                    ) * (margin2_pct / 100)
                )
            ) * (gst2_pct / 100)
        )
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Shipments table for per-order shipping costs
CREATE TABLE IF NOT EXISTS public.shipments (
    id BIGSERIAL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    sku TEXT,
    shipping_cost NUMERIC DEFAULT 0,
    carrier TEXT,
    tracking_number TEXT,
    shipped_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Snapshotted COGS table to make order profitability immutable
CREATE TABLE IF NOT EXISTS public.order_cogs_snapshot (
    order_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    landed_cost NUMERIC NOT NULL,
    halte_cost_price NUMERIC NOT NULL,
    shipping_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (order_id, sku)
);

-- Add update triggers
CREATE OR REPLACE FUNCTION update_cogs_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_cogs_modtime ON public.cogs;
CREATE TRIGGER update_cogs_modtime BEFORE UPDATE ON public.cogs FOR EACH ROW EXECUTE PROCEDURE update_cogs_modified_column();

DROP TRIGGER IF EXISTS update_shipments_modtime ON public.shipments;
CREATE TRIGGER update_shipments_modtime BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE PROCEDURE update_cogs_modified_column();

-- Enable Row Level Security (RLS) but allow anonymous access since this is internal dashboard
ALTER TABLE public.cogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_cogs_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to cogs" ON public.cogs;
CREATE POLICY "Allow all access to cogs" ON public.cogs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to shipments" ON public.shipments;
CREATE POLICY "Allow all access to shipments" ON public.shipments FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to order snapshots" ON public.order_cogs_snapshot;
CREATE POLICY "Allow all access to order snapshots" ON public.order_cogs_snapshot FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cogs_sku ON public.cogs(sku);
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_order_id ON public.order_cogs_snapshot(order_id);
