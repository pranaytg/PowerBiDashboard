"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
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

function formatCompact(n: number): string {
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
}

const CHART_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#f43f5e",
  "#8b5cf6", "#06d6a0", "#ef4444", "#14b8a6", "#ec4899",
  "#a855f7", "#22c55e", "#eab308", "#3b82f6", "#e11d48",
];

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DashboardPage() {
  const [data, setData] = useState<ProfitRow[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [totalCogsCount, setTotalCogsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
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

  // Filter Options
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
      allMonths: MONTH_ORDER.filter((m) => months.has(m)),
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

  // Aggregations
  const summary = useMemo(() => {
    const total_revenue = filteredData.reduce((s, r) => s + r.invoice_amount, 0);
    const total_cogs = filteredData.reduce((s, r) => s + r.total_cogs, 0);
    const total_shipping = filteredData.reduce((s, r) => s + r.shipment_cost, 0);
    const total_jh_profit = filteredData.reduce((s, r) => s + r.jh_profit, 0);
    const total_halte_profit = filteredData.reduce((s, r) => s + r.halte_profit, 0);
    const total_profit = filteredData.reduce((s, r) => s + r.total_profit, 0);
    const total_qty = filteredData.reduce((s, r) => s + (r.quantity || 0), 0);
    const margin_pct = total_revenue > 0 ? (total_profit / total_revenue) * 100 : 0;
    return {
      total_revenue, total_cogs, total_shipping, total_jh_profit,
      total_halte_profit, total_profit, total_qty, margin_pct,
      orders_with_cogs: filteredData.filter((r) => r.cogs_available).length,
      orders_without_cogs: filteredData.filter((r) => !r.cogs_available).length,
    };
  }, [filteredData]);

  // Monthly Trend Data
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { key: string; month: string; Revenue: number; Profit: number; Orders: number }>();
    filteredData.forEach((r) => {
      const key = `${r.year}-${String(r.month_num).padStart(2, "0")}`;
      const label = `${r.month?.substring(0, 3)} ${String(r.year).slice(-2)}`;
      const existing = map.get(key);
      if (existing) {
        existing.Revenue += r.invoice_amount;
        existing.Profit += r.total_profit;
        existing.Orders += 1;
      } else {
        map.set(key, { key, month: label, Revenue: r.invoice_amount, Profit: r.total_profit, Orders: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredData]);

  // State-wise Chart
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
    return Array.from(map.values()).sort((a, b) => b.Revenue - a.Revenue).slice(0, 12);
  }, [filteredData]);

  // SKU Chart
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
    return Array.from(map.values()).sort((a, b) => b.Revenue - a.Revenue).slice(0, 12);
  }, [filteredData]);

  // Pie Chart: State Revenue Distribution (top 8)
  const statePieData = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach((r) => {
      const s = r.state || "Unknown";
      map.set(s, (map.get(s) || 0) + r.invoice_amount);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7);
    const otherSum = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    const result = top.map(([name, value]) => ({ name, value }));
    if (otherSum > 0) result.push({ name: "Others", value: otherSum });
    return result;
  }, [filteredData]);

  // Pie Chart: COGS Coverage
  const cogsPieData = useMemo(() => [
    { name: "With COGS", value: summary.orders_with_cogs },
    { name: "Without COGS", value: summary.orders_without_cogs },
  ], [summary]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: "rgba(10, 10, 15, 0.95)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.8125rem" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.375rem" }}>{label}</p>
          {payload.map((entry, i) => (
            <p key={i} style={{ color: entry.color, fontSize: "0.8125rem" }}>
              {entry.name}: {formatINR(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string } }> }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: "rgba(10, 10, 15, 0.95)", border: "1px solid var(--border)", padding: "0.75rem 1rem", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.8125rem" }}>
          <p style={{ fontWeight: 600 }}>{payload[0].payload.name}</p>
          <p>{formatINR(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "1rem" }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading analytics...</p>
      </div>
    );
  }

  const kpis = [
    { label: "Total Revenue", value: formatINR(summary.total_revenue), icon: "💰", color: "var(--accent-indigo)", sub: `${filteredData.length.toLocaleString()} orders` },
    { label: "Total COGS", value: formatINR(summary.total_cogs), icon: "📦", color: "var(--accent-amber)", sub: `${summary.orders_with_cogs} tracked` },
    { label: "JH Profit", value: formatINR(summary.total_jh_profit), icon: "🏢", color: "var(--accent-emerald)", sub: "Manufacturer margin" },
    { label: "Halte Profit", value: formatINR(summary.total_halte_profit), icon: "🛒", color: "var(--accent-sky)", sub: "Retailer margin" },
    { label: "Total Profit", value: formatINR(summary.total_profit), icon: "📈", color: summary.total_profit >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)", sub: `${summary.margin_pct.toFixed(1)}% margin` },
    { label: "Shipping", value: formatINR(summary.total_shipping), icon: "🚚", color: "var(--accent-rose)", sub: `${summary.total_qty.toLocaleString()} units` },
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
      {/* Header & Filters */}
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
            Analytics & Profitability · <span style={{ color: "var(--text-muted)" }}>{filteredData.length.toLocaleString()} orders · {totalSales.toLocaleString()} total in DB</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {[
            { label: "Year", value: selectedYear, setter: setSelectedYear, options: allYears, all: "All Years" },
            { label: "Month", value: selectedMonth, setter: setSelectedMonth, options: allMonths, all: "All Months" },
          ].map((f) => (
            <div key={f.label}>
              <label style={{ display: "block", fontSize: "0.625rem", color: "var(--text-muted)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.label}</label>
              <select className="input-field" value={f.value} onChange={(e) => f.setter(e.target.value)} style={{ padding: "0.375rem 0.5rem", fontSize: "0.8125rem", minWidth: "100px" }}>
                <option value="All">{f.all}</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label style={{ display: "block", fontSize: "0.625rem", color: "var(--text-muted)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU</label>
            <select className="input-field" value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)} style={{ padding: "0.375rem 0.5rem", fontSize: "0.8125rem", minWidth: "120px", maxWidth: "200px" }}>
              <option value="All">All SKUs</option>
              {allSkus.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.625rem", color: "var(--text-muted)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Search</label>
            <input type="text" className="input-field" placeholder="SKU or Order ID..." value={searchSku} onChange={(e) => { setSearchSku(e.target.value); setSearchOrder(e.target.value); }} style={{ padding: "0.375rem 0.5rem", fontSize: "0.8125rem", minWidth: "140px" }} />
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {kpis.map((kpi, i) => (
          <div key={i} className="kpi-card animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</span>
              <span style={{ fontSize: "1.125rem" }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: kpi.color, letterSpacing: "-0.01em", marginBottom: "0.25rem" }}>{kpi.value}</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly Trend (Full Width Area Chart) */}
      {monthlyTrend.length > 1 && (
        <div className="glass-card animate-fade-in" style={{ padding: "1.25rem", marginBottom: "1.5rem", height: "320px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>Monthly Revenue & Profit Trend</h3>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{monthlyTrend.length} months</span>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `₹${formatCompact(val)}`} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              <Area type="monotone" dataKey="Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#gradRevenue)" />
              <Area type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={2} fill="url(#gradProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Charts Row 1: Bar Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {/* State Bar Chart */}
        <div className="glass-card" style={{ padding: "1.25rem", height: "380px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>Top States</h3>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Revenue vs Profit</span>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={stateChartData} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="state" stroke="var(--text-muted)" fontSize={10} angle={-40} textAnchor="end" height={55} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => `₹${formatCompact(val)}`} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* SKU Bar Chart */}
        <div className="glass-card" style={{ padding: "1.25rem", height: "380px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>Top SKUs</h3>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>Revenue vs Profit</span>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={skuChartData} margin={{ top: 5, right: 0, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="sku" stroke="var(--text-muted)" fontSize={9} angle={-40} textAnchor="end" height={55} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(val) => `₹${formatCompact(val)}`} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="Revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2: Pie Charts + Info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {/* State Revenue Distribution Pie */}
        <div className="glass-card" style={{ padding: "1.25rem", height: "340px" }}>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>Revenue by State</h3>
          <ResponsiveContainer width="100%" height="85%">
            <PieChart>
              <Pie data={statePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: "0.625rem" }}>
                {statePieData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* COGS Coverage Pie */}
        <div className="glass-card" style={{ padding: "1.25rem", height: "340px" }}>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem" }}>COGS Coverage</h3>
          <ResponsiveContainer width="100%" height="70%">
            <PieChart>
              <Pie data={cogsPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                <Cell fill="#10b981" />
                <Cell fill="#f43f5e" />
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", fontSize: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ color: "var(--text-secondary)" }}>Tracked: <strong style={{ color: "var(--accent-emerald)" }}>{summary.orders_with_cogs}</strong></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f43f5e" }} />
              <span style={{ color: "var(--text-secondary)" }}>Missing: <strong style={{ color: "var(--accent-rose)" }}>{summary.orders_without_cogs}</strong></span>
            </div>
          </div>
        </div>

        {/* Dataset Info */}
        <div className="glass-card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)" }}>Dataset & Quick Links</h3>

          {[
            { label: "Total Database Sales", val: totalSales.toLocaleString() },
            { label: "Filtered Orders", val: filteredData.length.toLocaleString() },
            { label: "Unique SKUs", val: allSkus.length.toString() },
            { label: "COGS Configured", val: totalCogsCount.toString() },
            { label: "States Covered", val: statePieData.length.toString() },
            { label: "Margin", val: `${summary.margin_pct.toFixed(1)}%`, color: summary.margin_pct >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: item.color || "var(--text-primary)" }}>{item.val}</span>
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[
              { href: "/cogs", label: "💰 COGS" },
              { href: "/profitability", label: "📈 Analytics" },
              { href: "/shipments", label: "🚚 Shipments" },
              { href: "/inventory", label: "🔮 Inventory" },
            ].map((link) => (
              <a key={link.href} href={link.href} className="btn-secondary" style={{ flex: 1, minWidth: "80px", textDecoration: "none", textAlign: "center", padding: "0.5rem", fontSize: "0.75rem" }}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
