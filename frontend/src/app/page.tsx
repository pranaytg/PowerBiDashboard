"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ProfitRow {
  order_id: string;
  sku: string;
  state: string;
  month: string;
  month_num: number;
  year: number;
  invoice_amount: number;
  shipment_cost: number;
  cogs_available: boolean;
  total_cogs: number;
  jh_profit: number;
  halte_profit: number;
  total_profit: number;
  quantity: number;
}

function formatINR(n: number): string {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)} K`;
  return `₹${n.toFixed(2)}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<ProfitRow[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [totalCogsCount, setTotalCogsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedMonth, setSelectedMonth] = useState<string>("All");
  const [selectedSku, setSelectedSku] = useState<string>("All");
  const [searchSku, setSearchSku] = useState<string>("");
  const [searchOrder, setSearchOrder] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [profRes, salesRes, cogsRes] = await Promise.all([
          fetch("/api/profitability?per_page=50000"),
          fetch("/api/sales?per_page=1"),
          fetch("/api/cogs"),
        ]);
        const profData = await profRes.json();
        const salesData = await salesRes.json();
        const cogsData = await cogsRes.json();

        setData(profData.data || []);
        setTotalSales(salesData.total || 0);
        setTotalCogsCount(Array.isArray(cogsData) ? cogsData.length : 0);
      } catch (e) {
        console.error("Dashboard load error:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Compute Filter Options
  const { allYears, allMonths, allSkus } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    const skus = new Set<string>();

    data.forEach((r) => {
      if (r.year) years.add(r.year.toString());
      if (r.month) months.add(r.month);
      if (r.sku) skus.add(r.sku);
    });

    return {
      allYears: Array.from(years).sort(),
      allMonths: Array.from(months), // Or sort by month_num
      allSkus: Array.from(skus).sort(),
    };
  }, [data]);

  // Apply Filters
  const filteredData = useMemo(() => {
    return data.filter((r) => {
      const matchYear = selectedYear === "All" || r.year.toString() === selectedYear;
      const matchMonth = selectedMonth === "All" || r.month === selectedMonth;
      const matchSku = selectedSku === "All" || r.sku === selectedSku;
      const matchSearchSku = searchSku === "" || (r.sku && r.sku.toLowerCase().includes(searchSku.toLowerCase()));
      const matchSearchOrder = searchOrder === "" || (r.order_id && r.order_id.toLowerCase().includes(searchOrder.toLowerCase()));
      return matchYear && matchMonth && matchSku && matchSearchSku && matchSearchOrder;
    });
  }, [data, selectedYear, selectedMonth, selectedSku, searchSku, searchOrder]);

  // Compute Aggregations
  const summary = useMemo(() => {
    return {
      total_revenue: filteredData.reduce((s, r) => s + r.invoice_amount, 0),
      total_cogs: filteredData.reduce((s, r) => s + r.total_cogs, 0),
      total_shipping: filteredData.reduce((s, r) => s + r.shipment_cost, 0),
      total_jh_profit: filteredData.reduce((s, r) => s + r.jh_profit, 0),
      total_halte_profit: filteredData.reduce((s, r) => s + r.halte_profit, 0),
      total_profit: filteredData.reduce((s, r) => s + r.total_profit, 0),
      orders_with_cogs: filteredData.filter((r) => r.cogs_available).length,
      orders_without_cogs: filteredData.filter((r) => !r.cogs_available).length,
    };
  }, [filteredData]);

  // Chart Data: State-wise
  const stateChartData = useMemo(() => {
    const map = new Map<string, { state: string; Revenue: number; Profit: number }>();
    filteredData.forEach((r) => {
      const s = r.state || "Unknown";
      const existing = map.get(s);
      if (existing) {
        existing.Revenue += r.invoice_amount;
        existing.Profit += r.total_profit;
      } else {
        map.set(s, { state: s, Revenue: r.invoice_amount, Profit: r.total_profit });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.Revenue - a.Revenue)
      .slice(0, 15); // Top 15 states
  }, [filteredData]);

  // Chart Data: Top 15 SKUs
  const skuChartData = useMemo(() => {
    const map = new Map<string, { sku: string; Revenue: number; Profit: number }>();
    filteredData.forEach((r) => {
      const existing = map.get(r.sku);
      if (existing) {
        existing.Revenue += r.invoice_amount;
        existing.Profit += r.total_profit;
      } else {
        map.set(r.sku, { sku: r.sku, Revenue: r.invoice_amount, Profit: r.total_profit });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.Revenue - a.Revenue)
      .slice(0, 15); // Top 15 SKUs
  }, [filteredData]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const kpis = [
    { label: "Total Revenue", value: formatINR(summary.total_revenue), icon: "💰", color: "var(--accent-indigo)" },
    { label: "Total COGS", value: formatINR(summary.total_cogs), icon: "📦", color: "var(--accent-amber)" },
    { label: "JH Profit", value: formatINR(summary.total_jh_profit), icon: "🏢", color: "var(--accent-emerald)" },
    { label: "Halte Profit", value: formatINR(summary.total_halte_profit), icon: "🛒", color: "var(--accent-sky)" },
    { label: "Total Profit", value: formatINR(summary.total_profit), icon: "📈", color: summary.total_profit >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" },
    { label: "Shipping", value: formatINR(summary.total_shipping), icon: "🚚", color: "var(--accent-rose)" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: "rgba(10, 10, 15, 0.95)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px", color: "var(--text-primary)" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{label}</p>
          <p style={{ color: payload[0].color, fontSize: "0.875rem" }}>Revenue: {formatINR(payload[0].value)}</p>
          <p style={{ color: payload[1].color, fontSize: "0.875rem" }}>Profit: {formatINR(payload[1].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
      {/* Header & Filters */}
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.5rem" }}>Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>PowerBI-style Analytics & Profitability tracking.</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>Year</label>
            <select className="input-field" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ padding: "0.375rem", fontSize: "0.875rem", minWidth: "100px" }}>
              <option value="All">All Years</option>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>Month</label>
            <select className="input-field" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: "0.375rem", fontSize: "0.875rem", minWidth: "120px" }}>
              <option value="All">All Months</option>
              {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>SKU Group</label>
            <select className="input-field" value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)} style={{ padding: "0.375rem", fontSize: "0.875rem", minWidth: "150px", maxWidth: "250px" }}>
              <option value="All">All SKUs</option>
              {allSkus.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>Search SKU</label>
            <input type="text" className="input-field" placeholder="Search by SKU..." value={searchSku} onChange={(e) => setSearchSku(e.target.value)} style={{ padding: "0.375rem", fontSize: "0.875rem", minWidth: "150px" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.25rem", textTransform: "uppercase" }}>Search Order</label>
            <input type="text" className="input-field" placeholder="Search Order ID..." value={searchOrder} onChange={(e) => setSearchOrder(e.target.value)} style={{ padding: "0.375rem", fontSize: "0.875rem", minWidth: "150px" }} />
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="animate-fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {kpis.map((kpi, i) => (
          <div key={i} className="kpi-card" style={{ animationDelay: `${i * 80}ms` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.label}</span>
              <span style={{ fontSize: "1.25rem" }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: kpi.color, letterSpacing: "-0.01em" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        {/* State Chart */}
        <div className="glass-card" style={{ padding: "1.5rem", height: "450px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>State-wise Performance (Top 15)</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>Revenue vs Profit</span>
          </h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={stateChartData} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="state" stroke="var(--text-muted)" fontSize={11} angle={-45} textAnchor="end" height={60} />
              <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px", color: "var(--text-secondary)" }} />
              <Bar yAxisId="left" dataKey="Revenue" fill="var(--accent-indigo)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="right" dataKey="Profit" fill="var(--accent-emerald)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* SKU Chart */}
        <div className="glass-card" style={{ padding: "1.5rem", height: "450px" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--text-primary)", display: "flex", justifyContent: "space-between" }}>
            <span>SKU Performance (Top 15)</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 500 }}>Revenue vs Profit</span>
          </h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={skuChartData} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="sku" stroke="var(--text-muted)" fontSize={11} angle={-45} textAnchor="end" height={60} />
              <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px", color: "var(--text-secondary)" }} />
              <Bar yAxisId="left" dataKey="Revenue" fill="var(--accent-sky)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="right" dataKey="Profit" fill="var(--accent-emerald)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Auxiliary Info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
        <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>Dataset Coverage</h3>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Total Database Sales</span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{totalSales.toLocaleString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Filtered Orders Match</span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{filteredData.length.toLocaleString()}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>SKUs with COGS configured</span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{totalCogsCount}</span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)" }}>Quick Links</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <a href="/cogs" className="btn-secondary" style={{ flex: 1, minWidth: "120px", textDecoration: "none", textAlign: "center", padding: "0.75rem" }}>💰 Global COGS</a>
            <a href="/profitability" className="btn-secondary" style={{ flex: 1, minWidth: "120px", textDecoration: "none", textAlign: "center", padding: "0.75rem" }}>📈 Order Analytics</a>
            <a href="/shipments" className="btn-secondary" style={{ flex: 1, minWidth: "120px", textDecoration: "none", textAlign: "center", padding: "0.75rem" }}>🚚 Shipments</a>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            The order analytics table provides the explicit breakdown joining sales, shipments, and unit-level COGS.
          </p>
        </div>
      </div>
    </div>
  );
}
