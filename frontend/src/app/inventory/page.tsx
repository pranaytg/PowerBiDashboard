"use client";

import { useEffect, useState, useMemo } from "react";
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend, ReferenceLine,
} from "recharts";

interface InventoryRow {
    sku: string;
    has_real_stock: boolean;
    current_stock: number;
    fulfillable_qty: number;
    inbound_qty: number;
    reserved_qty: number;
    snapshot_date: string | null;
    avg_daily_demand: number;
    avg_monthly_demand: number;
    days_of_stock: number;
    stockout_date: string | null;
    safety_stock: number;
    reorder_point: number;
    reorder_qty: number;
    status: string;
    velocity_trend: "accelerating" | "stable" | "decelerating";
    projection_12m_total: number;
    forecast_values: number[];
    confidence_upper: number[];
    confidence_lower: number[];
    historical_daily: number[];
    historical_monthly: number[];
    stock_history: { date: string; qty: number }[];
}

interface InventoryData {
    historical_timeline: string[];
    projection_timeline: string[];
    daily_timeline: string[];
    lead_time_days: number;
    data: InventoryRow[];
}

function fmtNum(n: number) { return new Intl.NumberFormat("en-IN").format(n); }

const STATUS_COLORS: Record<string, string> = {
    Critical: "var(--accent-rose)",
    Low: "#f59e0b",
    Healthy: "var(--accent-emerald)",
    Overstocked: "var(--accent-sky)",
    "No Data": "var(--text-muted)",
};

const VELOCITY_ICONS: Record<string, string> = {
    accelerating: "🔺",
    stable: "➡️",
    decelerating: "🔻",
};

