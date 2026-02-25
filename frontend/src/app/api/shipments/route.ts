import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/shipments — fetch shipments, optionally filtered by order_id
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");

    let query = supabase.from("shipments").select("*").order("id", { ascending: false });

    if (orderId) {
        query = query.eq("order_id", orderId);
    }

    const { data, error } = await query.limit(1000);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}

// POST /api/shipments — create or update a shipment record
export async function POST(request: NextRequest) {
    const body = await request.json();

    if (!body.order_id) {
        return NextResponse.json(
            { error: "order_id is required" },
            { status: 400 }
        );
    }

    const record = {
        order_id: body.order_id.toLowerCase().trim(),
        sku: body.sku ? body.sku.toLowerCase().trim() : null,
        shipping_cost: body.shipping_cost || 0,
        carrier: body.carrier || null,
        tracking_number: body.tracking_number || null,
        shipped_date: body.shipped_date || null,
    };

    // If ID is provided, update; otherwise insert
    if (body.id) {
        const { data, error } = await supabase
            .from("shipments")
            .update(record)
            .eq("id", body.id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data);
    }

    const { data, error } = await supabase
        .from("shipments")
        .insert(record)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}
