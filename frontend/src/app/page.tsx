"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from "recharts";

interface ProfitRow {
  order_id: string;
  sku: string;
  date: string;
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

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toFixed(0);
}

const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#f43f5e",
  "#8b5cf6", "#06d6a0", "#ef4444", "#14b8a6", "#ec4899",
  "#a855f7", "#22c55e", "#eab308", "#3b82f6",
];

export default function DashboardPage() {
  const [data, setData] = useState<ProfitRow[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // Filters
  const [timeframe, setTimeframe] = useState<string>("All Time");
  const [selectedYear, setSelectedYear] = useState<string>("All");
  const [selectedMonth, setSelectedMonth] = useState<string>("All");
  const [selectedSku, setSelectedSku] = useState<string>("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [profRes, salesRes] = await Promise.all([
          fetch("/api/profitability?per_page=50000"),
          fetch("/api/sales?per_page=1"),
        ]);
        const profData = await profRes.json();
        const salesData = await salesRes.json();

        if (profData.error) {
          setErrorMsg(profData.error);
          setData([]);
          setTotalSales(0);
        } else {
          setData(profData.data || []);
          setTotalSales(salesData.total || 0);
          setErrorMsg(null);
        }
      } catch (e) {
        console.error("Dashboard load error:", e);
        setErrorMsg(e instanceof Error ? e.message : "Failed to load dashboard data");
      }
      setLoading(false);
    }
    load();
  }, []);

  // Filter options from data
  const { allYears, allMonths, allSkus } = useMemo(() => {
    const years = new Set<number>();
    const monthSet = new Map<number, string>(); // month_num -> month name
    const skus = new Set<string>();
    data.forEach((r) => {
      if (r.year) years.add(r.year);
      if (r.month && r.month_num) monthSet.set(r.month_num, r.month);
      if (r.sku) skus.add(r.sku);
    });
    // Sort months by month_num
    const sortedMonths = Array.from(monthSet.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, name]) => name);
    return {
      allYears: Array.from(years).sort((a, b) => b - a),
      allMonths: sortedMonths,
      allSkus: Array.from(skus).sort(),
    };
  }, [data]);

  // Apply filters
  const filtered = useMemo(() => {
    // Current date calculations for relative filters
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    return data.filter((r) => {
      if (selectedYear !== "All" && r.year !== Number(selectedYear)) return false;
      if (selectedMonth !== "All" && r.month !== selectedMonth) return false;
      if (selectedSku !== "All" && r.sku !== selectedSku) return false;

      // Timeframe logic
      if (timeframe !== "All Time" && r.date) {
        // Amazon dates can have time components, taking only YYYY-MM-DD ensures accurate midnight comparisons
        const rowDate = new Date(r.date.split("T")[0]);
        rowDate.setHours(0, 0, 0, 0);

        if (timeframe === "Today" && rowDate.getTime() !== today.getTime()) return false;
        if (timeframe === "Yesterday" && rowDate.getTime() !== yesterday.getTime()) return false;
        if (timeframe === "Last 7 Days" && rowDate < sevenDaysAgo) return false;
        if (timeframe === "Last 30 Days" && rowDate < thirtyDaysAgo) return false;
      }

      if (search && !(r.sku || "").toLowerCase().includes(search.toLowerCase()) && !(r.order_id || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, selectedYear, selectedMonth, selectedSku, search, timeframe]);

  // KPI summaries
  const kpis = useMemo(() => {
    const rev = filtered.reduce((s, r) => s + r.invoice_amount, 0);
    const cogs = filtered.reduce((s, r) => s + r.total_cogs, 0);
    const ship = filtered.reduce((s, r) => s + r.shipment_cost, 0);
    const jhP = filtered.reduce((s, r) => s + r.jh_profit, 0);
    const hP = filtered.reduce((s, r) => s + r.halte_profit, 0);
    const tP = filtered.reduce((s, r) => s + r.total_profit, 0);
    const qty = filtered.reduce((s, r) => s + (r.quantity || 0), 0);
    const margin = rev > 0 ? (tP / rev) * 100 : 0;
    const uniqueSkus = new Set(filtered.map((r) => r.sku)).size;
    const withCogs = filtered.filter((r) => r.cogs_available).length;
    const withoutCogs = filtered.filter((r) => !r.cogs_available).length;
    return { rev, cogs, ship, jhP, hP, tP, qty, margin, uniqueSkus, withCogs, withoutCogs };
  }, [filtered]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { key: string; month: string; Revenue: number; Profit: number; Orders: number }>();
    filtered.forEach((r) => {
      const key = `${r.year}-${String(r.month_num).padStart(2, "0")}`;
      const label = `${(r.month || "?").substring(0, 3)} ${String(r.year).slice(-2)}`;
      const e = map.get(key);
      if (e) { e.Revenue += r.invoice_amount; e.Profit += r.total_profit; e.Orders++; }
      else map.set(key, { key, month: label, Revenue: r.invoice_amount, Profit: r.total_profit, Orders: 1 });
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  // State chart
  const stateChart = useMemo(() => {
    const m = new Map<string, { state: string; Revenue: number; Profit: number }>();
    filtered.forEach((r) => {
      const s = r.state || "Unknown";
      const e = m.get(s);
      if (e) { e.Revenue += r.invoice_amount; e.Profit += r.total_profit; }
      else m.set(s, { state: s, Revenue: r.invoice_amount, Profit: r.total_profit });
    });
    return Array.from(m.values()).sort((a, b) => b.Revenue - a.Revenue).slice(0, 10);
  }, [filtered]);

  // SKU chart
  const skuChart = useMemo(() => {
    const m = new Map<string, { sku: string; Revenue: number; Profit: number }>();
    filtered.forEach((r) => {
      const e = m.get(r.sku);
      if (e) { e.Revenue += r.invoice_amount; e.Profit += r.total_profit; }
      else m.set(r.sku, { sku: r.sku, Revenue: r.invoice_amount, Profit: r.total_profit });
    });
    return Array.from(m.values()).sort((a, b) => b.Revenue - a.Revenue).slice(0, 10);
  }, [filtered]);

  // Pie charts
  const statePie = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => m.set(r.state || "Unknown", (m.get(r.state || "Unknown") || 0) + r.invoice_amount));
    const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7).map(([name, value]) => ({ name, value }));
    const other = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    if (other > 0) top.push({ name: "Others", value: other });
    return top;
  }, [filtered]);

  const cogsPie = useMemo(() => [
    { name: "With COGS", value: kpis.withCogs },
    { name: "Without COGS", value: kpis.withoutCogs },
  ], [kpis]);

  // Smart sync - finds latest date and fetches onwards
  async function smartSync() {
    setSyncing(true);
    setSyncMsg("Detecting latest data...");
    try {
      const res = await fetch("/api/sales?per_page=1");
      const salesInfo = await res.json();
      // Find latest date in current data
      let latestDate = "2026-01-01";
      if (data.length > 0) {
        const dates = data.map((r) => r.year * 10000 + r.month_num * 100);
        const maxDateNum = Math.max(...dates);
        const maxYear = Math.floor(maxDateNum / 10000);
        const maxMonth = Math.floor((maxDateNum % 10000) / 100);
        latestDate = `${maxYear}-${String(maxMonth).padStart(2, "0")}-01`;
      }
      const today = new Date().toISOString().split("T")[0];
      setSyncMsg(`Syncing ${latestDate} → ${today}...`);

      const syncRes = await fetch(`/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: latestDate, date_to: today, report_types: ["ORDERS"] }),
      });
      const syncData = await syncRes.json();

      if (syncRes.ok) {
        setSyncMsg(`Sync started! Fetching orders from ${latestDate}...`);
        // Poll for completion
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch("/api/sync");
            const status = await statusRes.json();
            if (status.status === "completed") {
              clearInterval(poll);
              setSyncMsg(`✅ Done! ${status.records_fetched} orders fetched, ${status.records_inserted} inserted`);
              setSyncing(false);
              // Reload data
              setTimeout(() => window.location.reload(), 2000);
            } else if (status.status === "failed") {
              clearInterval(poll);
              setSyncMsg(`❌ Failed: ${status.error_message || "Unknown error"}`);
              setSyncing(false);
            } else {
              setSyncMsg(`⏳ Fetching... (${attempts * 5}s elapsed)`);
            }
          } catch { /* keep polling */ }
          if (attempts > 60) { clearInterval(poll); setSyncMsg("⏰ Timeout — check backend logs"); setSyncing(false); }
        }, 5000);
      } else {
        setSyncMsg(`❌ ${syncData.detail || "Sync failed"}`);
        setSyncing(false);
      }
    } catch (e) {
      setSyncMsg(`❌ Error: ${e instanceof Error ? e.message : "Unknown"}`);
      setSyncing(false);
    }
  }

  // Custom tooltips
  const ChartTip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; color: string; name: string }>; label?: string }) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: "rgba(10,10,18,0.96)", border: "1px solid var(--border)", padding: "0.625rem 0.875rem", borderRadius: "8px", fontSize: "0.75rem" }}>
        <p style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{label}</p>
        {payload.map((e, i) => <p key={i} style={{ color: e.color }}>{e.name}: {formatINR(e.value)}</p>)}
      </div>
    );
  };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "1rem" }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Loading analytics...</p>
    </div>
  );

  if (errorMsg) return (
    <div style={{ padding: "3rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", textAlign: "center" }}>
      <div style={{ background: "rgba(244, 63, 94, 0.1)", color: "var(--accent-rose)", padding: "1.5rem 2rem", borderRadius: "12px", border: "1px solid rgba(244, 63, 94, 0.2)", maxWidth: "500px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>⚠️ Failed to load data</h2>
        <p style={{ fontSize: "0.875rem", marginBottom: "1rem", lineHeight: 1.5 }}>
          The dashboard could not load data from the server. This is usually caused by database connection issues.
        </p>
        <code style={{ display: "block", background: "rgba(0,0,0,0.3)", padding: "0.75rem", borderRadius: "6px", fontSize: "0.75rem", textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {errorMsg}
        </code>
        <button className="btn-primary" style={{ marginTop: "1.5rem" }} onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "1.25rem", maxWidth: "1600px", margin: "0 auto" }}>
      {/* Header + Filters */}
      <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.125rem" }}>Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
            {filtered.length.toLocaleString()} orders · {totalSales.toLocaleString()} in DB
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Timeframe */}
          <div>
            <label style={{ display: "block", fontSize: "0.5625rem", color: "var(--text-muted)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Period</label>
            <select className="input-field" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem", minWidth: "120px" }}>
              <option value="All Time">All Time</option>
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
            </select>
          </div>
          {/* Year */}
          <div>
            <label style={{ display: "block", fontSize: "0.5625rem", color: "var(--text-muted)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Year</label>
            <select className="input-field" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem", minWidth: "90px" }}>
              <option value="All">All</option>
              {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {/* Month */}
          <div>
            <label style={{ display: "block", fontSize: "0.5625rem", color: "var(--text-muted)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Month</label>
            <select className="input-field" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem", minWidth: "110px" }}>
              <option value="All">All Months</option>
              {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {/* SKU */}
          <div>
            <label style={{ display: "block", fontSize: "0.5625rem", color: "var(--text-muted)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>SKU</label>
            <select className="input-field" value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)} style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem", minWidth: "110px", maxWidth: "180px" }}>
              <option value="All">All SKUs</option>
              {allSkus.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* Search */}
          <div>
            <label style={{ display: "block", fontSize: "0.5625rem", color: "var(--text-muted)", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Search</label>
            <input className="input-field" placeholder="SKU / Order ID" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "0.3rem 0.5rem", fontSize: "0.8125rem", width: "130px" }} />
          </div>
          {/* Sync */}
          <button className="btn-primary" onClick={smartSync} disabled={syncing} style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
            {syncing ? "⏳ Syncing..." : "🔄 Sync Amazon"}
          </button>
        </div>
      </div>

      {/* Sync status */}
      {syncMsg && (
        <div className="animate-fade-in" style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "var(--bg-secondary)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          {syncMsg}
        </div>
      )}

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: "0.625rem", marginBottom: "1.25rem" }}>
        {[
          { label: "Revenue", value: formatINR(kpis.rev), icon: "💰", color: "var(--accent-indigo)", sub: `${filtered.length.toLocaleString()} orders` },
          { label: "Total COGS", value: formatINR(kpis.cogs), icon: "📦", color: "var(--accent-amber)", sub: `${kpis.withCogs} tracked` },
          { label: "JH Profit", value: formatINR(kpis.jhP), icon: "🏢", color: "var(--accent-emerald)", sub: "Manufacturer" },
          { label: "Halte Profit", value: formatINR(kpis.hP), icon: "🛒", color: "var(--accent-sky)", sub: "Retailer" },
          { label: "Total Profit", value: formatINR(kpis.tP), icon: "📈", color: kpis.tP >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)", sub: `${kpis.margin.toFixed(1)}% margin` },
          { label: "Shipping", value: formatINR(kpis.ship), icon: "🚚", color: "var(--accent-rose)", sub: `${kpis.qty.toLocaleString()} units` },
          { label: "Unique SKUs", value: kpis.uniqueSkus.toString(), icon: "🏷️", color: "var(--accent-indigo-light)", sub: `in filtered set` },
        ].map((k, i) => (
          <div key={i} className="kpi-card animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.375rem" }}>
              <span style={{ fontSize: "0.5625rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              <span style={{ fontSize: "1rem" }}>{k.icon}</span>
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: k.color, letterSpacing: "-0.01em", marginBottom: "0.125rem" }}>{k.value}</div>
            <div style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly Trend */}
      {monthlyTrend.length > 1 && (
        <div className="glass-card animate-fade-in" style={{ padding: "1rem", marginBottom: "1.25rem", height: "280px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "0.75rem", fontWeight: 700 }}>Revenue & Profit Trend</h3>
            <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{monthlyTrend.length} months</span>
          </div>
          <ResponsiveContainer width="100%" height="88%">
            <AreaChart data={monthlyTrend} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                <linearGradient id="gProf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => `₹${fmtCompact(v)}`} />
              <RechartsTooltip content={<ChartTip />} />
              <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
              <Area type="monotone" dataKey="Revenue" stroke="#6366f1" strokeWidth={2} fill="url(#gRev)" />
              <Area type="monotone" dataKey="Profit" stroke="#10b981" strokeWidth={2} fill="url(#gProf)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bar Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div className="glass-card" style={{ padding: "1rem", height: "320px" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Top States</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={stateChart} margin={{ top: 5, right: 0, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="state" stroke="var(--text-muted)" fontSize={9} angle={-35} textAnchor="end" height={50} />
              <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `₹${fmtCompact(v)}`} />
              <RechartsTooltip content={<ChartTip />} />
              <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
              <Bar dataKey="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Profit" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card" style={{ padding: "1rem", height: "320px" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Top SKUs</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={skuChart} margin={{ top: 5, right: 0, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="sku" stroke="var(--text-muted)" fontSize={8} angle={-35} textAnchor="end" height={50} />
              <YAxis stroke="var(--text-muted)" fontSize={9} tickFormatter={(v) => `₹${fmtCompact(v)}`} />
              <RechartsTooltip content={<ChartTip />} />
              <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
              <Bar dataKey="Revenue" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Profit" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie Charts + Info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
        <div className="glass-card" style={{ padding: "1rem", height: "300px" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>Revenue by State</h3>
          <ResponsiveContainer width="100%" height="88%">
            <PieChart>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Pie data={statePie} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value" label={(entry: any) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: "0.5625rem" }}>
                {statePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card" style={{ padding: "1rem", height: "300px" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>COGS Coverage</h3>
          <ResponsiveContainer width="100%" height="65%">
            <PieChart>
              <Pie data={cogsPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                <Cell fill="#10b981" /><Cell fill="#f43f5e" />
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.25rem", fontSize: "0.6875rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} /> Tracked: <strong style={{ color: "var(--accent-emerald)" }}>{kpis.withCogs}</strong></span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e", display: "inline-block" }} /> Missing: <strong style={{ color: "var(--accent-rose)" }}>{kpis.withoutCogs}</strong></span>
          </div>
        </div>
        <div className="glass-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700 }}>Quick Links</h3>
          {[
            { label: "Total DB Sales", val: totalSales.toLocaleString() },
            { label: "Filtered Orders", val: filtered.length.toLocaleString() },
            { label: "Unique SKUs", val: kpis.uniqueSkus.toString() },
            { label: "Margin", val: `${kpis.margin.toFixed(1)}%`, color: kpis.margin >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
              <span style={{ fontWeight: 600, color: item.color || "var(--text-primary)" }}>{item.val}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.5rem", marginTop: "auto", display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {[
              { href: "/cogs", label: "💰 COGS" }, { href: "/profitability", label: "📈 Profit" },
              { href: "/finances", label: "🏦 Fees" }, { href: "/returns", label: "↩️ Returns" },
              { href: "/shipments", label: "🚚 Ship" }, { href: "/inventory", label: "🔮 AI" },
            ].map((l) => (
              <a key={l.href} href={l.href} className="btn-secondary" style={{ flex: 1, minWidth: "65px", textDecoration: "none", textAlign: "center", padding: "0.375rem", fontSize: "0.6875rem" }}>{l.label}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