export default function InventoryPage() {
    const [invData, setInvData] = useState<InventoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchSku, setSearchSku] = useState("");
    const [selected, setSelected] = useState<InventoryRow | null>(null);
    const [statusFilter, setStatusFilter] = useState("All");

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/inventory");
                const data = await res.json();
                setInvData(data);
                if (data.data?.length > 0) setSelected(data.data[0]);
            } catch (e) { console.error("Failed to load inventory data", e); }
            setLoading(false);
        }
        load();
    }, []);

    const filtered = useMemo(() => {
        if (!invData?.data) return [];
        return invData.data.filter(r => {
            if (searchSku && !r.sku.toLowerCase().includes(searchSku.toLowerCase())) return false;
            if (statusFilter !== "All" && r.status !== statusFilter) return false;
            return true;
        });
    }, [invData, searchSku, statusFilter]);

    // Summary KPIs across all SKUs
    const kpis = useMemo(() => {
        const all = invData?.data || [];
        return {
            totalSkus: all.length,
            critical: all.filter(r => r.status === "Critical").length,
            low: all.filter(r => r.status === "Low").length,
            healthy: all.filter(r => r.status === "Healthy").length,
            overstocked: all.filter(r => r.status === "Overstocked").length,
            totalStock: all.reduce((s, r) => s + r.current_stock, 0),
            needReorder: all.filter(r => r.current_stock < r.reorder_point).length,
        };
    }, [invData]);

    // Forecast chart data for selected SKU
    const chartData = useMemo(() => {
        if (!selected || !invData) return [];
        const combined: { month: string; Historical: number | null; Forecast: number | null; Upper: number | null; Lower: number | null }[] = [];
        const hist = selected.historical_monthly;
        const timeline = invData.historical_timeline;

        for (let i = 0; i < hist.length; i++) {
            combined.push({ month: timeline[i] || `M${i}`, Historical: hist[i], Forecast: null, Upper: null, Lower: null });
        }

        // Bridge
        if (hist.length > 0 && selected.forecast_values.length > 0) {
            combined[hist.length - 1].Forecast = combined[hist.length - 1].Historical;
        }

        for (let i = 0; i < selected.forecast_values.length; i++) {
            combined.push({
                month: invData.projection_timeline[i],
                Historical: null,
                Forecast: selected.forecast_values[i],
                Upper: selected.confidence_upper[i],
                Lower: selected.confidence_lower[i],
            });
        }
        return combined;
    }, [selected, invData]);

    // Daily demand sparkline (last 90 days)
    const dailyChart = useMemo(() => {
        if (!selected || !invData?.daily_timeline) return [];
        return invData.daily_timeline.map((d, i) => ({
            date: d.substring(5), // MM-DD
            demand: selected.historical_daily[i] || 0,
        }));
    }, [selected, invData]);

    // Stock depletion chart
    const stockChart = useMemo(() => {
        if (!selected) return [];
        return selected.stock_history.map(s => ({
            date: s.date,
            stock: s.qty,
        }));
    }, [selected]);

    return (
        <div style={{ padding: "1.5rem", maxWidth: "1800px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ marginBottom: "1.25rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
                    🔮 Advanced Inventory Prediction Engine
                </h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    Ensemble forecasting (Holt-Winters + Weighted Moving Average + Linear Regression) with real FBA stock levels, safety stock, and reorder alerts.
                </p>
            </div>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                </div>
            ) : (invData as any)?.error ? (
                <div style={{ textAlign: "center", padding: "4rem", color: "var(--accent-rose)" }}>Error: {(invData as any).error}</div>
            ) : (
                <>
                    {/* Summary KPI Row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.625rem", marginBottom: "1.25rem" }}>
                        {[
                            { label: "Total SKUs", value: kpis.totalSkus, icon: "📦", color: "var(--text-primary)" },
                            { label: "Critical", value: kpis.critical, icon: "🔴", color: "var(--accent-rose)" },
                            { label: "Low Stock", value: kpis.low, icon: "🟡", color: "#f59e0b" },
                            { label: "Healthy", value: kpis.healthy, icon: "🟢", color: "var(--accent-emerald)" },
                            { label: "Overstocked", value: kpis.overstocked, icon: "🔵", color: "var(--accent-sky)" },
                            { label: "Need Reorder", value: kpis.needReorder, icon: "⚠️", color: "#f59e0b" },
                            { label: "Total Stock", value: fmtNum(kpis.totalStock), icon: "🏭", color: "var(--text-primary)" },
                        ].map((k, i) => (
                            <div key={i} className="kpi-card animate-fade-in" style={{ animationDelay: `${i * 40}ms`, padding: "0.875rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                    <span style={{ fontSize: "0.5625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>{k.label}</span>
                                    <span style={{ fontSize: "0.875rem" }}>{k.icon}</span>
                                </div>
                                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: k.color }}>{k.value}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.25rem" }}>
                        {/* Left: SKU List */}
                        <div className="glass-card" style={{ display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
                            <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <input type="text" className="input-field" placeholder="Search SKU..." value={searchSku}
                                    onChange={e => setSearchSku(e.target.value)} style={{ width: "100%", fontSize: "0.8125rem" }} />
                                <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                    style={{ width: "100%", fontSize: "0.8125rem" }}>
                                    <option value="All">All Status</option>
                                    <option value="Critical">🔴 Critical</option>
                                    <option value="Low">🟡 Low</option>
                                    <option value="Healthy">🟢 Healthy</option>
                                    <option value="Overstocked">🔵 Overstocked</option>
                                </select>
                            </div>
                            <div style={{ overflowY: "auto", flex: 1, padding: "0.375rem" }}>
                                {filtered.map(row => (
                                    <div key={row.sku} onClick={() => setSelected(row)}
                                        style={{
                                            padding: "0.625rem 0.75rem", borderRadius: "8px", cursor: "pointer", marginBottom: "0.375rem",
                                            background: selected?.sku === row.sku ? "var(--bg-secondary)" : "transparent",
                                            border: selected?.sku === row.sku ? "1px solid var(--accent-indigo)" : "1px solid transparent",
                                            transition: "all 0.2s"
                                        }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                                            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.8125rem" }}>{row.sku}</span>
                                            <span style={{
                                                fontSize: "0.625rem", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                                                background: `${STATUS_COLORS[row.status]}22`, color: STATUS_COLORS[row.status],
                                            }}>{row.status}</span>
                                        </div>
                                        <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                                            <span>{VELOCITY_ICONS[row.velocity_trend]} {row.days_of_stock < 999 ? `${row.days_of_stock}d stock` : "—"}</span>
                                            <span>Stock: {fmtNum(row.current_stock)}</span>
                                        </div>
                                    </div>
                                ))}
                                {filtered.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.8125rem" }}>No SKUs found</div>
                                )}
                            </div>
                        </div>

                        {/* Right: Detail Pane */}
                        {selected ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                {/* Metrics Bar */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem" }}>
                                    {[
                                        { label: "Current Stock", value: fmtNum(selected.current_stock), sub: selected.has_real_stock ? `📡 ${selected.snapshot_date}` : "⚠️ No snapshot", color: STATUS_COLORS[selected.status] },
                                        { label: "Days of Stock", value: selected.days_of_stock < 999 ? `${selected.days_of_stock}` : "∞", sub: selected.stockout_date ? `⚠️ Out ${selected.stockout_date}` : "No stockout risk", color: selected.days_of_stock < 14 ? "var(--accent-rose)" : selected.days_of_stock < 30 ? "#f59e0b" : "var(--accent-emerald)" },
                                        { label: "Avg Daily Demand", value: selected.avg_daily_demand.toFixed(1), sub: `${fmtNum(selected.avg_monthly_demand)}/mo`, color: "var(--text-primary)" },
                                        { label: "Safety Stock", value: fmtNum(selected.safety_stock), sub: `Lead: ${invData?.lead_time_days || 21}d`, color: "var(--accent-indigo)" },
                                        { label: "Reorder Point", value: fmtNum(selected.reorder_point), sub: selected.current_stock < selected.reorder_point ? "🔴 BELOW!" : "✅ Above", color: selected.current_stock < selected.reorder_point ? "var(--accent-rose)" : "var(--accent-emerald)" },
                                        { label: "Reorder Qty", value: fmtNum(selected.reorder_qty), sub: "For 90 days", color: "var(--accent-indigo)" },
                                        { label: "12M Forecast", value: fmtNum(selected.projection_12m_total), sub: `${VELOCITY_ICONS[selected.velocity_trend]} ${selected.velocity_trend}`, color: "var(--accent-sky)" },
                                        { label: "Inbound / Reserved", value: `${fmtNum(selected.inbound_qty)} / ${fmtNum(selected.reserved_qty)}`, sub: "In transit / Held", color: "var(--text-secondary)" },
                                    ].map((m, i) => (
                                        <div key={i} className="kpi-card" style={{ padding: "0.875rem" }}>
                                            <div style={{ fontSize: "0.5625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.375rem" }}>{m.label}</div>
                                            <div style={{ fontSize: "1.125rem", fontWeight: 700, color: m.color, marginBottom: "0.125rem" }}>{m.value}</div>
                                            <div style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{m.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Forecast Chart with Confidence Band */}
                                <div className="glass-card" style={{ height: "380px", padding: "1.25rem", display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>
                                            Ensemble Forecast: {selected.sku}
                                        </h3>
                                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                                            HW 40% + WMA 35% + LR 25% • 95% CI
                                        </span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                                <defs>
                                                    <linearGradient id="gHist" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="var(--text-secondary)" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="var(--text-secondary)" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="gFore" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={10} />
                                                <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={v => fmtNum(v)} />
                                                <Tooltip contentStyle={{ background: "rgba(10,10,18,0.96)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.75rem" }} />
                                                <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: "0.6875rem" }} />
                                                {/* Confidence band */}
                                                <Area type="monotone" dataKey="Upper" stroke="none" fill="#6366f133" name="95% CI Upper" />
                                                <Area type="monotone" dataKey="Lower" stroke="none" fill="transparent" name="95% CI Lower" />
                                                {/* History + Forecast */}
                                                <Area type="monotone" dataKey="Historical" stroke="var(--text-secondary)" strokeWidth={2} fill="url(#gHist)" />
                                                <Area type="monotone" dataKey="Forecast" stroke="#6366f1" strokeWidth={3} strokeDasharray="6 4" fill="url(#gFore)" />
                                                <ReferenceLine y={selected.safety_stock} stroke="var(--accent-rose)" strokeDasharray="4 4" label={{ value: "Safety Stock", fill: "var(--accent-rose)", fontSize: 10 }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Bottom Row: Daily Demand + Stock History */}
                                <div style={{ display: "grid", gridTemplateColumns: stockChart.length > 0 ? "1fr 1fr" : "1fr", gap: "1rem" }}>
                                    {/* Daily Demand (90-day) */}
                                    <div className="glass-card" style={{ height: "220px", padding: "1rem", display: "flex", flexDirection: "column" }}>
                                        <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>Daily Demand (Last 90 Days)</h3>
                                        <div style={{ flex: 1 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={dailyChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={8} interval={13} />
                                                    <YAxis stroke="var(--text-muted)" fontSize={9} />
                                                    <Tooltip contentStyle={{ background: "rgba(10,10,18,0.96)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.75rem" }} />
                                                    <Bar dataKey="demand" fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={6} />
                                                    <ReferenceLine y={selected.avg_daily_demand} stroke="#10b981" strokeDasharray="4 4" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Stock Depletion History */}
                                    {stockChart.length > 0 && (
                                        <div className="glass-card" style={{ height: "220px", padding: "1rem", display: "flex", flexDirection: "column" }}>
                                            <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, marginBottom: "0.5rem" }}>Stock Level History</h3>
                                            <div style={{ flex: 1 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={stockChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                                        <defs>
                                                            <linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                                        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={9} />
                                                        <YAxis stroke="var(--text-muted)" fontSize={9} />
                                                        <Tooltip contentStyle={{ background: "rgba(10,10,18,0.96)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.75rem" }} />
                                                        <Area type="monotone" dataKey="stock" stroke="#10b981" strokeWidth={2} fill="url(#gStock)" />
                                                        <ReferenceLine y={selected.reorder_point} stroke="var(--accent-rose)" strokeDasharray="4 4" label={{ value: "Reorder Point", fill: "var(--accent-rose)", fontSize: 9 }} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="glass-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                                Select a SKU from the left panel
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
