import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/skus — get distinct SKUs from sales_data for dropdowns
export async function GET() {
    const { data, error } = await supabase
        .from("sales_data")
        .select("Sku, BRAND, Item Description, Category")
        .not("Sku", "is", null)
        .limit(5000);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate by SKU
    const skuMap: Record<string, { sku: string; brand: string; name: string; category: string }> = {};
    for (const row of data || []) {
        const sku = row["Sku"];
        if (sku && !skuMap[sku]) {
            skuMap[sku] = {
                sku,
                brand: row["BRAND"] || "",
                name: row["Item Description"] || "",
                category: row["Category"] || "",
            };
        }
    }

    return NextResponse.json(Object.values(skuMap).sort((a, b) => a.sku.localeCompare(b.sku)));
}
