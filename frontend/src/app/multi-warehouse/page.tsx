"use client";

import { useEffect, useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, ReferenceLine } from "recharts";

interface ForecastData {
    sku: string;
    warehouse_id: string;
    warehouse_alias: string;
    available_stock: number;
    quantity_on_hand: number;
    quantity_reserved: number;
    velocity_7d: number;
    velocity_14d: number;
    velocity_30d: number;
    forecasted_daily_velocity: number;
    days_of_supply: number;
    reorder_alert: boolean;
    reorder_qty_needed: number;
    lead_time_days: number;
}

function fmtNum(n: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(n); }

export default function MultiWarehousePage() {
    const [data, setData] = useState<ForecastData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/multi-warehouse");
                const json = await res.json();
                if (json.error) {
                    setError(json.error);
                } else {
                    setData(json.data || []);
                }
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // KPIs
    const kpis = useMemo(() => {
        const totalStock = data.reduce((sum, item) => sum + item.quantity_on_hand, 0);
        const totalAvailable = data.reduce((sum, item) => sum + item.available_stock, 0);
        const totalAlerts = data.filter(i => i.reorder_alert).length;
        const totalWarehouses = new Set(data.map(i => i.warehouse_id)).size;

        return { totalStock, totalAvailable, totalAlerts, totalWarehouses };
    }, [data]);

    // Grouping by Warehouse
    const grouped = useMemo(() => {
        const map: Record<string, ForecastData[]> = {};
        for (const item of data) {
            if (!map[item.warehouse_alias]) {
                map[item.warehouse_alias] = [];
            }
            map[item.warehouse_alias].push(item);
        }
        return map;
    }, [data]);

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: "2rem", color: "var(--accent-rose)", textAlign: "center" }}>
                <h2>Failed to load data</h2>
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            <div className="animate-fade-in" style={{ marginBottom: "1.25rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
                    🏢 Multi-Warehouse Inventory & Forecasting
                </h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    Track available stock locally, deduplicate reserved units (unshipped orders), and forecast reorders dynamically.
                </p>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="kpi-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Facilities</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-sky)" }}>{kpis.totalWarehouses}</div>
                </div>
                <div className="kpi-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Total On Hand</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{fmtNum(kpis.totalStock)}</div>
                </div>
                <div className="kpi-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Available</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent-emerald)" }}>{fmtNum(kpis.totalAvailable)}</div>
                </div>
                <div className="kpi-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Reorder Alerts</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: kpis.totalAlerts > 0 ? "var(--accent-rose)" : "var(--accent-emerald)" }}>
                        {kpis.totalAlerts}
                    </div>
                </div>
            </div>

            {/* Warehouse Tables */}
            {Object.keys(grouped).length === 0 ? (
                <div className="glass-card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No multi-warehouse tracking data found.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    {Object.entries(grouped).map(([alias, items]) => (
                        <div key={alias} className="glass-card animate-fade-in" style={{ padding: "1.5rem" }}>
                            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-indigo)" }}>
                                📍 {alias}
                            </h2>
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
                                    <thead style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                                        <tr>
                                            <th style={{ padding: "0.75rem" }}>SKU</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>On Hand</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>Reserved</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>Available</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>Forecast Vel./Day</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>Lead Time (Days)</th>
                                            <th style={{ padding: "0.75rem", textAlign: "right" }}>Days of Supply</th>
                                            <th style={{ padding: "0.75rem", textAlign: "center" }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr key={item.sku} style={{ borderBottom: "1px solid var(--border)", background: item.reorder_alert ? "rgba(225, 29, 72, 0.05)" : "transparent" }}>
                                                <td style={{ padding: "0.75rem", fontWeight: 600, fontFamily: "monospace" }}>{item.sku}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right" }}>{fmtNum(item.quantity_on_hand)}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right", color: "var(--accent-sky)" }}>{fmtNum(item.quantity_reserved)}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{fmtNum(item.available_stock)}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right" }}>
                                                    {fmtNum(item.forecasted_daily_velocity)}
                                                    <div style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>
                                                        7d:{item.velocity_7d} | 14d:{item.velocity_14d} | 30d:{item.velocity_30d}
                                                    </div>
                                                </td>
                                                <td style={{ padding: "0.75rem", textAlign: "right" }}>{item.lead_time_days}</td>
                                                <td style={{ padding: "0.75rem", textAlign: "right", color: item.reorder_alert ? "var(--accent-rose)" : "var(--accent-emerald)" }}>
                                                    {item.days_of_supply < 9999 ? fmtNum(item.days_of_supply) : "∞"}
                                                </td>
                                                <td style={{ padding: "0.75rem", textAlign: "center" }}>
                                                    {item.reorder_alert ? (
                                                        <span style={{ background: "var(--accent-rose)", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600 }}>
                                                            REORDER {item.reorder_qty_needed}
                                                        </span>
                                                    ) : (
                                                        <span style={{ background: "var(--accent-emerald)", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600 }}>
                                                            HEALTHY
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
