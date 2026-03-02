import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/cogs — fetch all COGS records
export async function GET() {
    try {
        const { rows } = await query(`SELECT * FROM cogs ORDER BY sku`);
        return NextResponse.json(rows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("COGS GET Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/cogs — create or update a COGS record (upsert by SKU)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        const { rows } = await query(
            `INSERT INTO cogs (sku, product_name, import_price, currency, exchange_rate, custom_duty_pct, gst1_pct, shipping_cost, margin1_pct, marketing_cost, margin2_pct, gst2_pct)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (sku) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                import_price = EXCLUDED.import_price,
                currency = EXCLUDED.currency,
                exchange_rate = EXCLUDED.exchange_rate,
                custom_duty_pct = EXCLUDED.custom_duty_pct,
                gst1_pct = EXCLUDED.gst1_pct,
                shipping_cost = EXCLUDED.shipping_cost,
                margin1_pct = EXCLUDED.margin1_pct,
                marketing_cost = EXCLUDED.marketing_cost,
                margin2_pct = EXCLUDED.margin2_pct,
                gst2_pct = EXCLUDED.gst2_pct
             RETURNING *`,
            [
                body.sku.toLowerCase().trim(),
                body.product_name || null,
                body.import_price || 0,
                body.currency || "USD",
                body.exchange_rate || 1,
                body.custom_duty_pct || 0,
                body.gst1_pct || 0,
                body.shipping_cost || 0,
                body.margin1_pct || 0,
                body.marketing_cost || 0,
                body.margin2_pct || 0,
                body.gst2_pct || 0,
            ]
        );

        return NextResponse.json(rows[0]);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("COGS POST Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/cogs — delete a COGS record by SKU
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku");

    if (!sku) {
        return NextResponse.json({ error: "SKU is required" }, { status: 400 });
    }

    try {
        await query(`DELETE FROM cogs WHERE sku = $1`, [sku]);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("COGS DELETE Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
