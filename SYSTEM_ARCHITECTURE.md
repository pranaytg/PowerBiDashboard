# QnA Analytics — Complete System Architecture & Reference

> **Purpose**: This document is the definitive reference for any developer (human or AI) working on this codebase. It describes every component, data flow, file, table, endpoint, environment variable, and operational behavior in extreme detail. If context is lost, READ THIS FIRST.

---

## 1. What This App Does

**QnA Analytics** is a monorepo analytics dashboard for **JH-Halte** — a brand that sells products on **Amazon India** (marketplace ID: `A21TJRUUN4KGV`). The app:

1. **Fetches** sales order data from Amazon's SP-API (Selling Partner API) via the Orders API
2. **Stores** that data in a **Supabase** (hosted PostgreSQL) database
3. **Displays** the data in a Next.js dashboard with charts, KPIs, and multiple analysis pages
4. **Calculates** profitability by joining sales data with COGS (Cost of Goods Sold) and shipment costs
5. **Forecasts** inventory demand using Holt-Winters triple exponential smoothing

The business has two entities:
- **JH** (manufacturer) — imports goods, adds margin → sells to Halte at a transfer price ("Halte Cost Price")
- **Halte** (retailer) — sells on Amazon at invoice price, pays for shipping and Amazon fees

---

## 2. Repository Structure & File-by-File Reference

