# QnA Analytics API

Production-grade FastAPI service for Amazon sales data analytics with Supabase backend.

## Features

- **Amazon SP-API Integration**: Fetches B2B/B2C MTR reports automatically
- **Supabase Database**: Stores all sales data with Power BI-compatible column names
- **Refresh Tracking**: Tracks every SP-API call with date ranges and status
- **Power BI Compatible**: Column names match `combined2.xlsx` headers exactly
- **Easy Deployment**: Docker, Render, Railway, Heroku ready

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# SP-API (get from Amazon Seller Central > Developer Central)
SP_API_REFRESH_TOKEN=your_refresh_token
SP_API_LWA_APP_ID=your_lwa_app_id
SP_API_LWA_CLIENT_SECRET=your_lwa_client_secret
SP_API_AWS_ACCESS_KEY=your_aws_access_key
SP_API_AWS_SECRET_KEY=your_aws_secret_key
SP_API_ROLE_ARN=your_role_arn
SP_API_MARKETPLACE_ID=A21TJRUUN4KGV
```

> **Note on Supabase Key**: Go to Supabase Dashboard > Project Settings > API > Project API keys. Use the **anon/public** key (JWT format starting with `eyJ...`). For write operations, you may need the **service_role** key.

### 3. Create Database Tables

1. Go to your **Supabase Dashboard > SQL Editor**
2. Copy the contents of `scripts/init_db.sql`
3. Run the SQL

### 4. Upload Excel Data

```bash
python -m scripts.upload_excel
# Or with options:
python -m scripts.upload_excel --truncate  # Clear existing data first
```

### 5. Start the API

```bash
# Development
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

## API Endpoints

| Method | Endpoint                  | Description                            |
| ------ | ------------------------- | -------------------------------------- |
| GET    | `/`                       | API info                               |
| GET    | `/health`                 | Health check with system status        |
| GET    | `/docs`                   | Swagger UI documentation               |
| GET    | `/api/v1/sales`           | Get sales data (paginated, filterable) |
| GET    | `/api/v1/sales/count`     | Get total record count                 |
| GET    | `/api/v1/sales/filters`   | Get available filter values            |
| GET    | `/api/v1/sales/summary`   | Get sales summary                      |
| POST   | `/api/v1/refresh`         | Trigger SP-API data refresh            |
| GET    | `/api/v1/refresh/status`  | Get current refresh status             |
| GET    | `/api/v1/refresh/history` | Get refresh history                    |

### Query Parameters for `/api/v1/sales`

- `page` - Page number (default: 1)
- `per_page` - Records per page (default: 1000, max: 10000)
- `date_from` / `date_to` - Date range filter (YYYY-MM-DD)
- `year` - Filter by year
- `channel` - Filter by channel (e.g., amazon)
- `business` - Filter by business type (b2b/b2c)
- `brand` - Filter by brand
- `category` - Filter by category
- `transaction_type` - Filter by transaction type
- `source` - Filter by fiscal year (e.g., fy2025)
- `asin` - Filter by ASIN
- `order_id` - Filter by Order ID

### Refresh Request Body

```json
{
  "date_from": "2025-01-01",
  "date_to": "2025-02-24",
  "report_types": ["B2C", "B2B"]
}
```

If no dates are specified, it fetches from the last successful refresh date to today.

## Deployment

### Docker

```bash
docker-compose up -d
```

### Render

Push to GitHub and connect to Render. The `render.yaml` is pre-configured.

### Railway / Heroku

```bash
# Uses the Procfile automatically
git push railway main
# or
git push heroku main
```

## Connecting Power BI to Supabase

### Option 1: Direct PostgreSQL Connection (Recommended)

1. In Power BI Desktop: **Get Data > PostgreSQL Database**
2. Server: `db.yquqkoeptxqgfaiatstk.supabase.co`
3. Port: `5432`
4. Database: `postgres`
5. Username: `postgres`
6. Password: Your Supabase database password (from Dashboard > Settings > Database)
7. Select the `sales_data` table

### Option 2: REST API (Web Connector)

1. In Power BI Desktop: **Get Data > Web**
2. URL: `https://your-api-url/api/v1/sales?per_page=10000`
3. Power BI will parse the JSON response
4. Expand the `data` column to get individual records

### Option 3: OData Feed

Use the Supabase PostgREST endpoint directly:

- URL: `https://yquqkoeptxqgfaiatstk.supabase.co/rest/v1/sales_data`
- Add header: `apikey: your-supabase-key`

## Data Schema

All 30 columns match `combined2.xlsx` exactly:

| Column                 | Type    | Example                |
| ---------------------- | ------- | ---------------------- |
| Date                   | text    | 2023-04-01             |
| Year                   | integer | 2023                   |
| Month_Num              | integer | 4                      |
| Month_Name             | text    | april                  |
| Month_Year             | text    | apr 2023               |
| Quarter                | integer | 2                      |
| Quarter_Name           | text    | q2                     |
| Business               | text    | b2c                    |
| Invoice Number         | text    | in-32                  |
| Invoice Date           | text    | 2023-04-08 19:37:25    |
| Transaction Type       | text    | shipment               |
| Order Id               | text    | 406-3085594-8194727    |
| Quantity               | integer | 1                      |
| BRAND                  | text    | bkr                    |
| Item Description       | text    | bkr stainless steel... |
| Asin                   | text    | b07zj4zcqv             |
| Sku                    | text    | lg0546                 |
| Category               | text    | fogging machine        |
| Segment                | text    | agriculture            |
| Ship To City           | text    | aliganj                |
| Ship To State          | text    | uttar pradesh          |
| Ship To Country        | text    | in                     |
| Ship To Postal Code    | text    | 207244                 |
| Invoice Amount         | numeric | 32300                  |
| Principal Amount       | numeric | 32000                  |
| Warehouse Id           | text    | (nullable)             |
| Customer Bill To Gstid | text    | (nullable)             |
| Buyer Name             | text    | (nullable)             |
| Source                 | text    | fy2023                 |
| Channel                | text    | amazon                 |

> **Note**: Column names (headers) maintain their exact case from the Excel file. All string data values are lowercase.

## Project Structure

```
qna/
├── .env                          # Environment configuration
├── requirements.txt              # Python dependencies
├── Dockerfile                    # Docker container config
├── docker-compose.yml            # Docker Compose config
├── Procfile                      # Heroku/Railway deployment
├── render.yaml                   # Render deployment
├── combined2.xlsx                # Source data file
├── UpdatedUltimateDashboard.pbix # Power BI dashboard
├── app/
│   ├── __init__.py
│   ├── main.py                   # FastAPI app entry point
│   ├── config.py                 # Settings management
│   ├── database.py               # Supabase client
│   ├── models.py                 # Pydantic models
│   ├── routers/
│   │   ├── sales.py              # Sales data endpoints
│   │   └── refresh.py            # SP-API refresh endpoints
│   └── services/
│       ├── supabase_service.py   # Database operations
│       ├── sp_api_service.py     # Amazon SP-API integration
│       └── data_processor.py     # Data transformation
└── scripts/
    ├── init_db.sql               # Database schema SQL
    └── upload_excel.py           # Excel data uploader
```
