import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/sales — proxy to Supabase sales_data with pagination and filters
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "100");
    const sku = searchParams.get("sku");
    const brand = searchParams.get("brand");
    const orderId = searchParams.get("order_id");

    let query = supabase
        .from("sales_data")
        .select("*", { count: "exact" })
        .order("id", { ascending: false });

    if (sku) query = query.eq("Sku", sku);
    if (brand) query = query.eq("BRAND", brand);
    if (orderId) query = query.eq("Order Id", orderId);

    const offset = (page - 1) * perPage;
    query = query.range(offset, offset + perPage - 1);

    const { data, error, count } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        data,
        total: count || 0,
        page,
        per_page: perPage,
        total_pages: Math.ceil((count || 0) / perPage),
    });
}
