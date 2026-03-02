# JH–Halte Pricing & Analytics System
## Architecture & Database Overview

This document is designed to help any future AI or developer understand the architecture, data flow, and exact schema of the JH-Halte Profitability & COGS system.

### 1. System Components

*   **Database:** Supabase (PostgreSQL). Stores Sales Data (synced via external Python script), SKUs/Products catalog, COGS data (custom), and Shipping data.
*   **Backend (Python - Legacy/Sync):** A FastAPI app `app/main.py`. Primarily responsible for Amazon SP-API webhooks, auth, and ingesting `sales_data`.
*   **Frontend & Analytics API (Next.js - Current):** Located in the `frontend/` directory. It uses Next.js 14 App Router, built with TypeScript and Tailwind CSS. The Next.js API Routes (`frontend/src/app/api`) act as the active middleware, querying Supabase directly for COGS, Shipments, and dynamic Profitability joins.

### 2. Core Supabase Tables

#### A. `sales_data` (Amazon & Off-Amazon Sales)
Imported automatically. Key columns used for analytics:
*   `Order Id` : The unique transaction identifier.
*   `Sku` : The product identifier. Link to COGS.
*   `Quantity` : Number of units sold.
*   `Invoice Amount` : The final payout/selling price recorded for the order.
*   `BRAND`, `Item Description`, `Date`, `Ship To State`, `Month_Name`, `Year`.

#### B. `cogs` (Cost of Goods Sold - Global SKU Baseline)
Maintained manually by users within the Next.js `CogsPage`.
*   `sku` (PK): Links to `sales_data`.
*   `import_price`, `currency`, `exchange_rate` -> Used to dynamically compute `import_price_inr`.
*   `landed_cost` = `import_price_inr` + Customs Duty + Import GST + Inbound Shipping.
*   `halte_cost_price` = `landed_cost` + JH Margin. (This is the price JH sells to Halte).
*   `msp` (Minimum Selling Price) = `halte_cost_price` + Halte Margin + Marketing + Selling GST.

#### C. `shipments` (Order-Level Shipping Costs)
Maintained manually or via CSV upload for tracking exact shipping cost to the final customer.
*   `order_id` (PK): Links to `sales_data`.
*   `shipping_cost`: INR cost to ship that specific order.

#### D. `order_cogs_snapshot` (Immutable Line-Level COGS)
Because Global COGS (`cogs` table) changes over time (exchange rates fluctuate), we snapshot the *exact* COGS unit economics the **first time** an Order is viewed/queried on the Dashboard. This ensures historical profitability doesn't retroactively rewrite itself when someone edits today's Exchange Rate.
*   `order_id`, `sku` (Composite PK): The order line.
*   `landed_cost`: Snapshotted from `cogs`.
*   `halte_cost_price`: Snapshotted from `cogs`.
*   `shipping_cost`: Snapshotted from `shipments`.

### 3. Profitability Business Logic

When the Next.js API `/api/profitability` is called, it performs an in-memory map-reduce join (due to Supabase limits/performance):
1.  Fetches `sales_data` chunk.
2.  Fetches `cogs` and `shipments` maps.
3.  Fetches `order_cogs_snapshot`.
4.  **Immutability Check**: If a snapshot exists for `Order_Sku`, use those locked costs. If not, use the live `cogs` data, and asynchronously trigger an `upsert` to snapshot it for the future.

**Math Flow per Order Line:**
*   Revenue = `Invoice Amount`
*   JH Profit = `(halte_cost_price - landed_cost) * Quantity`
*   Halte Profit = `Invoice Amount - (halte_cost_price * Quantity) - Order Shipment Cost`
*   **Total Profit** = `JH Profit + Halte Profit`

### 4. Next.js App Structure

*   **/src/app/page.tsx** (Dashboard): High-level KPIs, State-level map/chart distribution, Top N SKUs, Month/Year filtering. Uses Recharts.
*   **/src/app/cogs/page.tsx**: Spreadsheet-like UI for updating global `cogs` constants.
*   **/src/app/profitability/page.tsx**: The detailed drill-down (Order view / Aggregated SKU view). Shows exact per-order JSON breakdowns with margins.

### 5. Deployment Info

*   `render.yaml` orchestrates two Docker/Web services. The FastAPI is the 'Backend' service, and `frontend` Next.js is the 'Dashboard' Node.js service.
*   All styles rely on vanilla CSS (`globals.css`) for high-performance premium Glassmorphism styling without massive utility classes.
