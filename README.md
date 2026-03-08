# QnA Analytics — JH-Halte Dashboard

**Monorepo**: FastAPI backend + Next.js 16 frontend deployed on Render.

Amazon SP-API powered analytics dashboard for tracking sales, COGS, profitability, shipments, and inventory forecasting for JH-Halte brands.

---

## Architecture

```
qna/
├── app/                          # FastAPI backend (Python)
│   ├── main.py                   # App entry, CORS, middleware, lifespan
│   ├── config.py                 # Pydantic Settings (env vars)
│   ├── database.py               # Supabase client singleton
│   ├── cache.py                  # In-memory TTL cache (cachetools)
│   ├── models.py                 # Pydantic response models
│   ├── scheduler.py              # APScheduler: keep-alive ping + daily 7PM IST refresh
│   ├── routers/
│   │   ├── sales.py              # GET /api/v1/sales (cached)
│   │   ├── refresh.py            # POST /api/v1/refresh (SP-API → Supabase, invalidates caches)
│   │   └── sp_data.py            # Catalog, finances, returns (cached)
│   └── services/
│       ├── sp_api_service.py     # Amazon SP-API client (Orders API + Reports)
│       ├── supabase_service.py   # Supabase CRUD operations
│       └── data_processor.py     # Transform SP-API data → DB format
├── frontend/                     # Next.js 16 (App Router)
│   ├── src/
│   │   ├── middleware.ts         # Auth middleware — protects all routes
│   │   ├── app/
│   │   │   ├── page.tsx          # Dashboard (KPIs, area chart, bar charts, pie charts)
│   │   │   ├── login/page.tsx    # Admin login page
│   │   │   ├── cogs/page.tsx     # COGS management (add/edit/delete per SKU)
│   │   │   ├── profitability/    # Order-level profitability table
│   │   │   ├── shipments/        # Shipment cost tracking
│   │   │   ├── inventory/        # AI inventory prediction (Holt-Winters)
│   │   │   └── api/              # Next.js API routes (DB queries, all cached)
│   │   │       ├── auth/         # login, logout, me
│   │   │       ├── sales/        # Sales data — 60s cache
│   │   │       ├── cogs/         # COGS CRUD
│   │   │       ├── profitability/# Joined sales+cogs+shipments — 120s cache
│   │   │       ├── shipments/    # Shipment CRUD
│   │   │       ├── inventory/    # Holt-Winters forecasting — 300s cache
│   │   │       ├── finances/     # Financial events — 120s cache
│   │   │       ├── returns/      # Returns data — 120s cache
│   │   │       └── skus/         # Distinct SKU list — 300s cache
│   │   ├── lib/
│   │   │   ├── db.ts             # PostgreSQL connection pool (pg)
│   │   │   ├── cache.ts          # In-memory TTL cache for API routes
│   │   │   └── calculations.ts   # COGS calculation logic
│   │   └── components/
│   │       └── Navbar.tsx        # Nav with logout button
│   └── next.config.mjs          # output: "standalone"
├── migrations/
│   ├── 001_sp_api_features.sql   # financial_events + returns tables
│   └── 002_performance_indexes.sql # All performance indexes
├── render.yaml                   # Render Blueprint (both services)
├── Dockerfile                    # Backend Docker image
├── Procfile                      # Gunicorn start command
├── requirements.txt              # Python deps
└── .env                          # Backend env vars (local only)
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI, Gunicorn, Uvicorn |
| Frontend | Next.js 16, React 19, Recharts |
| Database | Supabase (PostgreSQL) |
| Data Source | Amazon SP-API (Orders API) |
| Caching (Backend) | cachetools (in-memory TTL + LRU) |
| Caching (Frontend) | Custom in-memory TTL cache + HTTP Cache-Control |
| Styling | Vanilla CSS (dark theme, glassmorphism) |
| Scheduler | APScheduler (keep-alive + daily refresh) |
| Auth | Cookie-based session (single admin) |
| Deployment | Render (monorepo, 2 web services) |

---

## Performance Optimization

This application implements a **multi-layer caching strategy** and **optimized database indexes** to ensure fast data access even with 30k+ records.

### 🏗️ Database Indexes

The main `sales_data` table (30k+ rows) is the most heavily queried table. Without indexes, every filter, sort, and count query performs a full sequential scan. Migration `002_performance_indexes.sql` adds **16 indexes** specifically chosen based on actual query patterns found in the codebase.

#### Why Each Index Exists

| Index | Column(s) | Query Pattern | Endpoint(s) |
|-------|-----------|---------------|-------------|
| `idx_sales_data_date` | `"Date"` | Date range filters (`>= / <=`) | Backend sales API, dashboard |
| `idx_sales_data_year` | `"Year"` | Equality filter on year | Sales, inventory, profitability |
| `idx_sales_data_channel` | `"Channel"` | Equality filter | Filter dropdowns, dashboard |
| `idx_sales_data_business` | `"Business"` | B2B/B2C filter | Sales API, dashboard |
| `idx_sales_data_brand` | `"BRAND"` | Equality filter | Sales, profitability |
| `idx_sales_data_category` | `"Category"` | Equality filter | Filter dropdowns |
| `idx_sales_data_txn_type` | `"Transaction Type"` | `!= 'return'` in **every** frontend query | All frontend API routes |
| `idx_sales_data_source` | `"Source"` | Equality filter | Sales API |
| `idx_sales_data_sku` | `"Sku"` | `ILIKE` search, `DISTINCT ON` | Profitability, inventory, SKUs |
| `idx_sales_data_asin` | `"Asin"` | Equality filter, catalog join | Sales API, catalog sync |
| `idx_sales_data_order_id` | `"Order Id"` | `ILIKE` search | Profitability, order lookup |
| `idx_sales_data_ship_state` | `"Ship To State"` | State-wise grouping | Dashboard charts |
| `idx_sales_data_txn_id_desc` | `"Transaction Type", id DESC` | **Hot path** — most queries filter by txn type + order by id DESC | All paginated endpoints |
| `idx_sales_data_txn_date` | `"Transaction Type", "Date" DESC` | Txn type filter + date sort | Dashboard date filtering |
| `idx_sales_data_txn_sku` | `"Transaction Type", "Sku"` | Txn type + SKU filter combo | Profitability, inventory |
| `idx_sales_data_year_month` | `"Year", "Month_Num"` | Monthly aggregation | Inventory forecasting |

**Supporting table indexes:**

| Table | Index | Purpose |
|-------|-------|---------|
| `order_cogs_snapshot` | `idx_cogs_snapshot_order` | `WHERE order_id IN (...)` join in profitability |
| `cogs` | `idx_cogs_sku` | SKU lookup for cost calculations |
| `shipments` | `idx_shipments_order` | Order-level shipping cost join |
| `financial_events` | `idx_financial_events_order/date/type` | Already existed in migration 001 |
| `returns` | `idx_returns_order/date/sku` | Already existed in migration 001 |

#### Composite Indexes — Why They Matter

PostgreSQL can use a **composite index** to satisfy multi-column queries without scanning the table. The leading column in a composite index is critical:

- **`idx_sales_data_txn_id_desc`** — Almost every frontend query starts with `WHERE "Transaction Type" != 'return'` and ends with `ORDER BY id DESC`. This composite index covers both the filter and the sort in a single B-tree traversal, eliminating the need for a separate sort step.
- **`idx_sales_data_txn_date`** — The dashboard date-range queries always combine transaction type filtering with date ordering. This composite avoids a separate sort after filtering.
- **`idx_sales_data_year_month`** — The inventory forecasting aggregates data by `(Year, Month_Num)`. A composite index turns this into an index-only scan.

### 🧠 Backend Caching (FastAPI + cachetools)

#### Why cachetools?

We use Python's [`cachetools`](https://github.com/tkem/cachetools) library for in-memory caching:

| Alternative | Why Not |
|-------------|---------|
| **Redis** | Requires an external service — adds cost on Render free tier, introduces network latency for cache reads, and adds operational complexity |
| **Django cache framework** | Not applicable — this is FastAPI |
| **functools.lru_cache** | No TTL support — cached data would never expire, causing stale reads after data refresh |
| **Manual dict** | No thread safety, no automatic eviction, no TTL |

**cachetools** provides:
- **TTL-based expiration** — entries automatically expire, ensuring freshness
- **LRU eviction** — bounded memory usage with `maxsize` per cache
- **Thread-safe** — uses `threading.Lock` for safe access across Gunicorn workers
- **Zero infrastructure** — runs in-process, no external dependencies

#### Cache Configuration

| Cache Name | Max Entries | TTL | What It Caches |
|------------|-------------|-----|---------------|
| `sales` | 256 | 5 min | Paginated sales queries (key = hash of all query params) |
| `filters` | 32 | 10 min | Filter dropdown values (channels, brands, categories, etc.) |
| `count` | 32 | 5 min | Record counts |
| `catalog` | 8 | 15 min | Product catalog |
| `finances` | 64 | 10 min | Financial events |
| `returns` | 64 | 10 min | Returns data |
| `summary` | 32 | 5 min | Sales summaries |

#### Cache Invalidation Strategy

Caches are invalidated **automatically** when new data arrives:

1. **SP-API refresh completes** → `refresh.py` calls `invalidate_all()` → all caches are cleared
2. **Manual invalidation** → `POST /cache/invalidate` endpoint clears all caches
3. **TTL expiration** — even without explicit invalidation, entries expire naturally
4. **Monitor** → `GET /cache/stats` returns current sizes, max sizes, and TTL for each cache

### ⚡ Frontend Caching (Next.js API Routes)

#### Why a Separate Frontend Cache?

The Next.js frontend runs in a **separate Node.js process** from the FastAPI backend. Frontend API routes make direct PostgreSQL queries (not proxied through the backend), so they need their own cache layer.

#### Implementation: `frontend/src/lib/cache.ts`

- **In-memory Map** — simple, zero-dependency, runs in the Node.js process
- **Per-entry TTL** — each entry has its own expiration timestamp
- **Bounded size** (256 entries) — LRU-style eviction prevents unbounded memory growth
- **Deterministic keys** — `makeCacheKey(prefix, URLSearchParams)` produces consistent keys

#### Cache Configuration per Route

| API Route | TTL | Rationale |
|-----------|-----|-----------|
| `/api/sales` | 60s | Frequently accessed, data changes daily |
| `/api/profitability` | 120s | Expensive multi-table join + calculation |
| `/api/inventory` | 300s | CPU-intensive Holt-Winters forecasting across all SKUs |
| `/api/finances` | 120s | Moderate query complexity |
| `/api/returns` | 120s | Moderate query complexity |
| `/api/skus` | 300s | `DISTINCT ON` query, SKU list rarely changes |

#### HTTP Cache-Control Headers

Every cached response includes:
```
Cache-Control: public, s-maxage={ttl}, stale-while-revalidate=30
CDN-Cache-Control: public, max-age={ttl}
```

- **`s-maxage`** — CDN/reverse-proxy cache duration (Render, Cloudflare, etc.)
- **`stale-while-revalidate`** — serve stale data for 30s while refetching in the background
- **`CDN-Cache-Control`** — respected by CDNs that support this header

### 📊 Performance Impact Summary

| Scenario | Before | After |
|----------|--------|-------|
| Sales list (30k rows, paginated) | Full table scan every request | Index scan + 60s cache |
| Filter dropdowns | 7 × `DISTINCT` queries every page load | 10-min cached response |
| Profitability page | 3 parallel queries + in-memory join, every time | Cached for 2 min |
| Inventory forecasting | Full scan + Holt-Winters over all SKUs on every request | 5-min cached response |
| Post-refresh staleness | N/A (no cache existed) | All caches auto-invalidated |
| Cold database queries | Sequential scan on every column filter | B-tree index lookups |

---

## Environment Variables

### Backend (`.env`)

```env
SUPABASE_URL=https://yquqkoeptxqgfaiatstk.supabase.co
SUPABASE_KEY=<service_role_key>
SP_API_REFRESH_TOKEN=<your_refresh_token>
SP_API_LWA_APP_ID=amzn1.application-oa2-client.53f81bc5b925435cafc071d95d32e077
SP_API_LWA_CLIENT_SECRET=<your_secret>
SP_API_MARKETPLACE_ID=A21TJRUUN4KGV
APP_ENV=development          # or "production"
LOG_LEVEL=info
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SELF_BASE_URL=http://localhost:8000
REFRESH_HOUR_IST=19          # 7 PM daily auto-refresh
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://yquqkoeptxqgfaiatstk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
DATABASE_URL=postgresql://postgres:RamanSir1234%40@db.yquqkoeptxqgfaiatstk.supabase.co:5432/postgres
ADMIN_EMAIL=admin@jhhalte.com
ADMIN_PASSWORD=JHHalte@2025
ADMIN_SESSION_SECRET=jh_halte_s3cr3t_k3y_f0r_s3ss10n_2025
```

> **Render**: use Supabase Connection Pooler URL for `DATABASE_URL`:
> `postgresql://postgres.yquqkoeptxqgfaiatstk:RamanSir1234%40@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`

