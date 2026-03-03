"use client";

import { useEffect, useState, useMemo } from "react";

interface ReturnRecord {
    id: number;
    return_date: string;
    order_id: string;
    sku: string;
    asin: string;
    fnsku: string;
    product_name: string;
    quantity: number;
    fulfillment_center_id: string;
    detailed_disposition: string;
    reason: string;
    status: string;
    customer_comments: string;
}

export default function ReturnsPage() {
    const [data, setData] = useState<ReturnRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterReason, setFilterReason] = useState("All");

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/returns?per_page=5000");
                const json = await res.json();
                setData(json.data || []);
            } catch (e) {
                console.error("Returns load error:", e);
            }
            setLoading(false);
        }
        load();
    }, []);

    const allReasons = useMemo(() => {
        const set = new Set<string>();
        data.forEach((r) => { if (r.reason) set.add(r.reason); });
        return Array.from(set).sort();
    }, [data]);

    const filtered = useMemo(() => {
        return data.filter((r) => {
            const matchSearch =
                searchTerm === "" ||
                r.order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.product_name || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchReason = filterReason === "All" || r.reason === filterReason;
            return matchSearch && matchReason;
        });
    }, [data, searchTerm, filterReason]);

    const summary = useMemo(() => {
        const reasons = new Map<string, number>();
        filtered.forEach((r) => {
            const key = r.reason || "Unknown";
            reasons.set(key, (reasons.get(key) || 0) + 1);
        });
        const topReasons = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return {
            totalReturns: filtered.length,
            totalQty: filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
            uniqueSkus: new Set(filtered.map((r) => r.sku)).size,
            topReasons,
        };
    }, [filtered]);

    async function syncReturns() {
        setSyncing(true);
        try {
            const res = await fetch("http://localhost:8000/api/v1/returns/sync?date_from=2026-01-01&date_to=2026-03-03", { method: "POST" });
            const json = await res.json();
            alert(json.message || "Sync started!");
            setTimeout(async () => {
                const res2 = await fetch("/api/returns?per_page=5000");
                const json2 = await res2.json();
                setData(json2.data || []);
                setSyncing(false);
            }, 30000); // Returns report takes longer
        } catch (e) {
            console.error("Sync error:", e);
            setSyncing(false);
        }
    }

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "1rem" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading returns...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Returns & Refunds</h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                        FBA customer returns tracking · {filtered.length.toLocaleString()} returns
                    </p>
                </div>
                <button className="btn-primary" onClick={syncReturns} disabled={syncing}>
                    {syncing ? "⏳ Syncing..." : "🔄 Sync from SP-API"}
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <div className="kpi-card animate-fade-in">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Returns</span>
                        <span>↩️</span>
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--accent-rose)" }}>{summary.totalReturns}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{summary.totalQty} units returned</div>
                </div>
                <div className="kpi-card animate-fade-in" style={{ animationDelay: "60ms" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                        <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Unique SKUs</span>
                        <span>📦</span>
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--accent-amber)" }}>{summary.uniqueSkus}</div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>affected products</div>
                </div>
                {/* Top reasons */}
                <div className="kpi-card animate-fade-in" style={{ animationDelay: "120ms", gridColumn: "span 2" }}>
                    <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem", display: "block" }}>Top Return Reasons</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {summary.topReasons.length === 0 ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>No data</span>
                        ) : summary.topReasons.map(([reason, count], i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                                <span style={{ color: "var(--text-secondary)", maxWidth: "80%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reason}</span>
                                <span style={{ fontWeight: 600, color: "var(--accent-rose)" }}>{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <input className="input-field" placeholder="Search by Order ID, SKU, or product..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ maxWidth: "300px" }} />
                <select className="input-field" value={filterReason} onChange={(e) => setFilterReason(e.target.value)} style={{ maxWidth: "250px" }}>
                    <option value="All">All Reasons</option>
                    {allReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="glass-card" style={{ overflow: "auto", maxHeight: "60vh" }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Return Date</th>
                            <th>Order ID</th>
                            <th>SKU</th>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Reason</th>
                            <th>Disposition</th>
                            <th>Status</th>
                            <th>FC</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                                {data.length === 0 ? "No returns data yet. Click 'Sync from SP-API' to fetch." : "No matching records."}
                            </td></tr>
                        ) : filtered.slice(0, 500).map((r, i) => (
                            <tr key={i}>
                                <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{(r.return_date || "").substring(0, 10)}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{r.order_id}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{r.sku || "—"}</td>
                                <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>{r.product_name || "—"}</td>
                                <td>{Number(r.quantity) || 0}</td>
                                <td style={{ fontSize: "0.75rem", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason || "—"}</td>
                                <td><span className="badge badge-warning">{r.detailed_disposition || "—"}</span></td>
                                <td><span className={`badge ${r.status === "Completed" ? "badge-success" : "badge-warning"}`}>{r.status || "—"}</span></td>
                                <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.fulfillment_center_id || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {filtered.length > 500 && (
                <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                    Showing 500 of {filtered.length} records
                </p>
            )}
        </div>
    );
}
