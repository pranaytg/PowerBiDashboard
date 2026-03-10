"use client";

import { useState, useEffect } from "react";
// Custom icon replacements instead of lucide-react

export default function WarehouseInventoryPage() {
    const [data, setData] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch("/api/warehouse-inventory");
                if (!res.ok) throw new Error("Failed to fetch data");
                const json = await res.json();
                setData(json.data || []);
                setSummary(json.summary || null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const filteredData = data.filter(item => {
        const matchesSearch = item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.warehouse_id || "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "All" || item.status.includes(statusFilter);
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status: string) => {
        if (status.includes("Critical")) return { bg: "rgba(239, 68, 68, 0.15)", text: "var(--accent-red)", border: "rgba(239, 68, 68, 0.3)" };
        if (status.includes("Reorder Now")) return { bg: "rgba(245, 158, 11, 0.15)", text: "var(--accent-amber)", border: "rgba(245, 158, 11, 0.3)" };
        if (status.includes("Overstocked")) return { bg: "rgba(59, 130, 246, 0.15)", text: "var(--accent-blue)", border: "rgba(59, 130, 246, 0.3)" };
        return { bg: "rgba(16, 185, 129, 0.15)", text: "var(--accent-emerald)", border: "rgba(16, 185, 129, 0.3)" };
    };

    return (
        <div style={{ padding: "80px 2rem 2rem 2rem", minHeight: "100vh", position: "relative", color: "var(--text-primary)" }}>
            {/* Premium Background Pattern */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: -1,
                background: "linear-gradient(135deg, #09090b 0%, #171723 100%)",
                backgroundImage: "radial-gradient(circle at 15% 50%, rgba(99, 102, 241, 0.08), transparent 25%), radial-gradient(circle at 85% 30%, rgba(16, 185, 129, 0.05), transparent 25%)"
            }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "2rem" }}>
                <div>
                    <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 0.5rem 0", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "2rem", color: "var(--accent-indigo)" }}>🏢</span>
                        Warehouse Inventory & Reponsplenishment
                    </h1>
                    <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.95rem" }}>
                        March sales rate analysis and reorder recommendations per fulfillment center.
                    </p>
                </div>
            </div>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div style={{ color: "var(--accent-red)", padding: "2rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "12px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                    {error}
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem", marginBottom: "2.5rem" }}>
                        {[
                            { label: "Active SKUs Tracking", value: summary?.total_skus?.toLocaleString() || 0, icon: <span style={{ fontSize: "22px" }}>📦</span>, color: "var(--accent-indigo)", bg: "linear-gradient(145deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))", border: "rgba(99, 102, 241, 0.2)" },
                            { label: "Total Reorder Units Needed", value: summary?.total_reorder_units_needed?.toLocaleString() || 0, icon: <span style={{ fontSize: "22px" }}>📈</span>, color: "var(--accent-emerald)", bg: "linear-gradient(145deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05))", border: "rgba(16, 185, 129, 0.2)" },
                            { label: "Critical Stock Alerts", value: summary?.critical_count?.toLocaleString() || 0, icon: <span style={{ fontSize: "22px" }}>⚠️</span>, color: "var(--accent-red)", bg: "linear-gradient(145deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05))", border: "rgba(239, 68, 68, 0.2)" },
                        ].map((kpi, i) => (
                            <div key={i} style={{
                                background: kpi.bg, borderRadius: "20px", padding: "1.75rem", border: `1px solid ${kpi.border}`,
                                display: "flex", flexDirection: "column", gap: "1rem", backdropFilter: "blur(12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                                cursor: "default"
                            }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.2)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.15)"; }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.95rem", fontWeight: 600 }}>
                                    <div style={{ background: "rgba(255,255,255,0.05)", padding: "0.5rem", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {kpi.icon}
                                    </div>
                                    <span style={{ letterSpacing: "0.5px" }}>{kpi.label}</span>
                                </div>
                                <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-1px" }}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", background: "rgba(30, 30, 40, 0.4)", padding: "1.25rem", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(10px)" }}>
                        <div style={{ position: "relative", flex: 1, maxWidth: "450px" }}>
                            <span style={{ position: "absolute", left: "1.25rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "16px" }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search by SKU or Fulfillment Center..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    width: "100%", padding: "0.875rem 1rem 0.875rem 3rem", borderRadius: "10px",
                                    background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)",
                                    outline: "none", fontSize: "0.95rem", transition: "border-color 0.2s ease"
                                }}
                                onFocus={(e) => e.target.style.borderColor = "var(--accent-indigo)"}
                                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            style={{
                                padding: "0.875rem 1.25rem", borderRadius: "10px", background: "rgba(0,0,0,0.2)",
                                border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)", outline: "none", fontSize: "0.95rem",
                                cursor: "pointer", minWidth: "180px"
                            }}
                        >
                            <option value="All">All Statuses</option>
                            <option value="Critical">Critical</option>
                            <option value="Reorder Now">Reorder Now</option>
                            <option value="Healthy">Healthy</option>
                            <option value="Overstocked">Overstocked</option>
                        </select>
                    </div>

                    {/* Data Table */}
                    <div style={{ background: "rgba(18, 18, 26, 0.6)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", backdropFilter: "blur(16px)", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "rgba(0, 0, 0, 0.2)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>SKU</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>FC ID</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>March Sales</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>Daily Rate</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>Closing Inv</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>Days Left</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>Reorder Point</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px", textAlign: "right" }}>Rec Order Qty</th>
                                        <th style={{ padding: "1.25rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "1px" }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.slice(0, 100).map((row, idx) => {
                                        const statusColors = getStatusColor(row.status);
                                        return (
                                            <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", transition: "background 0.2s" }} className="hover:bg-[rgba(255,255,255,0.03)]">
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>{row.sku}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-secondary)", fontFamily: "monospace", letterSpacing: "0.5px" }}>{row.warehouse_id}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-primary)", textAlign: "right", fontWeight: 500 }}>{row.march_sales.toLocaleString()}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-primary)", textAlign: "right", fontWeight: 500 }}>{row.sales_rate_daily}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-primary)", textAlign: "right", fontWeight: 800 }}>{row.closing_inventory.toLocaleString()}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-secondary)", textAlign: "right" }}>{row.days_of_stock === 999 ? "∞" : row.days_of_stock}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "0.95rem", color: "var(--text-secondary)", textAlign: "right" }}>{row.reorder_point.toLocaleString()}</td>
                                                <td style={{ padding: "1.25rem 1.5rem", fontSize: "1rem", color: "var(--text-primary)", textAlign: "right", fontWeight: 800 }}>{row.recommended_reorder_qty > 0 ? `+${row.recommended_reorder_qty.toLocaleString()}` : "-"}</td>
                                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                                    <span style={{
                                                        display: "inline-block", padding: "0.35rem 0.85rem", borderRadius: "999px",
                                                        fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.5px",
                                                        background: statusColors.bg, color: statusColors.text, border: `1px solid ${statusColors.border}`,
                                                        boxShadow: `0 2px 10px ${statusColors.bg}`
                                                    }}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredData.length === 0 && (
                                        <tr>
                                            <td colSpan={9} style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)", fontSize: "1.1rem" }}>
                                                No records found matching filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {filteredData.length > 100 && (
                                <div style={{ padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.1)" }}>
                                    Showing first 100 records for performance.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Global Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top-color: var(--accent-indigo);
          animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        tr:hover {
          background-color: rgba(255, 255, 255, 0.03) !important;
        }
      `}} />
        </div>
    );
}