```
qna/                              ← Root (GitHub: pranaytg/PowerBiDashboard)
├── app/                          ← FastAPI backend (Python 3.12)
│   ├── __init__.py               ← Package marker
│   ├── main.py                   ← App factory: CORS, middleware, lifespan, routers, health, cache endpoints
│   ├── config.py                 ← pydantic-settings: loads .env, exposes Settings singleton
│   ├── database.py               ← Supabase client singleton (lru_cache)
│   ├── cache.py                  ← In-memory TTL cache using cachetools (thread-safe, LRU-bounded)
│   ├── models.py                 ← Pydantic models: SalesRecord, SalesResponse, SalesFilters, RefreshRequest, etc.
│   ├── scheduler.py              ← APScheduler: (1) self-ping /health every 13 min, (2) daily refresh at 7 PM IST
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── sales.py              ← /api/v1/sales (GET paginated + filters), /count, /filters, /summary — ALL CACHED
│   │   ├── refresh.py            ← POST /api/v1/refresh (triggers SP-API fetch in background), GET /status, /history
│   │   └── sp_data.py            ← /api/v1/catalog, /finances, /returns — GET cached, POST /sync uncached
│   └── services/
│       ├── __init__.py
│       ├── sp_api_service.py     ← Amazon SP-API client: Orders API, Reports API (GST MTR), Finances, Returns, Catalog
│       ├── supabase_service.py   ← Supabase CRUD: get_sales, insert/upsert batches, distinct values, refresh log
│       └── data_processor.py     ← Transform raw SP-API rows → DB schema (orders + MTR formats)
│
├── frontend/                     ← Next.js 16 (App Router, React 19)
│   ├── src/
│   │   ├── middleware.ts         ← Auth guard: checks "admin_session" cookie on every route except /login, /api/auth/*
│   │   ├── app/
│   │   │   ├── layout.tsx        ← Root layout with Navbar
│   │   │   ├── globals.css       ← Dark theme CSS: glassmorphism, animations, CSS variables
│   │   │   ├── page.tsx          ← MAIN DASHBOARD: fetches /api/profitability?per_page=50000 + /api/sales?per_page=1
│   │   │   │                        7 KPI cards, monthly trend (AreaChart), state/SKU bar charts, pie charts
│   │   │   │                        "Sync Amazon" button calls /api/sync then polls for completion
│   │   │   ├── login/page.tsx    ← Login form → POST /api/auth/login
│   │   │   ├── cogs/page.tsx     ← COGS management: add/edit/delete per SKU, auto-calculates landed cost → MSP
│   │   │   ├── profitability/page.tsx ← Order-level profit table with JH Profit + Halte Profit breakdown
│   │   │   ├── finances/page.tsx ← Financial events table (fees, charges from SP-API)
│   │   │   ├── returns/page.tsx  ← FBA returns table
│   │   │   ├── shipments/page.tsx ← Shipment cost tracking (manual entry per order)
│   │   │   ├── inventory/page.tsx ← AI inventory prediction: Holt-Winters forecast per SKU, 12-month projection
│   │   │   └── api/              ← ALL Next.js API routes (server-side, hit DB directly via pg)
│   │   │       ├── auth/
│   │   │       │   ├── login/route.ts    ← POST: validates email+password, sets httpOnly cookie
│   │   │       │   ├── logout/route.ts   ← POST: clears cookie
│   │   │       │   └── me/route.ts       ← GET: returns current session info
│   │   │       ├── sales/route.ts        ← GET: paginated sales_data with filters — 60s cache
│   │   │       ├── profitability/route.ts ← GET: joins sales + cogs + shipments + snapshots — 120s cache
│   │   │       ├── inventory/route.ts    ← GET: Holt-Winters forecasting per SKU — 300s cache
│   │   │       ├── finances/route.ts     ← GET: financial_events paginated — 120s cache
│   │   │       ├── returns/route.ts      ← GET: returns paginated — 120s cache
│   │   │       ├── skus/route.ts         ← GET: DISTINCT SKU list from sales_data — 300s cache
│   │   │       ├── cogs/route.ts         ← GET/POST/PUT/DELETE: CRUD on cogs table
│   │   │       ├── cogs/bulk/route.ts    ← POST: bulk upsert cogs
│   │   │       ├── shipments/route.ts    ← GET/POST/PUT/DELETE: CRUD on shipments table
│   │   │       └── sync/route.ts         ← POST: proxies to backend /api/v1/refresh; GET: proxies /api/v1/refresh/status
│   │   ├── lib/
│   │   │   ├── db.ts             ← PostgreSQL connection pool (pg): pool size 10, 30s idle timeout, SSL
│   │   │   ├── cache.ts          ← In-memory TTL cache: Map-based, bounded (256 entries), LRU eviction
│   │   │   ├── supabase.ts       ← Supabase JS client (used only for auth, NOT for data queries)
│   │   │   └── calculations.ts   ← COGS calculation formulas (import price → landed cost → MSP)
│   │   └── components/
│   │       └── Navbar.tsx        ← Navigation bar with links to all pages + logout button
│   ├── next.config.mjs           ← output: "standalone" for Render deployment
│   ├── package.json              ← Next.js 16, React 19, Recharts, pg, @supabase/supabase-js
│   └── .env.local                ← Frontend env vars (DATABASE_URL, admin creds, Supabase keys)
│
├── migrations/
│   ├── 001_sp_api_features.sql   ← Creates financial_events + returns tables, adds catalog columns
│   └── 002_performance_indexes.sql ← 16 indexes on sales_data + supporting table indexes + ANALYZE
│
├── scripts/                      ← Various utility scripts (Excel upload, data migration, etc.)
├── render.yaml                   ← Render Blueprint: 2 web services (backend Python + frontend Node)
├── Dockerfile                    ← Backend Docker image
├── Procfile                      ← Gunicorn start command for Render
├── requirements.txt              ← Python dependencies
├── .env                          ← Backend environment variables (local only)
└── SYSTEM_ARCHITECTURE.md        ← THIS FILE
```

---

## 3. Database Schema (Supabase PostgreSQL)

**Supabase Project**: `yquqkoeptxqgfaiatstk`  
**Region**: ap-south-1 (Mumbai)  
**Direct URL**: `postgresql://postgres:RamanSir1234%40@db.yquqkoeptxqgfaiatstk.supabase.co:5432/postgres`  
**Pooler URL (use on Render)**: `postgresql://postgres.yquqkoeptxqgfaiatstk:RamanSir1234%40@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`

