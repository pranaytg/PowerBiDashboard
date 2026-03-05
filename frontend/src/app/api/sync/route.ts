import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// POST /api/sync — proxy to backend refresh endpoint
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const dateFrom = body.date_from || "";
        const dateTo = body.date_to || "";
        const reportTypes = body.report_types || ["ORDERS"];

        const res = await fetch(`${BACKEND_URL}/api/v1/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, report_types: reportTypes }),
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Sync proxy error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// GET /api/sync — proxy to backend refresh status
export async function GET() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/v1/refresh/status`);
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Sync status error:", message);
        return NextResponse.json({ error: message, status: "unknown" }, { status: 500 });
    }
}
