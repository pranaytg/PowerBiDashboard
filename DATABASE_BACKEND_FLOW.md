# System Architecture: Database & Backend Data Flow

This document details how the Python (FastAPI) backend interacts with the Supabase Postgres database, specifically concerning Amazon SP-API data ingestion and the UI data-fetching layer.

## 1. Database Connection Layer
- **File:** `app/database.py`
- **Method:** Uses the official `supabase-py` client library.
- **Environment Variables:** Needs `SUPABASE_URL` and `SUPABASE_KEY` (service role key strongly recommended for backend upserts, bypassing RLS).
- **Core Singleton:** `get_supabase_client()` creates and caches the `Client` instance to be used across the application.

## 2. Abstraction Layer (SupabaseService)
- **File:** `app/services/supabase_service.py`
- **Purpose:** All raw database queries, inserts, and upserts from the backend happen here. This prevents SQL or Supabase-specific logic from leaking into routing or business logic.
- **Batching:** Methods like `upsert_sales_batch`, `upsert_finances_batch`, `upsert_returns_batch`, etc., process inserts in chunks (defined by `BATCH_SIZE = 500`) to prevent request payload limits or timeout errors on large sync operations.
- **Query Types:**
  - `upsert` with `on_conflict` constraint targeting unique keys (e.g., `Order Id,Invoice Number,Asin,Transaction Type` for Sales).
  - `.execute()` returns data and `.count`.

## 3. Data Sync Orchestration (The Global Refresh)
- **File:** `app/routers/refresh.py`
- **Endpoint:** `POST /api/v1/refresh`
- **Flow:**
  1. The API receives a refresh request (either specifying dates or defaulting to the last sync date).
  2. A new `refresh_log` entry is created in Supabase (`status: in_progress`).
  3. The `_run_refresh` function is pushed to FastAPI's `BackgroundTasks`.
  4. **The Synchronous Pipeline (`_run_refresh`)**:
     - Fetches ASIN catalog (`service.get_product_catalog()`).
     - `sp_api.fetch_orders_with_items()` -> transforms rows -> `service.upsert_sales_batch()`.
     - `sp_api.fetch_financial_events()` -> `service.upsert_finances_batch()`.
     - `sp_api.fetch_returns_report()` -> `service.upsert_returns_batch()`.
     - `sp_api.fetch_inventory_report()` -> `service.upsert_inventory_snapshots_batch()`.
     - `sp_api.fetch_warehouse_inventory_report()` -> `service.upsert_warehouse_inventory_batch()`.
  5. The `refresh_log` is updated to `completed_with_errors` or `completed` along with the metrics.
  6. Backend in-memory caches are invalidated using `app.cache.invalidate_all()`.

## 4. Frontend API Data Consumers
- While the Python backend handles ingestion, the Next.js frontend fetches directly from Supabase for analytical dashboards using raw `pg` queries (via `frontend/src/lib/db.ts`).
- **Query Structure:** The frontend APIs (e.g., `frontend/src/app/api/inventory/route.ts` and `sales/route.ts`) execute read-only SQL queries to join and group tables.
- **Rationale:** Writing direct, high-performance Postgres SQL queries in Next.js is faster for aggregations (like Holt-Winters forecasting) compared to routing all aggregations through FastAPI Supabase ORM methods.

## 5. Main Tables Dictionary
1. `sales_data`: Main table containing all MTR line items, joined with orders and item details.
2. `product_catalog`: Maps internal SKUs to ASINs, Brands, Categories.
3. `financial_events`: Contains fee breakdown (FBA fees, shipping back, commissions).
4. `returns`: FBA Return details, statuses, and customer comments.
5. `inventory_snapshots`: Daily records summing up fulfillable, reserved, and inbound stock per SKU globally.
6. `warehouse_inventory_snapshots`: Daily records breaking down stock per Fulfillment Center (FC).

*Note: AI assistants reading this file should look at `app/services/supabase_service.py` before modifying any database interactions on the backend.*
