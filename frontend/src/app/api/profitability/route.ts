import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, makeCacheKey, getCacheHeaders } from "@/lib/cache";
import { calculateProfitability } from "@/lib/calculations";

export const maxDuration = 60; // Allow 60s for massive aggregations

const CACHE_TTL_MS = 120_000; // 2 minutes — expensive aggregation

interface CogsRow {
    sku: string;
    landed_cost: string;
    halte_cost_price: string;
    msp: string;
    selling_price: string;
    import_price_inr: string;
    custom_duty_amt: string;
    gst1_amt: string;
    shipping_cost: string;
    margin1_amt: string;
    marketing_cost: string;
    margin2_amt: string;
    gst2_amt: string;
    platform_fee_pct?: string;
    gst2_pct?: string;
}

interface ShipRow {
    order_id: string;
    shipping_cost: string;
}

interface SaleRow {
    "Order Id": string;
    "Sku": string;
    "Date": string;
    "BRAND": string;
    "Item Description": string;
    "Quantity": string;
    "Ship To State": string;
    "Month_Name": string;
    "Month_Num": string;
    "Year": string;
    "Invoice Amount": string;
}

interface SnapshotRow {
    order_id: string;
    sku: string;
    landed_cost: string;
    halte_cost_price: string;
    shipping_cost: string;
}

