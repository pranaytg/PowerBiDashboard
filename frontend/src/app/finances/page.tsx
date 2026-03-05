"use client";

import { useEffect, useState, useMemo } from "react";

interface FinancialEvent {
    id: number;
    order_id: string;
    posted_date: string;
    sku: string;
    asin: string;
    quantity: number;
    event_type: string;
    total_charges: number;
    total_fees: number;
    net_amount: number;
    charge_principal: number;
    charge_tax: number;
    fee_commission: number;
    fee_fba_fees: number;
    fee_shipping_charge_back: number;
}

function formatINR(n: number): string {
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)} K`;
    return `₹${n.toFixed(2)}`;
}

export default function FinancesPage() {
    const [data, setData] = useState<FinancialEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("All");

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/finances?per_page=5000");
                const json = await res.json();
                setData(json.data || []);
            } catch (e) {
                console.error("Finances load error:", e);
            }
            setLoading(false);
        }
        load();
    }, []);

    const filtered = useMemo(() => {
        return data.filter((r) => {
            const matchSearch =
                searchTerm === "" ||
                r.order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (r.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchType = filterType === "All" || r.event_type === filterType;
            return matchSearch && matchType;
        });
    }, [data, searchTerm, filterType]);

    const summary = useMemo(() => {
        const shipments = filtered.filter((r) => r.event_type === "Shipment");
        const refunds = filtered.filter((r) => r.event_type === "Refund");
        return {
            totalCharges: filtered.reduce((s, r) => s + Number(r.total_charges || 0), 0),
            totalFees: filtered.reduce((s, r) => s + Number(r.total_fees || 0), 0),
            totalNet: filtered.reduce((s, r) => s + Number(r.net_amount || 0), 0),
            shipmentCount: shipments.length,
            refundCount: refunds.length,
            totalCommission: filtered.reduce((s, r) => s + Number(r.fee_commission || 0), 0),
            totalFbaFees: filtered.reduce((s, r) => s + Number(r.fee_fba_fees || 0), 0),
        };
    }, [filtered]);

    async function syncFinances() {
        setSyncing(true);
        try {
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date_from: "2026-01-01", date_to: new Date().toISOString().split("T")[0], report_types: ["FINANCES"] }),
            });
            const json = await res.json();
            alert(json.message || "Sync started!");
            // Reload after a delay
            setTimeout(async () => {
                const res2 = await fetch("/api/finances?per_page=5000");
                const json2 = await res2.json();
                setData(json2.data || []);
                setSyncing(false);
            }, 10000);
        } catch (e) {
            console.error("Sync error:", e);
            setSyncing(false);
        }
    }

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "1rem" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading financials...</p>
            </div>
        );
    }

    const kpis = [
        { label: "Total Charges", value: formatINR(summary.totalCharges), color: "var(--accent-emerald)", icon: "💰" },
        { label: "Total Fees", value: formatINR(summary.totalFees), color: "var(--accent-rose)", icon: "📊" },
        { label: "Net Amount", value: formatINR(summary.totalNet), color: summary.totalNet >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)", icon: "📈" },
        { label: "Commission", value: formatINR(summary.totalCommission), color: "var(--accent-amber)", icon: "🏷️" },
        { label: "FBA Fees", value: formatINR(summary.totalFbaFees), color: "var(--accent-sky)", icon: "📦" },
        { label: "Refunds", value: summary.refundCount.toString(), color: "var(--accent-rose)", icon: "↩️" },
    ];

    return (
        <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Financial Events</h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                        Amazon fees, charges & refunds · {filtered.length.toLocaleString()} events
                    </p>
                </div>
                <button className="btn-primary" onClick={syncFinances} disabled={syncing}>
                    {syncing ? "⏳ Syncing..." : "🔄 Sync from SP-API"}
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {kpis.map((kpi, i) => (
                    <div key={i} className="kpi-card animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                            <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</span>
                            <span style={{ fontSize: "1.125rem" }}>{kpi.icon}</span>
                        </div>
                        <div style={{ fontSize: "1.25rem", fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <input className="input-field" placeholder="Search by Order ID or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ maxWidth: "300px" }} />
                <select className="input-field" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ maxWidth: "160px" }}>
                    <option value="All">All Types</option>
                    <option value="Shipment">Shipments</option>
                    <option value="Refund">Refunds</option>
                </select>
            </div>

            {/* Table */}
            <div className="glass-card" style={{ overflow: "auto", maxHeight: "60vh" }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Date</th>
                            <th>SKU</th>
                            <th>Type</th>
                            <th>Qty</th>
                            <th>Charges</th>
                            <th>Fees</th>
                            <th>Commission</th>
                            <th>FBA Fee</th>
                            <th>Net</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                                {data.length === 0 ? "No financial data yet. Click 'Sync from SP-API' to fetch." : "No matching records."}
                            </td></tr>
                        ) : filtered.slice(0, 500).map((r, i) => (
                            <tr key={i}>
                                <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{r.order_id}</td>
                                <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{(r.posted_date || "").substring(0, 10)}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{r.sku || "—"}</td>
                                <td>
                                    <span className={`badge ${r.event_type === "Refund" ? "badge-danger" : "badge-success"}`}>
                                        {r.event_type}
                                    </span>
                                </td>
                                <td>{Number(r.quantity) || 0}</td>
                                <td style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>₹{Number(r.total_charges || 0).toFixed(2)}</td>
                                <td style={{ color: "var(--accent-rose)", fontWeight: 600 }}>₹{Number(r.total_fees || 0).toFixed(2)}</td>
                                <td style={{ fontSize: "0.8125rem" }}>₹{Number(r.fee_commission || 0).toFixed(2)}</td>
                                <td style={{ fontSize: "0.8125rem" }}>₹{Number(r.fee_fba_fees || 0).toFixed(2)}</td>
                                <td style={{ fontWeight: 700, color: Number(r.net_amount) >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" }}>
                                    ₹{Number(r.net_amount || 0).toFixed(2)}
                                </td>
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
