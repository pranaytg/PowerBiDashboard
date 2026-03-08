import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, makeCacheKey, getCacheHeaders } from "@/lib/cache";

const CACHE_TTL_MS = 120_000; // 2 minutes

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const perPage = parseInt(url.searchParams.get("per_page") || "200");
    const offset = (page - 1) * perPage;

    // Check cache
    const cacheKey = makeCacheKey("returns", url.searchParams);
    const cached = cacheGet<object>(cacheKey);
    if (cached) {
        return NextResponse.json(cached, { headers: getCacheHeaders(120) });
    }

    try {
        const result = await query(
            `SELECT * FROM returns ORDER BY return_date DESC LIMIT $1 OFFSET $2`,
            [perPage, offset]
        );

        const countResult = await query<{ total: string }>(`SELECT COUNT(*)::text as total FROM returns`);
        const total = parseInt(countResult.rows[0]?.total || "0");

        const response = {
            data: result.rows,
            total,
            page,
            per_page: perPage,
        };

        cacheSet(cacheKey, response, CACHE_TTL_MS);
        return NextResponse.json(response, { headers: getCacheHeaders(120) });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Returns API Error:", message);
        return NextResponse.json({ data: [], total: 0, error: message }, { status: 500 });
    }
}
