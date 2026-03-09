"use client";

import React, { useEffect, useState, useCallback } from "react";

interface ProfitRow {
    order_id: string;
    sku: string;
    date: string;
    brand: string;
    product: string;
    quantity: number;
    invoice_amount: number;
    shipment_cost: number;
    cogs_available: boolean;
    landed_cost_unit: number;
    halte_cost_price_unit: number;
    total_cogs: number;
    amazon_fee_amt: number;
    jh_profit: number;
    jh_margin_pct: number;
    halte_profit: number;
    halte_margin_pct: number;
    total_profit: number;
    total_margin_pct: number;
    import_price_inr: number;
    custom_duty_amt: number;
    gst1_amt: number;
    cogs_shipping: number;
    margin1_amt: number;
    marketing_cost: number;
    margin2_amt: number;
    gst2_amt: number;
    msp: number;
}

interface Summary {
    total_revenue: number;
    total_cogs: number;
    total_shipping: number;
    total_amazon_fees: number;
    total_jh_profit: number;
    total_halte_profit: number;
    total_profit: number;
    orders_with_cogs: number;
    orders_without_cogs: number;
}

type ViewMode = "orders" | "sku";

function formatINR(n: number): string {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ProfitabilityPage() {
    const [rows, setRows] = useState<ProfitRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>("orders");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filterSku, setFilterSku] = useState("");
    const [filterOrder, setFilterOrder] = useState("");
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // For SKU view, we need ALL data for accurate aggregation. For Order view, 50 is fine.
            const limit = viewMode === "sku" ? "50000" : "50";
            const params = new URLSearchParams({ page: String(page), per_page: limit });
            if (filterSku) params.set("sku", filterSku);
            if (filterOrder) params.set("order_id", filterOrder);

            const res = await fetch(`/api/profitability?${params}`);
            const data = await res.json();
            setRows(data.data || []);
            setSummary(data.summary || null);
            setTotalPages(data.total_pages || 1);
        } catch (e) {
            console.error("Load error:", e);
        }
        setLoading(false);
    }, [page, filterSku, filterOrder, viewMode]);

    useEffect(() => { loadData(); }, [loadData]);

    // SKU aggregation
    const skuAgg = (() => {
        const map = new Map<string, { sku: string; brand: string; product: string; qty: number; revenue: number; cogs: number; shipping: number; amazonFees: number; jhProfit: number; halteProfit: number; totalProfit: number; orders: number }>();
        for (const r of rows) {
            if (!r.cogs_available) continue;
            const existing = map.get(r.sku);
            if (existing) {
                existing.qty += r.quantity;
                existing.revenue += r.invoice_amount;
                existing.cogs += r.total_cogs;
                existing.shipping += r.shipment_cost;
                existing.amazonFees += (r.amazon_fee_amt || 0);
                existing.jhProfit += r.jh_profit;
                existing.halteProfit += r.halte_profit;
                existing.totalProfit += r.total_profit;
                existing.orders += 1;
            } else {
                map.set(r.sku, {
                    sku: r.sku,
                    brand: r.brand,
                    product: r.product,
                    qty: r.quantity,
                    revenue: r.invoice_amount,
                    cogs: r.total_cogs,
                    shipping: r.shipment_cost,
                    amazonFees: r.amazon_fee_amt || 0,
                    jhProfit: r.jh_profit,
                    halteProfit: r.halte_profit,
                    totalProfit: r.total_profit,
                    orders: 1,
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => b.totalProfit - a.totalProfit);
    })();

    return (
        <div style={{ padding: "2rem 1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
                    Profitability Dashboard
                </h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    Per-order profitability analysis: Revenue − COGS − Shipping = Profit
                </p>
            </div>

            {/* Summary KPIs */}
            {summary && (
                <div className="animate-fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                    {[
                        { label: "Revenue", value: summary.total_revenue, color: "var(--accent-indigo)", icon: "💰" },
                        { label: "COGS", value: summary.total_cogs, color: "var(--accent-amber)", icon: "📦" },
                        { label: "Shipping", value: summary.total_shipping, color: "var(--accent-rose)", icon: "🚚" },
                        { label: "Amazon Fees", value: summary.total_amazon_fees, color: "var(--accent-orange)", icon: "🏷️" },
                        { label: "JH Profit", value: summary.total_jh_profit, color: "var(--accent-emerald)", icon: "🏢" },
                        { label: "Halte Profit", value: summary.total_halte_profit, color: "var(--accent-sky)", icon: "🛒" },
                        { label: "Total Profit", value: summary.total_profit, color: summary.total_profit >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)", icon: "📈" },
                    ].map((kpi, i) => (
                        <div key={i} className="kpi-card">
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                                <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</span>
                                <span>{kpi.icon}</span>
                            </div>
                            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: kpi.color }}>{formatINR(kpi.value)}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters + Tabs */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input className="input-field" placeholder="Filter by SKU..." value={filterSku} onChange={(e) => { setFilterSku(e.target.value); setPage(1); }} style={{ width: "180px" }} />
                    <input className="input-field" placeholder="Filter by Order ID..." value={filterOrder} onChange={(e) => { setFilterOrder(e.target.value); setPage(1); }} style={{ width: "200px" }} />
                    <button className="btn-secondary" onClick={() => { setFilterSku(""); setFilterOrder(""); setPage(1); }}>Clear</button>
                </div>
                <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
                    <button className={`tab-btn ${viewMode === "orders" ? "active" : ""}`} onClick={() => setViewMode("orders")}>
                        📋 Order-wise
                    </button>
                    <button className={`tab-btn ${viewMode === "sku" ? "active" : ""}`} onClick={() => setViewMode("sku")}>
                        📦 SKU-wise
                    </button>
                </div>
            </div>

            {/* Loading */}
            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                    <div className="spinner" style={{ width: 32, height: 32 }} />
                </div>
            ) : viewMode === "orders" ? (
                /* Order-wise Table */
                <div className="glass-card" style={{ overflow: "auto", maxHeight: "65vh" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Date</th>
                                <th>Order ID</th>
                                <th>SKU</th>
                                <th>Brand</th>
                                <th>Qty</th>
                                <th>Revenue</th>
                                <th>COGS</th>
                                <th>Amazon Fees</th>
                                <th>Shipping</th>
                                <th>JH Profit</th>
                                <th>Halte Profit</th>
                                <th>Total Profit</th>
                                <th>Margin %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr><td colSpan={13} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No data found. Add COGS for your SKUs to see profitability.</td></tr>
                            ) : rows.map((r, i) => (
                                <React.Fragment key={i}>
                                    <tr key={i}>
                                        <td>
                                            {r.cogs_available && (
                                                <button className="btn-secondary" style={{ padding: "0.125rem 0.375rem", fontSize: "0.6875rem" }} onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                                                    {expandedIdx === i ? "▲" : "▼"}
                                                </button>
                                            )}
                                        </td>
                                        <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.date || "—"}</td>
                                        <td style={{ fontFamily: "monospace", fontSize: "0.6875rem", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.order_id}</td>
                                        <td style={{ fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 600 }}>{r.sku}</td>
                                        <td style={{ fontSize: "0.75rem" }}>{r.brand || "—"}</td>
                                        <td>{r.quantity}</td>
                                        <td style={{ fontWeight: 600 }}>{formatINR(r.invoice_amount)}</td>
                                        <td>{r.cogs_available ? formatINR(r.total_cogs) : <span className="badge badge-warning">No COGS</span>}</td>
                                        <td>{r.amazon_fee_amt ? formatINR(r.amazon_fee_amt) : "—"}</td>
                                        <td>{formatINR(r.shipment_cost)}</td>
                                        <td className={r.jh_profit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.jh_profit)}</td>
                                        <td className={r.halte_profit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.halte_profit)}</td>
                                        <td className={r.total_profit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.total_profit)}</td>
                                        <td>
                                            {r.cogs_available ? (
                                                <span className={`badge ${r.total_margin_pct >= 0 ? "badge-success" : "badge-danger"}`}>
                                                    {r.total_margin_pct.toFixed(1)}%
                                                </span>
                                            ) : "—"}
                                        </td>
                                    </tr>
                                    {expandedIdx === i && r.cogs_available && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={13} style={{ background: "var(--bg-secondary)", padding: "1rem" }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: "700px" }}>
                                                    <div>
                                                        <h4 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--accent-indigo-light)" }}>COGS Breakdown (per unit)</h4>
                                                        {[
                                                            { label: "Import Price (INR)", value: r.import_price_inr },
                                                            { label: "Custom Duty", value: r.custom_duty_amt },
                                                            { label: "GST on Import", value: r.gst1_amt },
                                                            { label: "COGS Shipping", value: r.cogs_shipping },
                                                            { label: "= Landed Cost", value: r.landed_cost_unit, bold: true },
                                                            { label: "JH Margin", value: r.margin1_amt },
                                                            { label: "= Halte Cost Price", value: r.halte_cost_price_unit, bold: true },
                                                        ].map((item, j) => (
                                                            <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", fontSize: "0.75rem" }}>
                                                                <span style={{ color: item.bold ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: item.bold ? 700 : 400 }}>{item.label}</span>
                                                                <span style={{ fontFamily: "monospace", fontWeight: item.bold ? 700 : 400 }}>{formatINR(item.value)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div>
                                                        <h4 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--accent-indigo-light)" }}>Profit Calculation</h4>
                                                        {[
                                                            { label: `Revenue (Invoice)`, value: r.invoice_amount },
                                                            { label: `COGS (${r.halte_cost_price_unit} × ${r.quantity})`, value: -r.total_cogs },
                                                            { label: "Amazon Referral Fee", value: -r.amazon_fee_amt },
                                                            { label: "Order Shipping", value: -r.shipment_cost },
                                                            { label: "= Halte Profit", value: r.halte_profit, bold: true, color: r.halte_profit >= 0 },
                                                            { label: `JH Profit (margin on ${r.quantity} units)`, value: r.jh_profit, bold: true, color: r.jh_profit >= 0 },
                                                            { label: "= Total Profit", value: r.total_profit, bold: true, color: r.total_profit >= 0 },
                                                        ].map((item, j) => (
                                                            <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0", fontSize: "0.75rem" }}>
                                                                <span style={{ color: item.bold ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: item.bold ? 700 : 400 }}>{item.label}</span>
                                                                <span style={{ fontFamily: "monospace", fontWeight: item.bold ? 700 : 400, color: item.color !== undefined ? (item.color ? "var(--accent-emerald)" : "var(--accent-rose)") : undefined }}>
                                                                    {formatINR(item.value)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* SKU-wise aggregation */
                <div className="glass-card" style={{ overflow: "auto", maxHeight: "65vh" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Brand</th>
                                <th>Orders</th>
                                <th>Qty</th>
                                <th>Revenue</th>
                                <th>COGS</th>
                                <th>Amazon Fees</th>
                                <th>Shipping</th>
                                <th>JH Profit</th>
                                <th>Halte Profit</th>
                                <th>Total Profit</th>
                                <th>Margin %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {skuAgg.length === 0 ? (
                                <tr><td colSpan={11} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No SKU data. Ensure COGS are entered for your SKUs.</td></tr>
                            ) : skuAgg.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 600 }}>{r.sku}</td>
                                    <td style={{ fontSize: "0.75rem" }}>{r.brand || "—"}</td>
                                    <td>{r.orders}</td>
                                    <td>{r.qty}</td>
                                    <td style={{ fontWeight: 600 }}>{formatINR(r.revenue)}</td>
                                    <td>{formatINR(r.cogs)}</td>
                                    <td>{formatINR(r.amazonFees)}</td>
                                    <td>{formatINR(r.shipping)}</td>
                                    <td className={r.jhProfit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.jhProfit)}</td>
                                    <td className={r.halteProfit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.halteProfit)}</td>
                                    <td className={r.totalProfit >= 0 ? "profit-positive" : "profit-negative"}>{formatINR(r.totalProfit)}</td>
                                    <td>
                                        <span className={`badge ${r.revenue > 0 && r.totalProfit / r.revenue >= 0 ? "badge-success" : "badge-danger"}`}>
                                            {r.revenue > 0 ? ((r.totalProfit / r.revenue) * 100).toFixed(1) : "0"}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {viewMode === "orders" && totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
                    <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Page {page} of {totalPages}</span>
                    <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next →</button>
                </div>
            )}
        </div>
    );
}