### 3.1 `sales_data` — Main table (~30,000+ rows)

The primary data table. Each row = one line item from an Amazon order.

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `id` | bigserial PK | auto | |
| `Date` | text | SP-API PurchaseDate | Format: YYYY-MM-DD |
| `Year` | int | derived | |
| `Month_Num` | int | derived | 1–12 |
| `Month_Name` | text | derived | "January", "February", etc. |
| `Month_Year` | text | derived | "Jan-2025" |
| `Quarter` | int | derived | 1–4 |
| `Quarter_Name` | text | derived | "Q1", "Q2", etc. |
| `Business` | text | derived | "b2b" or "b2c" |
| `Invoice Number` | text | SP-API / MTR | |
| `Invoice Date` | text | SP-API | |
| `Transaction Type` | text | derived | "shipment" or "return" |
| `Order Id` | text | SP-API AmazonOrderId | e.g. "408-1234567-8901234" |
| `Quantity` | int | SP-API QuantityOrdered | |
| `BRAND` | text | product_catalog lookup | |
| `Item Description` | text | SP-API Title | |
| `Asin` | text | SP-API ASIN | e.g. "B09XYZ1234" |
| `Sku` | text | SP-API SellerSKU | |
| `Category` | text | product_catalog lookup | |
| `Segment` | text | product_catalog lookup | |
| `Ship To City` | text | SP-API ShippingAddress | |
| `Ship To State` | text | SP-API ShippingAddress | |
| `Ship To Country` | text | SP-API ShippingAddress | |
| `Ship To Postal Code` | text | SP-API ShippingAddress | |
| `Invoice Amount` | numeric | SP-API ItemPrice | |
| `Principal Amount` | numeric | SP-API ItemPrice.Amount | |
| `Warehouse Id` | text | SP-API FulfillmentCenter | |
| `Customer Bill To Gstid` | text | SP-API BuyerTaxInfo | |
| `Buyer Name` | text | SP-API BuyerName | |
| `Source` | text | derived | "Orders_API" or "GST_MTR_B2C"/"GST_MTR_B2B" |
| `Channel` | text | derived | "Amazon.in" |

**Unique constraint** (for upsert): `"Order Id", "Invoice Number", "Asin", "Transaction Type"`

**Indexes** (migration 002):
- 12 single-column indexes on all filter columns
- `idx_sales_data_txn_id_desc` — composite on `("Transaction Type", id DESC)` — HOT PATH
- `idx_sales_data_txn_date` — composite on `("Transaction Type", "Date" DESC)`
- `idx_sales_data_txn_sku` — composite on `("Transaction Type", "Sku")`
- `idx_sales_data_year_month` — composite on `("Year", "Month_Num")`

### 3.2 `product_catalog`

| Column | Type | Notes |
|--------|------|-------|
| `asin` | text PK | Unique product identifier |
| `brand` | text | |
| `category` | text | |
| `segment` | text | |
| `sku` | text | |
| `item_description` | text | |
| `title` | text | From Catalog API |
| `image_url` | text | From Catalog API |

### 3.3 `cogs` — Cost of Goods Sold configuration

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `sku` | text UNIQUE | Matches sales_data.Sku |
| `import_price` | numeric | Foreign currency (typically CNY) |
| `currency` | text | "CNY", "USD", etc. |
| `exchange_rate` | numeric | To INR |
| `import_price_inr` | numeric | COMPUTED: import_price × exchange_rate |
| `custom_duty_pct` | numeric | % of import_price_inr |
| `custom_duty_amt` | numeric | COMPUTED |
| `gst1_pct` | numeric | % of (import + duty) |
| `gst1_amt` | numeric | COMPUTED |
| `shipping_cost` | numeric | Per-unit shipping in INR |
| `landed_cost` | numeric | COMPUTED: import_inr + duty + gst1 + shipping |
| `margin1_pct` | numeric | JH margin % |
| `margin1_amt` | numeric | COMPUTED |
| `halte_cost_price` | numeric | COMPUTED: landed_cost + margin1 (transfer price JH → Halte) |
| `marketing_cost` | numeric | Per-unit marketing in INR |
| `margin2_pct` | numeric | Halte margin % |
| `margin2_amt` | numeric | COMPUTED |
| `selling_price` | numeric | COMPUTED: halte_cost + marketing + margin2 |
| `gst2_pct` | numeric | % of selling_price |
| `gst2_amt` | numeric | COMPUTED |
| `msp` | numeric | COMPUTED: selling_price + gst2 (Minimum Selling Price) |

