import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, getCacheHeaders } from "@/lib/cache";

const CACHE_TTL_MS = 300_000; // 5 minutes — SKU list rarely changes
const CACHE_KEY = "skus_distinct";

export async function GET() {
    // Check cache
    const cached = cacheGet<object[]>(CACHE_KEY);
    if (cached) {
        return NextResponse.json(cached, { headers: getCacheHeaders(300) });
    }

    try {
        const { rows } = await query<{
            Sku: string;
            BRAND: string;
            "Item Description": string;
            Category: string;
        }>(
            `SELECT DISTINCT ON ("Sku") "Sku", "BRAND", "Item Description", "Category"
             FROM sales_data
             WHERE "Sku" IS NOT NULL
             ORDER BY "Sku"`
        );

        const result = rows.map((row) => ({
            sku: row.Sku,
            brand: row.BRAND || "",
            name: row["Item Description"] || "",
            category: row.Category || "",
        }));

        cacheSet(CACHE_KEY, result, CACHE_TTL_MS);
        return NextResponse.json(result, { headers: getCacheHeaders(300) });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("SKUs API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
