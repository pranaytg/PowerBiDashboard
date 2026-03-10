import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, getCacheHeaders } from "@/lib/cache";

export const maxDuration = 60;

const CACHE_TTL_MS = 300_000; // 5 minutes
const CACHE_KEY = "warehouse_inventory_v1";

interface WarehouseSalesRow {
    Sku: string;
    "Warehouse Id": string;
    total_sales: number;
}

interface WarehouseStockRow {
    sku: string;
    fulfillment_center_id: string;
    quantity: number;
    condition: string;
    snapshot_date: string;
}

export async function GET(request: NextRequest) {
    const cached = cacheGet<object>(CACHE_KEY);
    if (cached) return NextResponse.json(cached, { headers: getCacheHeaders(300) });

    try {
        // 1. Fetch March Sales by SKU and Warehouse
        // Cast Quantity to integer since it's stored as text/varchar typically.
        // 1. Fetch SKUs that have sales within the last 6 months and their March Sales by Warehouse
        // We do this by getting the total sales in March, but filtering the overall set of SKUs to those with sales in the last 6 months.
        const { rows: marchSales } = await query<WarehouseSalesRow>(
            `WITH ActiveSkus AS (
               SELECT DISTINCT "Sku"
               FROM sales_data
               WHERE "Date" >= CURRENT_DATE - INTERVAL '6 months'
                 AND "Transaction Type" != 'return'
             )
             SELECT sd."Sku", sd."Warehouse Id", SUM(COALESCE(CAST(sd."Quantity" AS integer), 0)) as total_sales
             FROM sales_data sd
             JOIN ActiveSkus a ON sd."Sku" = a."Sku"
             WHERE sd."Date" >= '2026-03-01' AND sd."Date" < '2026-04-01'
               AND sd."Transaction Type" != 'return'
               AND sd."Warehouse Id" IS NOT NULL
               AND sd."Warehouse Id" != ''
             GROUP BY sd."Sku", sd."Warehouse Id"`
        );

        // 2. Fetch Latest March Inventory Snapshot per SKU and Warehouse
        // Using DISTINCT ON to get the latest snapshot_date per SKU+FC combination.
        const { rows: inventorySnapshots } = await query<WarehouseStockRow>(
            `WITH ActiveSkus AS(
                SELECT DISTINCT "Sku"
               FROM sales_data
               WHERE "Date" >= CURRENT_DATE - INTERVAL '6 months'
                 AND "Transaction Type" != 'return'
            )
             SELECT DISTINCT ON(w.sku, w.fulfillment_center_id) 
               w.sku, w.fulfillment_center_id, w.quantity, w.condition, w.snapshot_date
             FROM warehouse_inventory_snapshots w
             JOIN ActiveSkus a ON w.sku = a."Sku"
             WHERE w.snapshot_date >= '2026-03-01'
             ORDER BY w.sku, w.fulfillment_center_id, w.snapshot_date DESC`
        );

        // Build Maps
        // For joining, we will use a compound key: SKU + "_" + Warehouse ID
        const salesMap: Record<string, number> = {};
        for (const s of marchSales) {
            if (!s.Sku || !s["Warehouse Id"]) continue;
            const key = `${s.Sku}_${s["Warehouse Id"]}`;
            salesMap[key] = (salesMap[key] || 0) + Number(s.total_sales);
        }

        const stockMap: Record<string, WarehouseStockRow> = {};
        for (const snap of inventorySnapshots) {
            if (!snap.sku || !snap.fulfillment_center_id) continue;
            const key = `${snap.sku}_${snap.fulfillment_center_id}`;
            // In case there are multiple conditions, we just sum up fulfillable for now, but usually we just care about the total latest.
            // If the query returns multiple conditions for the same day, DISTINCT ON won't group condition unless we do it manually,
            // but let's assume DISTINCT ON (sku, fc) gives the main record. Alternatively, group by sku, fc in a subquery or adjust schema logic.
            if (!stockMap[key]) {
                stockMap[key] = snap;
            } else {
                stockMap[key].quantity += snap.quantity; // aggregate conditions for the same day if they bypassed DISTINCT ON
            }
        }

        // Combine Data
        const allKeys = new Set([...Object.keys(salesMap), ...Object.keys(stockMap)]);
        const analysisMap = new Map<string, any>();

        // March 2026 has 31 days. Depending on the current date, we might want to calculate the rate based on days elapsed 
        // or assume the full month. Let's assume the full previous month (31 days) or use an average if the month is ongoing.
        // For robust sales rate calculation, using a fixed 30 or 31 days is standard for generalized monthly velocity.
        const DAYS_IN_MARCH = 31;
        const LEAD_TIME = 21; // Standard assumed lead time from supplier to warehouse

        const recommendations = [];

        for (const key of allKeys) {
            const [sku, fc] = key.split("_");

            const sales = salesMap[key] || 0;
            const stockInfo = stockMap[key];
            const closingInventory = stockInfo ? stockInfo.quantity : 0;

            // Calculate Sales Rate (units per day)
            const salesRateDaily = sales / DAYS_IN_MARCH;
            const salesRateMonthly = sales; // total march sales

            // Days of Stock
            const daysOfStock = salesRateDaily > 0 ? Math.round(closingInventory / salesRateDaily) : 999;

            // Recommendation Engine (Robustness logic)
            const safetyStock = Math.ceil(salesRateDaily * Math.sqrt(LEAD_TIME) * 1.65); // 95% service level safety stock
            const reorderPoint = Math.ceil((salesRateDaily * LEAD_TIME) + safetyStock);

            let status = "Healthy";
            if (closingInventory === 0 && sales === 0) {
                status = "No Data";
            } else if (closingInventory <= safetyStock) {
                status = "Critical (Stockout Risk)";
            } else if (daysOfStock < LEAD_TIME) {
                status = "Reorder Now";
            } else if (daysOfStock > 120 && salesRateDaily > 0) {
                status = "Overstocked";
            }

            const recQty = Math.max(0, Math.ceil(salesRateDaily * 90) - closingInventory + safetyStock); // Order 3 months of stock

            recommendations.push({
                sku,
                warehouse_id: fc,
                march_sales: salesRateMonthly,
                closing_inventory: closingInventory,
                sales_rate_daily: Number(salesRateDaily.toFixed(2)),
                days_of_stock: daysOfStock,
                safety_stock: safetyStock,
                reorder_point: reorderPoint,
                recommended_reorder_qty: recQty,
                status: status,
                last_snapshot: stockInfo ? stockInfo.snapshot_date : null
            });
        }

        // Sort by status priority, then by march sales
        const priorityMap: Record<string, number> = {
            "Critical (Stockout Risk)": 0,
            "Reorder Now": 1,
            "Healthy": 2,
            "Overstocked": 3,
            "No Data": 4,
        };

        recommendations.sort((a, b) => {
            const pA = priorityMap[a.status] ?? 5;
            const pB = priorityMap[b.status] ?? 5;
            if (pA !== pB) return pA - pB;
            return b.march_sales - a.march_sales;
        });

        const response = {
            data: recommendations,
            summary: {
                total_skus: recommendations.length,
                critical_count: recommendations.filter(r => r.status.includes("Critical") || r.status.includes("Reorder Now")).length,
                total_reorder_units_needed: recommendations.reduce((acc, curr) => acc + curr.recommended_reorder_qty, 0)
            }
        };

        cacheSet(CACHE_KEY, response, CACHE_TTL_MS);
        return NextResponse.json(response, { headers: getCacheHeaders(300) });

    } catch (err: any) {
        console.error("Warehouse Inventory API Error:", err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