### 3.4 `shipments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `order_id` | text | Matches sales_data."Order Id" |
| `sku` | text | |
| `shipping_cost` | numeric | |
| `carrier` | text | |
| `tracking_number` | text | |
| `shipped_date` | text | |

### 3.5 `order_cogs_snapshot`

Snapshots COGS values at the time of profitability calculation, so changes to COGS config don't retroactively change historical profit numbers.

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `order_id` | text | |
| `sku` | text | |
| `landed_cost` | numeric | Snapshot of cogs.landed_cost |
| `halte_cost_price` | numeric | Snapshot of cogs.halte_cost_price |
| `shipping_cost` | numeric | Snapshot of shipments.shipping_cost |

**Unique constraint**: `(order_id, sku)`

### 3.6 `financial_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `order_id` | text | |
| `posted_date` | text | |
| `sku` | text | |
| `asin` | text | |
| `quantity` | int | |
| `event_type` | text | "Shipment" or "Refund" |
| `total_charges` | numeric | |
| `total_fees` | numeric | |
| `net_amount` | numeric | |
| `charge_principal` | numeric | |
| `charge_tax` | numeric | |
| `fee_commission` | numeric | Amazon commission |
| `fee_fba_fees` | numeric | FBA fulfillment fee |
| `fee_shipping_charge_back` | numeric | |

**Unique constraint**: `(order_id, sku, event_type)`

### 3.7 `returns`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `return_date` | text | |
| `order_id` | text | |
| `sku` / `asin` / `fnsku` | text | Product identifiers |
| `product_name` | text | |
| `quantity` | int | |
| `fulfillment_center_id` | text | |
| `detailed_disposition` | text | |
| `reason` | text | Return reason |
| `status` | text | |

**Unique constraint**: `(order_id, sku, return_date)`

### 3.8 `refresh_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `started_at` | timestamptz | auto |
| `completed_at` | timestamptz | set on completion |
| `status` | text | "in_progress", "completed", "completed_with_errors", "failed" |
| `records_fetched` | int | |
| `records_inserted` | int | |
| `records_updated` | int | |
| `error_message` | text | |
| `report_type` | text | "ORDERS", "B2C", "B2B" |
| `date_range_start` | text | |
| `date_range_end` | text | |

---

## 4. Data Flow — How Data Gets From Amazon to the Dashboard

### 4.1 Automatic Daily Refresh (Backend)

```
APScheduler (scheduler.py)
  │
  │ CronTrigger: 7 PM IST daily
  ▼
POST {SELF_BASE_URL}/api/v1/refresh
  │  body: {"report_types": ["ORDERS"]}
  ▼
refresh.py → _run_refresh() [background task]
  │
  ├── 1. Load product_catalog from Supabase → build {asin: {brand, category, ...}} map
  │
  ├── 2. Call sp_api_service.fetch_orders_with_items(start_date, end_date)
  │     └── Uses python-amazon-sp-api library
  │     └── Fetches ALL orders in date range, then fetches order items per order
  │     └── Extracts: order_id, ASIN, SKU, quantity, price, shipping address, etc.
  │
  ├── 3. Transform each raw order via data_processor.transform_sp_api_orders_row()
  │     └── Maps SP-API fields → DB column names (matching combined2.xlsx headers)
  │     └── Derives: Year, Month_Num, Month_Name, Quarter, Business (b2b/b2c), etc.
  │     └── Enriches with product_catalog data (brand, category, segment)
  │
  ├── 4. Upsert into sales_data via supabase_service.upsert_sales_batch()
  │     └── Batch size: 500 records per API call
  │     └── On conflict: "Order Id", "Invoice Number", "Asin", "Transaction Type"
  │
  ├── 5. Update refresh_log with status, counts, errors
  │
  └── 6. Invalidate ALL server-side caches (cache.invalidate_all())
```

