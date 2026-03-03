import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;

        if (!adminEmail || !adminPassword || !sessionSecret) {
            return NextResponse.json(
                { error: "Auth not configured" },
                { status: 500 }
            );
        }

        if (email !== adminEmail || password !== adminPassword) {
            return NextResponse.json(
                { error: "Invalid email or password" },
                { status: 401 }
            );
        }

        // Set session cookie
        const response = NextResponse.json({ success: true, email: adminEmail });
        response.cookies.set("admin_session", sessionSecret, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return response;
    } catch {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
}
