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
│   ├── models.py                 # Pydantic response models
│   ├── scheduler.py              # APScheduler: keep-alive ping + daily 7PM IST refresh
│   ├── routers/
│   │   ├── sales.py              # GET /api/v1/sales
│   │   └── refresh.py            # POST /api/v1/refresh (SP-API → Supabase)
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
│   │   │   └── api/              # Next.js API routes (DB queries)
│   │   │       ├── auth/         # login, logout, me
│   │   │       ├── sales/        # Sales data from Supabase
│   │   │       ├── cogs/         # COGS CRUD
│   │   │       ├── profitability/# Joined sales+cogs+shipments
│   │   │       ├── shipments/    # Shipment CRUD
│   │   │       ├── inventory/    # Holt-Winters forecasting
│   │   │       └── skus/         # Distinct SKU list
│   │   ├── lib/
│   │   │   ├── db.ts             # PostgreSQL connection pool (pg)
│   │   │   └── calculations.ts   # COGS calculation logic
│   │   └── components/
│   │       └── Navbar.tsx        # Nav with logout button
│   └── next.config.mjs          # output: "standalone"
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
| Styling | Vanilla CSS (dark theme, glassmorphism) |
| Scheduler | APScheduler (keep-alive + daily refresh) |
| Auth | Cookie-based session (single admin) |
| Deployment | Render (monorepo, 2 web services) |

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

- Backend: http://localhost:8000 (health: `/health`, docs: `/docs`)
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
5. **Redeploy both** to pick up cross-references

### Keep-Alive
- Built-in: APScheduler self-ping every 13 min
- Recommended: [UptimeRobot](https://uptimerobot.com) free monitor on `/health`

---

## Database Schema (Supabase)

### `sales` table (main data, ~30k+ records)
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

### Pending Features (not yet implemented)
1. **Returns/Refunds** — FBA Returns Reports API
2. **Catalog Info** — Catalog Items API (product images, titles by ASIN)
3. **Financial Data** — Finances API (fees, settlements, refunds)

These would require:
- New methods in `app/services/sp_api_service.py`
- New Supabase tables
- New backend router endpoints
- New frontend pages/components

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

---

## Known Issues / Notes

- Next.js 16 shows `middleware` deprecation warning (will need migration to `proxy` in future)
- Render free tier spins down after 15 min inactivity (self-ping mitigates)
- Database values from Supabase can be `null` — always use `Number(val) || 0` in frontend
- `DATABASE_URL` on Render must use Supabase **Connection Pooler** (IPv4) not direct (IPv6)
