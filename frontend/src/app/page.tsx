"use client";

import { useEffect, useState } from "react";

interface SummaryData {
  total_revenue: number;
  total_cogs: number;
  total_shipping: number;
  total_jh_profit: number;
  total_halte_profit: number;
  total_profit: number;
  orders_with_cogs: number;
  orders_without_cogs: number;
}

function formatINR(n: number): string {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)} K`;
  return `₹${n.toFixed(2)}`;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [totalSales, setTotalSales] = useState(0);
  const [totalCogs, setTotalCogs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [profRes, salesRes, cogsRes] = await Promise.all([
          fetch("/api/profitability?per_page=5000"),
          fetch("/api/sales?per_page=1"),
          fetch("/api/cogs"),
        ]);
        const profData = await profRes.json();
        const salesData = await salesRes.json();
        const cogsData = await cogsRes.json();

        setSummary(profData.summary || null);
        setTotalSales(salesData.total || 0);
        setTotalCogs(Array.isArray(cogsData) ? cogsData.length : 0);
      } catch (e) {
        console.error("Dashboard load error:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
        }}
      >
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const kpis = [
    {
      label: "Total Revenue",
      value: summary ? formatINR(summary.total_revenue) : "—",
      icon: "💰",
      color: "var(--accent-indigo)",
    },
    {
      label: "Total COGS",
      value: summary ? formatINR(summary.total_cogs) : "—",
      icon: "📦",
      color: "var(--accent-amber)",
    },
    {
      label: "JH Profit",
      value: summary ? formatINR(summary.total_jh_profit) : "—",
      icon: "🏢",
      color: "var(--accent-emerald)",
    },
    {
      label: "Halte Profit",
      value: summary ? formatINR(summary.total_halte_profit) : "—",
      icon: "🛒",
      color: "var(--accent-sky)",
    },
    {
      label: "Total Profit",
      value: summary ? formatINR(summary.total_profit) : "—",
      icon: "📈",
      color:
        summary && summary.total_profit >= 0
          ? "var(--accent-emerald)"
          : "var(--accent-rose)",
    },
    {
      label: "Shipping Costs",
      value: summary ? formatINR(summary.total_shipping) : "—",
      icon: "🚚",
      color: "var(--accent-rose)",
    },
  ];

  return (
    <div style={{ padding: "2rem 1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
          }}
        >
          Dashboard
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Overview of JH — Halte COGS, margins, and profitability.
        </p>
      </div>

      {/* KPI Grid */}
      <div
        className="animate-fade-in"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {kpis.map((kpi, i) => (
          <div
            key={i}
            className="kpi-card"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {kpi.label}
              </span>
              <span style={{ fontSize: "1.25rem" }}>{kpi.icon}</span>
            </div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: kpi.color,
                letterSpacing: "-0.01em",
              }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Coverage */}
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "var(--text-primary)",
            }}
          >
            COGS Coverage
          </h3>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
            }}
          >
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              Total Sales Records
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{totalSales.toLocaleString()}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.75rem",
            }}
          >
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              SKUs with COGS
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{totalCogs}</span>
          </div>
          {summary && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  Orders with COGS
                </span>
                <span className="badge badge-success">{summary.orders_with_cogs}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  Orders missing COGS
                </span>
                <span className="badge badge-warning">{summary.orders_without_cogs}</span>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "var(--text-primary)",
            }}
          >
            Quick Actions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <a
              href="/cogs"
              className="btn-secondary"
              style={{
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              💰 Manage COGS
            </a>
            <a
              href="/profitability"
              className="btn-secondary"
              style={{
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              📈 View Profitability
            </a>
            <a
              href="/shipments"
              className="btn-secondary"
              style={{
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              🚚 Manage Shipments
            </a>
          </div>
        </div>

        {/* Profitability Split */}
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "var(--text-primary)",
            }}
          >
            Profit Split
          </h3>
          {summary ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.375rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    JH Profit
                  </span>
                  <span
                    className={
                      summary.total_jh_profit >= 0
                        ? "profit-positive"
                        : "profit-negative"
                    }
                    style={{ fontSize: "0.8125rem" }}
                  >
                    {formatINR(summary.total_jh_profit)}
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "var(--bg-secondary)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width:
                        summary.total_profit > 0
                          ? `${Math.max(0, (summary.total_jh_profit / summary.total_profit) * 100)}%`
                          : "0%",
                      background: "var(--gradient-2)",
                      borderRadius: "3px",
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.375rem",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    Halte Profit
                  </span>
                  <span
                    className={
                      summary.total_halte_profit >= 0
                        ? "profit-positive"
                        : "profit-negative"
                    }
                    style={{ fontSize: "0.8125rem" }}
                  >
                    {formatINR(summary.total_halte_profit)}
                  </span>
                </div>
                <div
                  style={{
                    height: "6px",
                    background: "var(--bg-secondary)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width:
                        summary.total_profit > 0
                          ? `${Math.max(0, (summary.total_halte_profit / summary.total_profit) * 100)}%`
                          : "0%",
                      background: "var(--gradient-1)",
                      borderRadius: "3px",
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
              Add COGS data to see profit split
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
