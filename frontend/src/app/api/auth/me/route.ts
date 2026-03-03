import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const session = request.cookies.get("admin_session")?.value;
    const sessionSecret = process.env.ADMIN_SESSION_SECRET;

    if (!session || !sessionSecret || session !== sessionSecret) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
        authenticated: true,
        email: process.env.ADMIN_EMAIL,
    });
}
