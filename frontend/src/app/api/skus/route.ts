import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
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

        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("SKUs API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
