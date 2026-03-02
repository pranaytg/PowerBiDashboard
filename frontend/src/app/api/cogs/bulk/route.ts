import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// POST /api/cogs/bulk — bulk update exchange rate for a currency
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.currency || !body.exchange_rate) {
            return NextResponse.json(
                { error: "currency and exchange_rate are required" },
                { status: 400 }
            );
        }

        const { rowCount } = await query(
            `UPDATE cogs SET exchange_rate = $1 WHERE currency = $2`,
            [parseFloat(body.exchange_rate), body.currency]
        );

        return NextResponse.json({ success: true, updated: rowCount });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("COGS Bulk Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