**Date range logic (if not specified)**:
- Uses `date_range_end` from last successful refresh → today
- If no previous refresh: last 30 days

### 4.2 Manual Sync (Frontend Dashboard)

```
User clicks "🔄 Sync Amazon" on dashboard (page.tsx)
  │
  ▼
smartSync() function
  │
  ├── 1. Detects latest date in currently loaded data
  ├── 2. POST /api/sync {date_from: latestDate, date_to: today}
  │     └── sync/route.ts proxies to → POST {BACKEND_URL}/api/v1/refresh
  ├── 3. Polls GET /api/sync every 5s (proxies to /api/v1/refresh/status)
  ├── 4. Shows status updates: "⏳ Fetching..." → "✅ Done!" or "❌ Failed"
  └── 5. On success: reloads page after 2s
```

### 4.3 Frontend Data Loading

```
User visits dashboard (page.tsx)
  │
  ▼
useEffect → parallel fetch:
  ├── GET /api/profitability?per_page=50000 → joins sales_data + cogs + shipments in memory
  └── GET /api/sales?per_page=1 → just to get total count
  │
  ▼
All filtering (year, month, SKU, search) happens CLIENT-SIDE on the loaded data
  │
  ▼
Recharts renders: KPIs, AreaChart (monthly trend), BarCharts (state/SKU), PieCharts
```

**IMPORTANT**: The frontend does NOT auto-sync with the database. It loads data once on page load. The user must refresh the page to see new data. The "Sync Amazon" button triggers the backend to fetch from SP-API.

---

## 5. Keep-Alive & Service Availability (Render Free/Starter Plan)

### 5.1 Problem

