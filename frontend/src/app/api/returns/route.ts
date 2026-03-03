import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get("page") || "1");
        const perPage = parseInt(url.searchParams.get("per_page") || "200");
        const offset = (page - 1) * perPage;

        const result = await query(
            `SELECT * FROM returns ORDER BY return_date DESC LIMIT $1 OFFSET $2`,
            [perPage, offset]
        );

        const countResult = await query<{ total: string }>(`SELECT COUNT(*)::text as total FROM returns`);
        const total = parseInt(countResult.rows[0]?.total || "0");

        return NextResponse.json({
            data: result.rows,
            total,
            page,
            per_page: perPage,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Returns API Error:", message);
        return NextResponse.json({ data: [], total: 0, error: message }, { status: 500 });
    }
}
