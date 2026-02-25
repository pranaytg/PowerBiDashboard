import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/profitability — calculate profitability by joining sales + cogs + shipments
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const sku = searchParams.get("sku");
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "50");

    try {
        // 1. Fetch COGS data (keyed by SKU)
        const { data: cogsData, error: cogsError } = await supabase
            .from("cogs")
            .select("*");

        if (cogsError) throw cogsError;

        const cogsMap: Record<string, {
            landed_cost: number;
            halte_cost_price: number;
            msp: number;
            selling_price: number;
            import_price_inr: number;
            custom_duty_amt: number;
            gst1_amt: number;
            shipping_cost: number;
            margin1_amt: number;
            marketing_cost: number;
            margin2_amt: number;
            gst2_amt: number;
        }> = {};
        for (const c of cogsData || []) {
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
            };
        }

        // 2. Fetch shipments data (keyed by order_id)
        const { data: shipData, error: shipError } = await supabase
            .from("shipments")
            .select("*");

        if (shipError) throw shipError;

        const shipMap: Record<string, number> = {};
        for (const s of shipData || []) {
            const key = s.order_id;
            shipMap[key] = (shipMap[key] || 0) + (parseFloat(s.shipping_cost) || 0);
        }

        // 3. Fetch sales data with filters
        let salesQuery = supabase
            .from("sales_data")
            .select("*", { count: "exact" })
            .not("Transaction Type", "eq", "return")
            .order("id", { ascending: false });

        if (orderId) {
            salesQuery = salesQuery.eq("Order Id", orderId);
        }
        if (sku) {
            salesQuery = salesQuery.eq("Sku", sku);
        }

        const offset = (page - 1) * perPage;
        salesQuery = salesQuery.range(offset, offset + perPage - 1);

        const { data: salesData, error: salesError, count } = await salesQuery;
        if (salesError) throw salesError;

        // 4. Join and calculate profitability
        const results = (salesData || []).map((sale) => {
            const skuKey = sale["Sku"] || "";
            const orderKey = sale["Order Id"] || "";
            const cogs = cogsMap[skuKey];
            const shipCost = shipMap[orderKey] || 0;
            const qty = sale["Quantity"] || 0;
            const invoiceAmt = parseFloat(sale["Invoice Amount"]) || 0;

            if (!cogs) {
                return {
                    order_id: orderKey,
                    sku: skuKey,
                    date: sale["Date"],
                    brand: sale["BRAND"],
                    product: sale["Item Description"],
                    quantity: qty,
                    invoice_amount: invoiceAmt,
                    shipment_cost: shipCost,
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
                    // Breakdown
                    import_price_inr: 0,
                    custom_duty_amt: 0,
                    gst1_amt: 0,
                    cogs_shipping: 0,
                    margin1_amt: 0,
                    marketing_cost: 0,
                    margin2_amt: 0,
                    gst2_amt: 0,
                    msp: 0,
                };
            }

            const totalCogs = cogs.halte_cost_price * qty;
            const jhProfit = (cogs.halte_cost_price - cogs.landed_cost) * qty;
            const jhRevenue = cogs.halte_cost_price * qty;
            const halteProfit = invoiceAmt - totalCogs - shipCost;

            return {
                order_id: orderKey,
                sku: skuKey,
                date: sale["Date"],
                brand: sale["BRAND"],
                product: sale["Item Description"],
                quantity: qty,
                invoice_amount: round2(invoiceAmt),
                shipment_cost: round2(shipCost),
                cogs_available: true,
                landed_cost_unit: round2(cogs.landed_cost),
                halte_cost_price_unit: round2(cogs.halte_cost_price),
                total_cogs: round2(totalCogs),
                jh_profit: round2(jhProfit),
                jh_margin_pct: jhRevenue > 0 ? round2((jhProfit / jhRevenue) * 100) : 0,
                halte_profit: round2(halteProfit),
                halte_margin_pct: invoiceAmt > 0 ? round2((halteProfit / invoiceAmt) * 100) : 0,
                total_profit: round2(jhProfit + halteProfit),
                total_margin_pct: invoiceAmt > 0 ? round2(((jhProfit + halteProfit) / invoiceAmt) * 100) : 0,
                // Breakdown
                import_price_inr: round2(cogs.import_price_inr),
                custom_duty_amt: round2(cogs.custom_duty_amt),
                gst1_amt: round2(cogs.gst1_amt),
                cogs_shipping: round2(cogs.shipping_cost),
                margin1_amt: round2(cogs.margin1_amt),
                marketing_cost: round2(cogs.marketing_cost),
                margin2_amt: round2(cogs.margin2_amt),
                gst2_amt: round2(cogs.gst2_amt),
                msp: round2(cogs.msp),
            };
        });

        // 5. Compute summary
        const summary = {
            total_revenue: round2(results.reduce((s, r) => s + r.invoice_amount, 0)),
            total_cogs: round2(results.reduce((s, r) => s + r.total_cogs, 0)),
            total_shipping: round2(results.reduce((s, r) => s + r.shipment_cost, 0)),
            total_jh_profit: round2(results.reduce((s, r) => s + r.jh_profit, 0)),
            total_halte_profit: round2(results.reduce((s, r) => s + r.halte_profit, 0)),
            total_profit: round2(results.reduce((s, r) => s + r.total_profit, 0)),
            orders_with_cogs: results.filter((r) => r.cogs_available).length,
            orders_without_cogs: results.filter((r) => !r.cogs_available).length,
        };

        return NextResponse.json({
            data: results,
            summary,
            total: count || 0,
            page,
            per_page: perPage,
            total_pages: Math.ceil((count || 0) / perPage),
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
