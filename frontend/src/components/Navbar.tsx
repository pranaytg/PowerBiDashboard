"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
    { href: "/", label: "Dashboard", icon: "📊" },
    { href: "/cogs", label: "COGS", icon: "💰" },
    { href: "/profitability", label: "Profitability", icon: "📈" },
    { href: "/finances", label: "Finances", icon: "🏦" },
    { href: "/returns", label: "Returns", icon: "↩️" },
    { href: "/inventory", label: "Inventory", icon: "🔮" },
    { href: "/shipments", label: "Shipments", icon: "🚚" },
];

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();

    // Hide navbar on login page
    if (pathname === "/login") return null;

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
    };

    return (
        <nav
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "64px",
                background: "rgba(10, 10, 15, 0.85)",
                backdropFilter: "blur(16px)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 1.5rem",
                zIndex: 100,
            }}
        >
            <Link
                href="/"
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    textDecoration: "none",
                    color: "var(--text-primary)",
                }}
            >
                <span
                    style={{
                        background: "var(--gradient-1)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        fontSize: "1.25rem",
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                    }}
                >
                    JH — HALTE
                </span>
                <span
                    style={{
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                        fontWeight: 500,
                        border: "1px solid var(--border)",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "999px",
                    }}
                >
                    Analytics
                </span>
            </Link>

            <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.375rem",
                                padding: "0.5rem 0.875rem",
                                borderRadius: "8px",
                                textDecoration: "none",
                                fontSize: "0.8125rem",
                                fontWeight: isActive ? 600 : 500,
                                color: isActive
                                    ? "var(--accent-indigo-light)"
                                    : "var(--text-secondary)",
                                background: isActive
                                    ? "rgba(99, 102, 241, 0.1)"
                                    : "transparent",
                                border: isActive
                                    ? "1px solid rgba(99, 102, 241, 0.2)"
                                    : "1px solid transparent",
                                transition: "all 0.2s",
                            }}
                        >
                            <span style={{ fontSize: "0.875rem" }}>{item.icon}</span>
                            {item.label}
                        </Link>
                    );
                })}

                {/* Logout button */}
                <button
                    onClick={handleLogout}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.5rem 0.875rem",
                        borderRadius: "8px",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        color: "var(--accent-rose)",
                        background: "transparent",
                        border: "1px solid transparent",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        marginLeft: "0.5rem",
                    }}
                >
                    🚪 Logout
                </button>
            </div>
        </nav>
    );
}

