"use client";

import { useEffect, useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface InventoryRow {
    sku: string;
    historical_avg_monthly: number;
    projection_12m_total: number;
    forecast_timeline: string[];
    forecast_values: number[];
    current_stock: number;
    reorder_threshold: number;
    status: string;
    recent_history: number[];
}

interface InventoryData {
    historical_timeline: string[];
    projection_timeline: string[];
    data: InventoryRow[];
}

function formatNumber(n: number) {
    return new Intl.NumberFormat("en-IN").format(n);
}

export default function InventoryPage() {
    const [invData, setInvData] = useState<InventoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchSku, setSearchSku] = useState("");
    const [selectedSkuData, setSelectedSkuData] = useState<InventoryRow | null>(null);

    useEffect(() => {
        async function fetchInventory() {
            try {
                const res = await fetch("/api/inventory");
                const data = await res.json();
                setInvData(data);
                if (data.data && data.data.length > 0) {
                    setSelectedSkuData(data.data[0]); // Select first by default
                }
            } catch (e) {
                console.error("Failed to load inventory data", e);
            }
            setLoading(false);
        }
        fetchInventory();
    }, []);

    const filteredRows = useMemo(() => {
        if (!invData?.data) return [];
        if (!searchSku) return invData.data;
        return invData.data.filter(r => r.sku.toLowerCase().includes(searchSku.toLowerCase()));
    }, [invData, searchSku]);

    const chartData = useMemo(() => {
        if (!selectedSkuData || !invData) return [];
        // Stitch together history and projection into single timeline
        const combined: { month: string; Historical: number | null; Forecast: number | null }[] = [];
        const historyLen = selectedSkuData.recent_history.length;
        const projLen = selectedSkuData.forecast_values.length;

        for (let i = 0; i < historyLen; i++) {
            combined.push({
                month: invData.historical_timeline[i] || `Month-${i}`,
                Historical: selectedSkuData.recent_history[i],
                Forecast: null
            });
        }

        // Link the last historical point to the first forecast point so the line doesn't break
        if (historyLen > 0 && projLen > 0) {
            combined[historyLen - 1].Forecast = combined[historyLen - 1].Historical;
        }

        for (let i = 0; i < projLen; i++) {
            combined.push({
                month: selectedSkuData.forecast_timeline[i],
                Historical: null,
                Forecast: selectedSkuData.forecast_values[i]
            });
        }

        return combined;
    }, [selectedSkuData, invData]);

    return (
        <div style={{ padding: "2rem 1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
                    Advanced Inventory Forecasting
                </h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    Predictive Analytics using Holt-Winters Triple Exponential Smoothing algorithm.
                </p>
            </div>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                </div>
            ) : (invData as any)?.error ? (
                <div style={{ textAlign: "center", padding: "4rem", color: "var(--accent-rose)" }}>
                    Error loading data: {(invData as any).error}
                </div>
            ) : invData?.data?.length === 0 ? (
                <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
                    No historical sales data found to generate forecasts.
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "1.5rem" }}>

                    {/* Left Pane - Table of SKUs */}
                    <div className="glass-card" style={{ display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
                        <div style={{ padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Search SKU..."
                                value={searchSku}
                                onChange={(e) => setSearchSku(e.target.value)}
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div style={{ overflowY: "auto", flex: 1, padding: "0.5rem" }}>
                            {filteredRows.map((row) => (
                                <div
                                    key={row.sku}
                                    onClick={() => setSelectedSkuData(row)}
                                    style={{
                                        padding: "0.75rem 1rem",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                        marginBottom: "0.5rem",
                                        background: selectedSkuData?.sku === row.sku ? "var(--bg-secondary)" : "transparent",
                                        border: selectedSkuData?.sku === row.sku ? "1px solid var(--accent-indigo)" : "1px solid transparent",
                                        transition: "all 0.2s ease"
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                                        <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.875rem" }}>{row.sku}</span>
                                        {row.status === "Critical/Low Stock" ? (
                                            <span className="badge badge-danger">Low Stock</span>
                                        ) : row.status === "Healthy" ? (
                                            <span className="badge badge-success">Healthy</span>
                                        ) : (
                                            <span className="badge badge-warning">Overstocked</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                                        <span>Stock: {formatNumber(row.current_stock)}</span>
                                        <span>Proj (12m): {formatNumber(row.projection_12m_total)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Pane - Chart & Metrics */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

                        {/* Upper Metrics */}
                        {selectedSkuData && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                                <div className="kpi-card" style={{ padding: "1.25rem" }}>
                                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Current Mock Stock</div>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{formatNumber(selectedSkuData.current_stock)}</div>
                                </div>
                                <div className="kpi-card" style={{ padding: "1.25rem" }}>
                                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Avg Monthly Demand</div>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{formatNumber(selectedSkuData.historical_avg_monthly)}</div>
                                </div>
                                <div className="kpi-card" style={{ padding: "1.25rem" }}>
                                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>12M Forecast Demand</div>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-indigo)" }}>{formatNumber(selectedSkuData.projection_12m_total)}</div>
                                </div>
                                <div className="kpi-card" style={{ padding: "1.25rem", border: selectedSkuData.current_stock < selectedSkuData.reorder_threshold ? "1px solid var(--accent-rose)" : undefined }}>
                                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.5rem" }}>3M Reorder Threshold</div>
                                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: selectedSkuData.current_stock < selectedSkuData.reorder_threshold ? "var(--accent-rose)" : "var(--accent-emerald)" }}>{formatNumber(selectedSkuData.reorder_threshold)}</div>
                                </div>
                            </div>
                        )}

                        {/* Chart */}
                        <div className="glass-card" style={{ height: "500px", padding: "1.5rem", display: "flex", flexDirection: "column" }}>
                            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1.5rem" }}>
                                AI Forecast Curve: {selectedSkuData?.sku}
                            </h3>
                            <div style={{ flex: 1 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorHistory" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--text-secondary)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="var(--text-secondary)" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--accent-indigo)" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="var(--accent-indigo)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(value) => formatNumber(value)} />
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)" }}
                                            itemStyle={{ fontWeight: 600 }}
                                            labelStyle={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}
                                        />
                                        <Legend verticalAlign="top" height={36} />
                                        <Area type="monotone" dataKey="Historical" stroke="var(--text-secondary)" fillOpacity={1} fill="url(#colorHistory)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="Forecast" stroke="var(--accent-indigo)" fillOpacity={1} fill="url(#colorForecast)" strokeWidth={3} strokeDasharray="5 5" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
