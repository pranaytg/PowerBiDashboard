import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/cogs — fetch all COGS records
export async function GET() {
    const { data, error } = await supabase
        .from("cogs")
        .select("*")
        .order("sku");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}

// POST /api/cogs — create or update a COGS record (upsert by SKU)
export async function POST(request: NextRequest) {
    const body = await request.json();

    // Validate required fields
    if (!body.sku) {
        return NextResponse.json({ error: "SKU is required" }, { status: 400 });
    }

    const record = {
        sku: body.sku.toLowerCase().trim(),
        product_name: body.product_name || null,
        import_price: body.import_price || 0,
        currency: body.currency || "USD",
        exchange_rate: body.exchange_rate || 1,
        custom_duty_pct: body.custom_duty_pct || 0,
        gst1_pct: body.gst1_pct || 0,
        shipping_cost: body.shipping_cost || 0,
        margin1_pct: body.margin1_pct || 0,
        marketing_cost: body.marketing_cost || 0,
        margin2_pct: body.margin2_pct || 0,
        gst2_pct: body.gst2_pct || 0,
    };

    const { data, error } = await supabase
        .from("cogs")
        .upsert(record, { onConflict: "sku" })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}

// DELETE /api/cogs — delete a COGS record by SKU
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const sku = searchParams.get("sku");

    if (!sku) {
        return NextResponse.json({ error: "SKU is required" }, { status: 400 });
    }

    const { error } = await supabase.from("cogs").delete().eq("sku", sku);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
