-- ============================================
-- Amazon Sales Data - Supabase Database Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================

-- Main sales data table (column names match combined2.xlsx headers exactly)
CREATE TABLE IF NOT EXISTS sales_data (
    id BIGSERIAL PRIMARY KEY,
    "Date" TEXT,
    "Year" INTEGER,
    "Month_Num" INTEGER,
    "Month_Name" TEXT,
    "Month_Year" TEXT,
    "Quarter" INTEGER,
    "Quarter_Name" TEXT,
    "Business" TEXT,
    "Invoice Number" TEXT,
    "Invoice Date" TEXT,
    "Transaction Type" TEXT,
    "Order Id" TEXT,
    "Quantity" INTEGER,
    "BRAND" TEXT,
    "Item Description" TEXT,
    "Asin" TEXT,
    "Sku" TEXT,
    "Category" TEXT,
    "Segment" TEXT,
    "Ship To City" TEXT,
    "Ship To State" TEXT,
    "Ship To Country" TEXT,
    "Ship To Postal Code" TEXT,
    "Invoice Amount" NUMERIC,
    "Principal Amount" NUMERIC,
    "Warehouse Id" TEXT,
    "Customer Bill To Gstid" TEXT,
    "Buyer Name" TEXT,
    "Source" TEXT,
    "Channel" TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for Power BI query performance
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_data ("Date");
CREATE INDEX IF NOT EXISTS idx_sales_year ON sales_data ("Year");
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales_data ("Channel");
CREATE INDEX IF NOT EXISTS idx_sales_business ON sales_data ("Business");
CREATE INDEX IF NOT EXISTS idx_sales_brand ON sales_data ("BRAND");
CREATE INDEX IF NOT EXISTS idx_sales_category ON sales_data ("Category");
CREATE INDEX IF NOT EXISTS idx_sales_tx_type ON sales_data ("Transaction Type");
CREATE INDEX IF NOT EXISTS idx_sales_order_id ON sales_data ("Order Id");
CREATE INDEX IF NOT EXISTS idx_sales_asin ON sales_data ("Asin");
CREATE INDEX IF NOT EXISTS idx_sales_source ON sales_data ("Source");

-- Composite index for common Power BI filters
CREATE INDEX IF NOT EXISTS idx_sales_date_channel ON sales_data ("Date", "Channel");
CREATE INDEX IF NOT EXISTS idx_sales_year_business ON sales_data ("Year", "Business");

-- Product catalog for ASIN/SKU -> BRAND, Category, Segment mapping
CREATE TABLE IF NOT EXISTS product_catalog (
    id BIGSERIAL PRIMARY KEY,
    asin TEXT UNIQUE NOT NULL,
    sku TEXT,
    brand TEXT,
    item_description TEXT,
    category TEXT,
    segment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_asin ON product_catalog (asin);
CREATE INDEX IF NOT EXISTS idx_product_sku ON product_catalog (sku);

-- Refresh log to track SP-API calls
CREATE TABLE IF NOT EXISTS refresh_log (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'in_progress',
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    error_message TEXT,
    report_type TEXT,
    date_range_start TEXT,
    date_range_end TEXT
);

-- Row Level Security - permissive policies for API access
ALTER TABLE sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sales_data" ON sales_data
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to product_catalog" ON product_catalog
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to refresh_log" ON refresh_log
    FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sales_data_updated_at
    BEFORE UPDATE ON sales_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_catalog_updated_at
    BEFORE UPDATE ON product_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
