-- ============================================================
-- Migration 004: COGS Enhancements
-- Purpose: Add article_number and platform_fee_pct to cogs
-- ============================================================

ALTER TABLE cogs ADD COLUMN IF NOT EXISTS article_number TEXT;
ALTER TABLE cogs ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC DEFAULT 15.0;
