import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/", "/cogs", "/profitability", "/finances", "/returns", "/inventory", "/shipments"];
const PUBLIC_PATHS = ["/login"];
const API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public paths and auth API routes
    if (PUBLIC_PATHS.includes(pathname) || API_PATHS.includes(pathname)) {
        return NextResponse.next();
    }

    // Allow all other API routes (they need the session cookie but don't redirect)
    if (pathname.startsWith("/api/")) {
        const session = request.cookies.get("admin_session")?.value;
        if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.next();
    }

    // Protect all page routes
    const session = request.cookies.get("admin_session")?.value;
    if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico, images, etc.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