Render's free tier spins down services after ~15 minutes of inactivity. This kills:
- The APScheduler (so daily refresh won't fire)
- The caches (they're in-memory)
- Cold starts take 30-60 seconds

### 5.2 Solution: Self-Ping (Backend Only)

The **backend** has a built-in keep-alive mechanism in `scheduler.py`:

```python
# Job 1: Self-ping every 13 minutes
_scheduler.add_job(
    _self_ping,               # GET {SELF_BASE_URL}/health
    trigger=IntervalTrigger(minutes=13),
    id="keep_alive_ping",
)
```

This pings its own `/health` endpoint every 13 minutes, which prevents Render from spinning down the backend service. **This ONLY works if the backend is already running** — if Render kills it for any reason, the scheduler dies too.

### 5.3 Frontend Keep-Alive

**The frontend does NOT have a self-ping mechanism.** It relies on user traffic to stay alive. On the starter plan, this is less of an issue since Render starter plan services are always-on (not free tier).

### 5.4 Recommended External Monitor

Set up [UptimeRobot](https://uptimerobot.com) (free) to ping:
- Backend: `https://<backend-url>/health` every 5 minutes
- Frontend: `https://<frontend-url>/` every 5 minutes

This guarantees both services stay warm regardless of Render's policies.

### 5.5 render.yaml Plan

Both services are configured as `plan: starter` in `render.yaml`. On the starter plan:
- Services are **always-on** (no spin-down)
- But if the user is actually on the free plan, they need the keep-alive mechanisms above

---

## 6. All API Endpoints

### 6.1 Backend (FastAPI) — runs on port 8000

| Method | Path | Description | Cached? |
|--------|------|-------------|---------|
| GET | `/` | Root info | No |
| GET | `/health` | Health check with Supabase status | No |
| GET | `/cache/stats` | Cache sizes and TTLs | No |
| POST | `/cache/invalidate` | Clear all caches | No |
| GET | `/api/v1/sales` | Paginated sales with filters | Yes (5 min) |
| GET | `/api/v1/sales/count` | Total record count | Yes (5 min) |
| GET | `/api/v1/sales/filters` | Distinct values for filter dropdowns | Yes (10 min) |
| GET | `/api/v1/sales/summary` | Summary stats | Yes (5 min) |
| POST | `/api/v1/refresh` | Trigger SP-API data refresh | No |
| GET | `/api/v1/refresh/status` | Latest refresh status | No |
| GET | `/api/v1/refresh/history` | All refresh history | No |
| GET | `/api/v1/catalog` | Product catalog | Yes (15 min) |
| POST | `/api/v1/catalog/sync` | Sync catalog from SP-API | No |
| GET | `/api/v1/finances` | Financial events | Yes (10 min) |
| POST | `/api/v1/finances/sync` | Sync finances from SP-API | No |
| GET | `/api/v1/returns` | Returns data | Yes (10 min) |
| POST | `/api/v1/returns/sync` | Sync returns from SP-API | No |

### 6.2 Frontend (Next.js API Routes) — runs on port 3000

| Method | Path | Description | Cached? |
|--------|------|-------------|---------|
| POST | `/api/auth/login` | Login with email/password | No |
| POST | `/api/auth/logout` | Clear session | No |
| GET | `/api/auth/me` | Get current session | No |
| GET | `/api/sales` | Sales data with pagination | Yes (60s) |
| GET | `/api/profitability` | Profitability calculation | Yes (120s) |
| GET | `/api/inventory` | Holt-Winters forecasting | Yes (300s) |
| GET | `/api/finances` | Financial events | Yes (120s) |
| GET | `/api/returns` | Returns data | Yes (120s) |
| GET | `/api/skus` | Distinct SKU list | Yes (300s) |
| GET/POST/PUT/DELETE | `/api/cogs` | COGS CRUD | No |
| POST | `/api/cogs/bulk` | Bulk COGS upsert | No |
| GET/POST/PUT/DELETE | `/api/shipments` | Shipments CRUD | No |
| POST | `/api/sync` | Proxy → backend POST /api/v1/refresh | No |
| GET | `/api/sync` | Proxy → backend GET /api/v1/refresh/status | No |

---

## 7. Environment Variables — Complete Reference

### 7.1 Backend (`.env` at project root)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | ✅ | — | `https://yquqkoeptxqgfaiatstk.supabase.co` |
| `SUPABASE_KEY` | ✅ | — | Service role key (not anon key) |
| `SP_API_REFRESH_TOKEN` | ✅ | — | Amazon Seller Central refresh token |
| `SP_API_LWA_APP_ID` | ✅ | — | Login with Amazon app ID |
| `SP_API_LWA_CLIENT_SECRET` | ✅ | — | LWA client secret |
| `SP_API_MARKETPLACE_ID` | No | `A21TJRUUN4KGV` | Amazon India marketplace |
| `APP_ENV` | No | `production` | "production" disables /docs and /redoc |
| `APP_HOST` | No | `0.0.0.0` | |
| `APP_PORT` | No | `8000` | |
| `LOG_LEVEL` | No | `info` | |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |
| `SELF_BASE_URL` | No | `http://localhost:8000` | **CRITICAL**: must be set to Render URL in production for keep-alive and daily refresh |
| `REFRESH_HOUR_IST` | No | `19` | Hour (24h) for daily auto-refresh (IST timezone) |

### 7.2 Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | — | Same Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — | Supabase anon key (for auth only) |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (use Pooler URL on Render) |
| `ADMIN_EMAIL` | ✅ | — | `admin@jhhalte.com` |
| `ADMIN_PASSWORD` | ✅ | — | `JHHalte@2025` |
| `ADMIN_SESSION_SECRET` | ✅ | — | Secret for signing session cookies |
| `BACKEND_URL` | No | `http://localhost:8000` | Backend URL for sync proxy |

---

## 8. Caching Architecture

### 8.1 Two Independent Cache Layers

The backend and frontend are **separate processes** with **separate caches**:

1. **Backend (FastAPI)**: `app/cache.py` using `cachetools.TTLCache` — Python in-memory
2. **Frontend (Next.js)**: `src/lib/cache.ts` using a plain `Map` — Node.js in-memory

They don't share state. Both are cleared independently:
- Backend: cleared after SP-API refresh (`refresh.py` calls `invalidate_all()`) or via `POST /cache/invalidate`
- Frontend: cleared only when entries expire via TTL (no manual invalidation endpoint)

### 8.2 Cache Invalidation Trigger

```
SP-API refresh completes
  └── refresh.py: invalidate_all_caches()
        └── Clears ALL backend caches (sales, filters, count, catalog, finances, returns, summary)
        └── Frontend caches are NOT cleared — they expire naturally via TTL
```

### 8.3 HTTP Cache-Control Headers

All frontend cached responses include:
```
Cache-Control: public, s-maxage={ttl}, stale-while-revalidate=30
CDN-Cache-Control: public, max-age={ttl}
```

This allows CDNs (Cloudflare, etc.) to cache responses too.

---

## 9. Auth System

- **Single admin account** — credentials in env vars, no database user table
- `POST /api/auth/login` — validates `ADMIN_EMAIL` + `ADMIN_PASSWORD`, sets `admin_session` cookie
- Cookie: httpOnly, secure in production, SameSite=lax, 7-day expiry
- `middleware.ts` checks the cookie on every request, redirects to `/login` if missing
- Excluded paths: `/login`, `/api/auth/*`, `/_next/*`, `/favicon.ico`

---

## 10. Key Answers to Common Questions

### "Does the frontend auto-sync with the database?"
**No.** The frontend loads data from the database on page load via its API routes (which query PostgreSQL directly). It does NOT poll or use WebSockets. To see new data, the user must refresh the page.

### "Does the backend sync data from SP-API daily?"
**Yes.** `scheduler.py` has a `CronTrigger` that fires at 7 PM IST daily. It calls `POST /api/v1/refresh` with `{"report_types": ["ORDERS"]}`. This fetches orders from the last successful refresh date to today, transforms them, and upserts into `sales_data`.

### "Are the services running continuously?"
**Depends on the plan:**
- `render.yaml` specifies `plan: starter` — starter plan services are **always-on**
- If actually on **free plan**: services spin down after 15 min inactivity. The backend's self-ping (every 13 min) keeps it alive. The frontend has no self-ping — use UptimeRobot.
- The backend's keep-alive only works **while the backend is running**. If Render hard-kills it (e.g., maintenance, deploy), the scheduler restarts on next boot.

### "What happens if the backend goes down?"
- The self-ping scheduler dies
- The daily refresh won't fire until the service restarts
- The frontend is unaffected (it queries the DB directly, not the backend)
- Caches are lost (they're in-memory)
- On restart: scheduler starts fresh, caches warm up on first requests

---

## 11. Deployment Checklist

1. Push code to GitHub (`master` branch)
2. Render auto-deploys both services (if auto-deploy is enabled)
3. Set all env vars on both Render services
4. **Critical**: Set `SELF_BASE_URL` on backend to its own Render URL
5. **Critical**: Set `BACKEND_URL` on frontend to the backend Render URL
6. **Critical**: Set `ALLOWED_ORIGINS` on backend to the frontend Render URL
7. Run `migrations/002_performance_indexes.sql` in Supabase SQL Editor
8. Verify: hit `https://<backend-url>/health` — should show `status: healthy`
9. Verify: hit `https://<backend-url>/cache/stats` — should show empty caches
10. Login to frontend: `admin@jhhalte.com` / `JHHalte@2025`
