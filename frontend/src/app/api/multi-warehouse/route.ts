import { NextResponse } from "next/server";

export const revalidate = 0; // Disable static caching for this proxy

export async function GET() {
    try {
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/api/v1/forecast/multi-warehouse`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            // Avoid caching so alerts are always live
            cache: "no-store",
        });

        if (!res.ok) {
            const err = await res.text();
            return NextResponse.json(
                { error: `Backend returned ${res.status}: ${err}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json({ data });
    } catch (e: any) {
        console.error("Multi-Warehouse API proxy failed:", e);
        return NextResponse.json(
            { error: "Failed to connect to backend service" },
            { status: 500 }
        );
    }
}
