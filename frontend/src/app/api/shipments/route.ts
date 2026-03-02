import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/shipments — fetch all shipments
export async function GET() {
    try {
        const { rows } = await query(
            `SELECT * FROM shipments ORDER BY order_id DESC`
        );
        return NextResponse.json(rows);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Shipments GET Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/shipments — create or update a shipment (upsert by order_id)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.order_id) {
            return NextResponse.json(
                { error: "order_id is required" },
                { status: 400 }
            );
        }

        const { rows } = await query(
            `INSERT INTO shipments (order_id, sku, shipping_cost, carrier, tracking_number, shipped_date)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (order_id) DO UPDATE SET
                sku = EXCLUDED.sku,
                shipping_cost = EXCLUDED.shipping_cost,
                carrier = EXCLUDED.carrier,
                tracking_number = EXCLUDED.tracking_number,
                shipped_date = EXCLUDED.shipped_date
             RETURNING *`,
            [
                body.order_id.trim(),
                body.sku || null,
                body.shipping_cost || 0,
                body.carrier || null,
                body.tracking_number || null,
                body.shipped_date || null,
            ]
        );

        return NextResponse.json(rows[0]);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Shipments POST Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/shipments — delete a shipment by order_id
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");

    if (!orderId) {
        return NextResponse.json(
            { error: "order_id is required" },
            { status: 400 }
        );
    }

    try {
        await query(`DELETE FROM shipments WHERE order_id = $1`, [orderId]);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Shipments DELETE Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