// GET /api/profitability — calculate profitability by joining sales + cogs + shipments
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const sku = searchParams.get("sku");
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "50");

    // Check cache
    const cacheKey = makeCacheKey("profitability", searchParams);
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
        return NextResponse.json(cached, { headers: getCacheHeaders(120) });
    }

    try {
        // 1. Fetch COGS data
        const { rows: cogsData } = await query<CogsRow>(`SELECT * FROM cogs`);

        const cogsMap: Record<string, Record<string, number>> = {};
        for (const c of cogsData) {
            cogsMap[c.sku] = {
                landed_cost: parseFloat(c.landed_cost) || 0,
                halte_cost_price: parseFloat(c.halte_cost_price) || 0,
                msp: parseFloat(c.msp) || 0,
                selling_price: parseFloat(c.selling_price) || 0,
                import_price_inr: parseFloat(c.import_price_inr) || 0,
                custom_duty_amt: parseFloat(c.custom_duty_amt) || 0,
                gst1_amt: parseFloat(c.gst1_amt) || 0,
                shipping_cost: parseFloat(c.shipping_cost) || 0,
                margin1_amt: parseFloat(c.margin1_amt) || 0,
                marketing_cost: parseFloat(c.marketing_cost) || 0,
                margin2_amt: parseFloat(c.margin2_amt) || 0,
                gst2_amt: parseFloat(c.gst2_amt) || 0,
                platform_fee_pct: parseFloat(c.platform_fee_pct || "15"),
                gst2_pct: parseFloat(c.gst2_pct || "18"),
            };
        }

        // 2. Fetch shipments data
        const { rows: shipData } = await query<ShipRow>(`SELECT * FROM shipments`);

        const shipMap: Record<string, number> = {};
        for (const s of shipData) {
            const key = s.order_id;
            shipMap[key] = (shipMap[key] || 0) + (parseFloat(s.shipping_cost) || 0);
        }

        // 3. Fetch sales data with filters
        const conditions: string[] = [`"Transaction Type" != 'return'`];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (orderId) {
            conditions.push(`"Order Id" ILIKE $${paramIdx++}`);
            params.push(`%${orderId}%`);
        }
        if (sku) {
            conditions.push(`"Sku" ILIKE $${paramIdx++}`);
            params.push(`%${sku}%`);
        }

        const where = `WHERE ${conditions.join(" AND ")}`;
        const offset = (page - 1) * perPage;

        const countParams = [...params];
        const dataParams = [...params, perPage, offset];

        const countSql = `SELECT COUNT(*) as count FROM sales_data ${where}`;
        const dataSql = `SELECT "Order Id", "Sku", "Date", "BRAND", "Item Description", "Quantity", "Ship To State", "Month_Name", "Month_Num", "Year", "Invoice Amount"
                         FROM sales_data ${where}
                         ORDER BY id DESC
                         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;

        const [{ rows: salesData }, countResult] = await Promise.all([
            query<SaleRow>(dataSql, dataParams),
            query<{ count: string }>(countSql, countParams),
        ]);

        const count = parseInt(countResult.rows[0]?.count || "0");

        // 3b. Fetch snapshots for the current page of orders
        const orderIds = salesData.map((s) => s["Order Id"]).filter(Boolean);
        let snapshotMap: Record<string, SnapshotRow> = {};

        if (orderIds.length > 0) {
            const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(",");
            const { rows: snapData } = await query<SnapshotRow>(
                `SELECT * FROM order_cogs_snapshot WHERE order_id IN (${placeholders})`,
                orderIds
            );
            for (const s of snapData) {
                snapshotMap[`${s.order_id}_${s.sku}`] = s;
            }
        }

        const snapshotsToInsert: { order_id: string; sku: string; landed_cost: number; halte_cost_price: number; shipping_cost: number }[] = [];

        // 4. Join and calculate profitability
        const results = salesData.map((sale) => {
            const skuKey = sale["Sku"] || "";
            const orderKey = sale["Order Id"] || "";
            const qty = parseInt(sale["Quantity"]) || 0;
            const invoiceAmt = parseFloat(sale["Invoice Amount"]) || 0;
            const shipCost = shipMap[orderKey] || 0;

            const snapshotKey = `${orderKey}_${skuKey}`;

            let landedCost = 0;
            let halteCost = 0;
            let isCogsAvailable = false;
            const cogs = cogsMap[skuKey];

            if (snapshotMap[snapshotKey]) {
                const s = snapshotMap[snapshotKey];
                landedCost = parseFloat(s.landed_cost) || 0;
                halteCost = parseFloat(s.halte_cost_price) || 0;
                isCogsAvailable = true;
            } else if (cogs) {
                landedCost = cogs.landed_cost;
                halteCost = cogs.halte_cost_price;
                isCogsAvailable = true;

                snapshotsToInsert.push({
                    order_id: orderKey,
                    sku: skuKey,
                    landed_cost: landedCost,
                    halte_cost_price: halteCost,
                    shipping_cost: shipCost,
                });
            }

            const baseOutput = {
                order_id: orderKey,
                sku: skuKey,
                date: sale["Date"],
                brand: sale["BRAND"],
                product: sale["Item Description"],
                quantity: qty,
                state: sale["Ship To State"] || "Unknown",
                month: sale["Month_Name"] || "Unknown",
                month_num: parseInt(sale["Month_Num"]) || 0,
                year: parseInt(sale["Year"]) || 0,
                invoice_amount: round2(invoiceAmt),
                shipment_cost: round2(shipCost),
            };

            if (!isCogsAvailable) {
                return {
                    ...baseOutput,
                    cogs_available: false,
                    landed_cost_unit: 0,
                    halte_cost_price_unit: 0,
                    total_cogs: 0,
                    jh_profit: 0,
                    jh_margin_pct: 0,
                    halte_profit: 0,
                    halte_margin_pct: 0,
                    total_profit: 0,
                    total_margin_pct: 0,
                    amazon_fee_amt: 0,
                    import_price_inr: 0, custom_duty_amt: 0, gst1_amt: 0, cogs_shipping: 0,
                    margin1_amt: 0, marketing_cost: 0, margin2_amt: 0, gst2_amt: 0, msp: 0,
                };
            }

            const prof = calculateProfitability({
                invoice_amount: invoiceAmt,
                quantity: qty,
                halte_cost_price: halteCost,
                landed_cost: landedCost,
                shipment_cost: shipCost,
                platform_fee_pct: cogs?.platform_fee_pct ?? 15,
                gst2_pct: cogs?.gst2_pct ?? 18,
            });

            return {
                ...baseOutput,
                cogs_available: true,
                landed_cost_unit: round2(landedCost),
                halte_cost_price_unit: round2(halteCost),
                total_cogs: prof.total_cogs,
                jh_profit: prof.jh_profit,
                jh_margin_pct: prof.jh_margin_pct,
                halte_profit: prof.halte_profit,
                halte_margin_pct: prof.halte_margin_pct,
                total_profit: prof.total_profit,
                total_margin_pct: prof.total_margin_pct,
                amazon_fee_amt: prof.amazon_fee_amt,
                import_price_inr: cogs ? round2(cogs.import_price_inr) : 0,
                custom_duty_amt: cogs ? round2(cogs.custom_duty_amt) : 0,
                gst1_amt: cogs ? round2(cogs.gst1_amt) : 0,
                cogs_shipping: cogs ? round2(cogs.shipping_cost) : 0,
                margin1_amt: cogs ? round2(cogs.margin1_amt) : 0,
                marketing_cost: cogs ? round2(cogs.marketing_cost) : 0,
                margin2_amt: cogs ? round2(cogs.margin2_amt) : 0,
                gst2_amt: cogs ? round2(cogs.gst2_amt) : 0,
                msp: cogs ? round2(cogs.msp) : 0,
            };
        });

        // Background insertion of missing snapshots
        if (snapshotsToInsert.length > 0) {
            const values = snapshotsToInsert.map((s, i) => {
                const base = i * 5;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
            }).join(", ");
            const flatParams = snapshotsToInsert.flatMap(s => [s.order_id, s.sku, s.landed_cost, s.halte_cost_price, s.shipping_cost]);

            query(
                `INSERT INTO order_cogs_snapshot (order_id, sku, landed_cost, halte_cost_price, shipping_cost)
                 VALUES ${values}
                 ON CONFLICT (order_id, sku) DO NOTHING`,
                flatParams
            ).catch((err) => {
                console.error("Failed to snapshot order COGS:", err);
            });
        }

        // 5. Compute summary
        const summary = {
            total_revenue: round2(results.reduce((s, r) => s + r.invoice_amount, 0)),
            total_cogs: round2(results.reduce((s, r) => s + r.total_cogs, 0)),
            total_shipping: round2(results.reduce((s, r) => s + r.shipment_cost, 0)),
            total_amazon_fees: round2(results.reduce((s, r) => s + (r.amazon_fee_amt || 0), 0)),
            total_jh_profit: round2(results.reduce((s, r) => s + r.jh_profit, 0)),
            total_halte_profit: round2(results.reduce((s, r) => s + r.halte_profit, 0)),
            total_profit: round2(results.reduce((s, r) => s + r.total_profit, 0)),
            orders_with_cogs: results.filter((r) => r.cogs_available).length,
            orders_without_cogs: results.filter((r) => !r.cogs_available).length,
        };

        const response = {
            data: results,
            summary,
            total: count,
            page,
            per_page: perPage,
            total_pages: Math.ceil(count / perPage),
        };

        cacheSet(cacheKey, response, CACHE_TTL_MS);
        return NextResponse.json(response, { headers: getCacheHeaders(120) });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error("Profitability API Error:", message);
        return NextResponse.json({ error: message, stack }, { status: 500 });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
