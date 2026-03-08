import { NextRequest, NextResponse } from "next/server";
import { queryWithCount } from "@/lib/db";
import { cacheGet, cacheSet, makeCacheKey, getCacheHeaders } from "@/lib/cache";

const CACHE_TTL_MS = 60_000; // 60 seconds

// GET /api/sales — fetch sales_data with pagination and filters
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const perPage = parseInt(searchParams.get("per_page") || "100");
    const sku = searchParams.get("sku");
    const brand = searchParams.get("brand");
    const orderId = searchParams.get("order_id");

    // Check cache
    const cacheKey = makeCacheKey("sales", searchParams);
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
        return NextResponse.json(cached, { headers: getCacheHeaders(60) });
    }

    const conditions: string[] = [`"Transaction Type" != 'return'`];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (sku) {
        conditions.push(`"Sku" ILIKE $${paramIdx++}`);
        params.push(`%${sku}%`);
    }
    if (brand) {
        conditions.push(`"BRAND" = $${paramIdx++}`);
        params.push(brand);
    }
    if (orderId) {
        conditions.push(`"Order Id" ILIKE $${paramIdx++}`);
        params.push(`%${orderId}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * perPage;

    try {
        const { rows: data, total: count } = await queryWithCount(
            `SELECT * FROM sales_data ${where} ORDER BY id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            `SELECT COUNT(*) as count FROM sales_data ${where}`,
            [...params, perPage, offset],
            params
        );

        const result = {
            data,
            total: count,
            page,
            per_page: perPage,
            total_pages: Math.ceil(count / perPage),
        };

        cacheSet(cacheKey, result, CACHE_TTL_MS);
        return NextResponse.json(result, { headers: getCacheHeaders(60) });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Sales API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
