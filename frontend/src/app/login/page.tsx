"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Login failed");
                setLoading(false);
                return;
            }

            router.push("/");
            router.refresh();
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-primary)",
                padding: "1rem",
            }}
        >
            <div
                className="glass-card animate-fade-in"
                style={{
                    width: "100%",
                    maxWidth: "420px",
                    padding: "2.5rem",
                }}
            >
                {/* Logo */}
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginBottom: "1rem",
                        }}
                    >
                        <div
                            style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "10px",
                                background: "var(--gradient-1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "1.25rem",
                                fontWeight: 800,
                                color: "white",
                            }}
                        >
                            JH
                        </div>
                        <span
                            style={{
                                fontSize: "1.25rem",
                                fontWeight: 700,
                                letterSpacing: "-0.02em",
                            }}
                        >
                            JH — HALTE
                        </span>
                    </div>
                    <h1
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            marginBottom: "0.5rem",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        Admin Login
                    </h1>
                    <p
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                        }}
                    >
                        Sign in to access the analytics dashboard
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div
                        style={{
                            background: "rgba(244, 63, 94, 0.1)",
                            border: "1px solid var(--accent-rose)",
                            borderRadius: "8px",
                            padding: "0.75rem 1rem",
                            marginBottom: "1.5rem",
                            color: "var(--accent-rose)",
                            fontSize: "0.875rem",
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: "1.25rem" }}>
                        <label
                            htmlFor="email"
                            style={{
                                display: "block",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: "0.5rem",
                            }}
                        >
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            className="input-field"
                            placeholder="admin@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            style={{ padding: "0.75rem" }}
                        />
                    </div>

                    <div style={{ marginBottom: "1.75rem" }}>
                        <label
                            htmlFor="password"
                            style={{
                                display: "block",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                marginBottom: "0.5rem",
                            }}
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            style={{ padding: "0.75rem" }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{
                            width: "100%",
                            padding: "0.875rem",
                            fontSize: "0.9375rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                        }}
                    >
                        {loading ? (
                            <>
                                <div className="spinner" style={{ width: 18, height: 18 }} />
                                Signing in...
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </button>
                </form>

                <p
                    style={{
                        textAlign: "center",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: "1.5rem",
                    }}
                >
                    Authorized personnel only
                </p>
            </div>
        </div>
    );
}