---

## Local Development

```bash
# Backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- Backend: http://localhost:8000 (health: `/health`, docs: `/docs`, cache stats: `/cache/stats`)
- Frontend: http://localhost:3000 (login: `admin@jhhalte.com` / `JHHalte@2025`)

---

## Render Deployment

**Blueprint**: Push to GitHub → Render → New → Blueprint → auto-detects `render.yaml`

### Backend Service (`qna-analytics-api`)
- Runtime: Python 3.12
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers 2 --bind 0.0.0.0:$PORT --timeout 120`

### Frontend Service (`jh-halte-dashboard`)
- Runtime: Node 20
- Root Dir: `frontend`
- Build: `npm install && npm run build`
- Start: `npm start`

### Post-Deploy Checklist
1. Set `SELF_BASE_URL` = backend Render URL
2. Set `ALLOWED_ORIGINS` = frontend Render URL
3. Set `NEXT_PUBLIC_API_URL` = backend Render URL on frontend
4. Add all `ADMIN_*` env vars on frontend
5. **Run migration** `002_performance_indexes.sql` in Supabase SQL Editor
6. **Redeploy both** to pick up cross-references

### Keep-Alive
- Built-in: APScheduler self-ping every 13 min
- Recommended: [UptimeRobot](https://uptimerobot.com) free monitor on `/health`

---

## Database Schema (Supabase)

### `sales_data` table (main data, ~30k+ records)
Populated by SP-API Orders API. Key columns:
- `Order Id`, `SKU`, `ASIN`, `Item Description`
- `Invoice Amount`, `Quantity`, `Purchase Date`
- `Ship To State`, `Ship To City`, `Fulfillment`
- `Source` (Orders_API / GST_MTR), `Channel`

### `product_catalog` table
- `asin` (PK), `brand`, `category`, `segment`

### `cogs_config` table
- `sku` (PK), `import_price`, `currency`, `exchange_rate`
- `custom_duty_pct`, `gst1_pct`, `shipping_cost`
- `margin1_pct`, `marketing_cost`, `margin2_pct`, `gst2_pct`
- Computed: `landed_cost`, `halte_cost_price`, `selling_price`, `msp`

### `shipments` table
- `order_id`, `sku`, `shipping_cost`, `carrier`, `tracking_number`, `shipped_date`

### `refresh_logs` table
- `report_type`, `status`, `records_fetched`, `date_range_start/end`

---

## SP-API Integration

### Current Capabilities
- **Orders API**: Fetch orders + line items, extract SKU/ASIN/pricing/shipping
- **Reports API**: GST MTR B2B/B2C reports (fallback)
- **Auto-refresh**: Daily at 7 PM IST via APScheduler

### Current Permissions Required
- `Inventory and Order Tracking` role

---

## COGS Calculation Flow

```
Import Price (foreign currency)
  × Exchange Rate
  = Import Price INR
  + Custom Duty (% of import)
  + GST1 (% of import + duty)
  + Shipping Cost
  = Landed Cost
  + JH Margin (M1 %)
  = Halte Cost Price  (JH → Halte transfer price)
  + Marketing Cost
  + Halte Margin (M2 %)
  = Selling Price
  + GST2 (% of selling)
  = MSP (Minimum Selling Price)
```

Logic in: `frontend/src/lib/calculations.ts`

---

## Auth System

- **Single admin account** (no registration)
- Credentials stored as env vars: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
- `middleware.ts` checks `admin_session` cookie on every request
- Cookie: httpOnly, secure in production, 7-day expiry
- API routes: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`

---

## Key Design Decisions

1. **Frontend queries DB directly** via `pg` pool in API routes (not through backend)
2. **Backend** only handles SP-API data fetching/processing → stores in Supabase
3. **COGS** are managed entirely on the frontend (CRUD via Next.js API routes)
4. **Profitability** is computed by joining sales + cogs_config + shipments in SQL
5. **No ORM** — raw SQL queries in frontend API routes for performance
6. **Monorepo** — single GitHub repo, Render deploys with `rootDir` for frontend
7. **Multi-layer caching** — backend (cachetools) + frontend (in-memory TTL) + HTTP headers
8. **Automatic cache invalidation** — all caches cleared after SP-API data refresh

---

## Known Issues / Notes

- Next.js 16 shows `middleware` deprecation warning (will need migration to `proxy` in future)
- Render free tier spins down after 15 min inactivity (self-ping mitigates)
- Database values from Supabase can be `null` — always use `Number(val) || 0` in frontend
- `DATABASE_URL` on Render must use Supabase **Connection Pooler** (IPv4) not direct (IPv6)
- **Cache note**: Backend uses 2 Gunicorn workers — each worker has its own cache (no shared state). This is acceptable for this workload; for multi-instance deployments, consider Redis.
