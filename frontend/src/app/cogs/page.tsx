"use client";

import React, { useEffect, useState, useCallback } from "react";
import { calculateCogs, CogsInput, CogsBreakdown } from "@/lib/calculations";

interface CogsRecord {
    id?: number;
    sku: string;
    product_name: string;
    article_number?: string;
    platform_fee_pct: number;
    import_price: number;
    currency: "USD" | "EUR" | "INR";
    exchange_rate: number;
    custom_duty_pct: number;
    gst1_pct: number;
    shipping_cost: number;
    margin1_pct: number;
    marketing_cost: number;
    margin2_pct: number;
    gst2_pct: number;
    // Computed (from DB)
    import_price_inr?: number;
    custom_duty_amt?: number;
    gst1_amt?: number;
    landed_cost?: number;
    margin1_amt?: number;
    halte_cost_price?: number;
    margin2_amt?: number;
    selling_price?: number;
    gst2_amt?: number;
    msp?: number;
}

interface SkuInfo {
    sku: string;
    brand: string;
    name: string;
    category: string;
}

interface Toast {
    message: string;
    type: "success" | "error";
}

const emptyRecord = (): CogsRecord => ({
    sku: "",
    product_name: "",
    article_number: "",
    platform_fee_pct: 15,
    import_price: 0,
    currency: "USD",
    exchange_rate: 83.5,
    custom_duty_pct: 0,
    gst1_pct: 18,
    shipping_cost: 0,
    margin1_pct: 10,
    marketing_cost: 0,
    margin2_pct: 15,
    gst2_pct: 18,
});

export default function CogsPage() {
    const [records, setRecords] = useState<CogsRecord[]>([]);
    const [skus, setSkus] = useState<SkuInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [editRow, setEditRow] = useState<CogsRecord | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showBulkForm, setShowBulkForm] = useState(false);
    const [expandedSku, setExpandedSku] = useState<string | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const showToast = useCallback((message: string, type: "success" | "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // Load data
    useEffect(() => {
        async function load() {
            try {
                const [cogsRes, skuRes] = await Promise.all([
                    fetch("/api/cogs"),
                    fetch("/api/skus"),
                ]);
                const cogsData = await cogsRes.json();
                const skuData = await skuRes.json();
                setRecords(Array.isArray(cogsData) ? cogsData : []);
                setSkus(Array.isArray(skuData) ? skuData : []);
            } catch (e) {
                console.error("Load error:", e);
                showToast("Failed to load data", "error");
            }
            setLoading(false);
        }
        load();
    }, [showToast]);

    async function loadData() {
        setLoading(true);
        try {
            const cogsRes = await fetch("/api/cogs");
            const cogsData = await cogsRes.json();
            setRecords(Array.isArray(cogsData) ? cogsData : []);
        } catch (e) {
            console.error("Reload error:", e);
        }
        setLoading(false);
    }

    // Save a record
    async function saveRecord(record: CogsRecord) {
        setSaving(record.sku);
        try {
            const res = await fetch("/api/cogs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(record),
            });
            const data = await res.json();
            if (res.ok) {
                setRecords((prev) => {
                    const idx = prev.findIndex((r) => r.sku === data.sku);
                    if (idx >= 0) {
                        const next = [...prev];
                        next[idx] = data;
                        return next;
                    }
                    return [...prev, data];
                });
                showToast(`Saved COGS for ${data.sku}`, "success");
                setShowForm(false);
                setEditRow(null);
            } else {
                showToast(data.error || "Save failed", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
        setSaving(null);
    }

    // Delete a record
    async function deleteRecord(sku: string) {
        if (!confirm(`Delete COGS for SKU: ${sku}?`)) return;
        try {
            const res = await fetch(`/api/cogs?sku=${encodeURIComponent(sku)}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setRecords((prev) => prev.filter((r) => r.sku !== sku));
                showToast(`Deleted ${sku}`, "success");
            }
        } catch {
            showToast("Delete failed", "error");
        }
    }

    // Compute live breakdown for a record
    function getBreakdown(record: CogsRecord): CogsBreakdown {
        const input: CogsInput = {
            import_price: Number(record.import_price) || 0,
            currency: record.currency,
            exchange_rate: Number(record.exchange_rate) || 1,
            custom_duty_pct: Number(record.custom_duty_pct) || 0,
            gst1_pct: Number(record.gst1_pct) || 0,
            shipping_cost: Number(record.shipping_cost) || 0,
            margin1_pct: Number(record.margin1_pct) || 0,
            marketing_cost: Number(record.marketing_cost) || 0,
            margin2_pct: Number(record.margin2_pct) || 0,
            gst2_pct: Number(record.gst2_pct) || 0,
            platform_fee_pct: Number(record.platform_fee_pct) || 0,
        };
        return calculateCogs(input);
    }

    const filtered = records.filter(
        (r) =>
            r.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.product_name || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div style={{ padding: "2rem 1.5rem", maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>
                        COGS Management
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                        Manage Cost of Goods Sold for each SKU. All amounts in ₹ INR.
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <button className="btn-secondary" onClick={() => setShowBulkForm(true)}>
                        💹 Bulk Update Currency
                    </button>
                    <button className="btn-primary" onClick={() => { setEditRow(emptyRecord()); setShowForm(true); }}>
                        + Add SKU COGS
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: "1rem" }}>
                <input
                    className="input-field"
                    placeholder="Search by SKU or product name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ maxWidth: "400px" }}
                />
            </div>

            {/* Stats bar */}
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem", fontSize: "0.8125rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>
                    Total SKUs: <strong style={{ color: "var(--text-primary)" }}>{records.length}</strong>
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                    Available in catalog: <strong style={{ color: "var(--text-primary)" }}>{skus.length}</strong>
                </span>
            </div>

            {/* Table */}
            <div className="glass-card" style={{ overflow: "auto", maxHeight: "70vh" }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Product</th>
                            <th>Article #</th>
                            <th>Import Price</th>
                            <th>Currency</th>
                            <th>Rate</th>
                            <th>Duty %</th>
                            <th>GST1 %</th>
                            <th>Shipping</th>
                            <th>Landed Cost</th>
                            <th>M1 %</th>
                            <th>Halte Cost</th>
                            <th>Marketing</th>
                            <th>M2 %</th>
                            <th>Selling Price</th>
                            <th>GST2 %</th>
                            <th>MSP</th>
                            <th>Plat. Fee %</th>
                            <th>Rec. Price</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={17} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                                    {records.length === 0
                                        ? "No COGS records yet. Click '+ Add SKU COGS' to get started."
                                        : "No matching records found."}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((r) => {
                                const bd = getBreakdown(r);
                                return (
                                    <React.Fragment key={r.sku}>
                                        <tr key={`tr-${r.sku}`}>
                                            <td style={{ fontWeight: 600, fontFamily: "monospace", fontSize: "0.75rem" }}>{r.sku}</td>
                                            <td style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.product_name || "—"}</td>
                                            <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.article_number || "—"}</td>
                                            <td>{(Number(r.import_price) || 0).toFixed(2)}</td>
                                            <td><span className="badge badge-success">{r.currency}</span></td>
                                            <td>{Number(r.exchange_rate) || 0}</td>
                                            <td>{Number(r.custom_duty_pct) || 0}%</td>
                                            <td>{Number(r.gst1_pct) || 0}%</td>
                                            <td>₹{Number(r.shipping_cost) || 0}</td>
                                            <td style={{ fontWeight: 600, color: "var(--accent-amber)" }}>₹{bd.landed_cost.toFixed(2)}</td>
                                            <td>{Number(r.margin1_pct) || 0}%</td>
                                            <td style={{ fontWeight: 600, color: "var(--accent-sky)" }}>₹{bd.halte_cost_price.toFixed(2)}</td>
                                            <td>₹{Number(r.marketing_cost) || 0}</td>
                                            <td>{Number(r.margin2_pct) || 0}%</td>
                                            <td style={{ fontWeight: 600, color: "var(--accent-indigo-light)" }}>₹{bd.selling_price.toFixed(2)}</td>
                                            <td>{Number(r.gst2_pct) || 0}%</td>
                                            <td style={{ fontWeight: 700, color: "var(--accent-emerald)" }}>₹{bd.msp.toFixed(2)}</td>
                                            <td>{Number(r.platform_fee_pct) || 0}%</td>
                                            <td style={{ fontWeight: 700, color: "var(--accent-indigo)" }}>₹{bd.recommended_price.toFixed(2)}</td>
                                            <td>
                                                <div style={{ display: "flex", gap: "0.375rem" }}>
                                                    <button className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setExpandedSku(expandedSku === r.sku ? null : r.sku)}>
                                                        {expandedSku === r.sku ? "▲" : "▼"}
                                                    </button>
                                                    <button className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => { setEditRow({ ...r }); setShowForm(true); }}>
                                                        ✏️
                                                    </button>
                                                    <button className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", color: "var(--accent-rose)" }} onClick={() => deleteRecord(r.sku)}>
                                                        🗑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedSku === r.sku && (
                                            <tr key={`${r.sku}-detail`}>
                                                <td colSpan={17} style={{ background: "var(--bg-secondary)", padding: "1rem" }}>
                                                    <CalculationBreakdown record={r} breakdown={bd} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showForm && editRow && (
                <CogsFormModal
                    record={editRow}
                    skus={skus}
                    saving={saving}
                    onSave={saveRecord}
                    onCancel={() => { setShowForm(false); setEditRow(null); }}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
                    {toast.message}
                </div>
            )}

            {/* Bulk Update Modal */}
            {showBulkForm && (
                <BulkUpdateModal
                    onSave={async (currency, rate) => {
                        try {
                            const res = await fetch("/api/cogs/bulk", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ currency, exchange_rate: rate }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                                showToast(`Successfully updated ${data.updated} SKUs`, "success");
                                setShowBulkForm(false);
                                loadData();
                            } else {
                                showToast(data.error || "Update failed", "error");
                            }
                        } catch {
                            showToast("Network error", "error");
                        }
                    }}
                    onCancel={() => setShowBulkForm(false)}
                />
            )}
        </div>
    );
}

/* ---- Calculation Breakdown Component ---- */
function CalculationBreakdown({ record, breakdown }: { record: CogsRecord; breakdown: CogsBreakdown }) {
    const steps = [
        { label: "1. Import Price (INR)", formula: `${record.import_price} × ${record.exchange_rate}`, value: breakdown.import_price_inr },
        { label: "2. Custom Duty", formula: `${breakdown.import_price_inr} × ${record.custom_duty_pct}%`, value: breakdown.custom_duty_amt },
        { label: "3. GST on Import", formula: `(${breakdown.import_price_inr} + ${breakdown.custom_duty_amt}) × ${record.gst1_pct}%`, value: breakdown.gst1_amt },
        { label: "4. Shipping Cost", formula: "User input", value: record.shipping_cost },
        { label: "5. Landed Cost", formula: "Import INR + Duty + GST1 + Shipping", value: breakdown.landed_cost, highlight: "amber" },
        { label: "6. JH Margin (M1)", formula: `${breakdown.landed_cost} × ${record.margin1_pct}%`, value: breakdown.margin1_amt },
        { label: "7. Halte Cost Price", formula: "Landed + M1 (JH sells to Halte at this price)", value: breakdown.halte_cost_price, highlight: "sky" },
        { label: "8. Marketing Cost", formula: "User input", value: record.marketing_cost },
        { label: "9. Halte Margin (M2)", formula: `${breakdown.halte_cost_price} × ${record.margin2_pct}%`, value: breakdown.margin2_amt },
        { label: "10. Selling Price", formula: "Halte Cost + Marketing + M2", value: breakdown.selling_price, highlight: "indigo" },
        { label: "11. GST on Selling", formula: `${breakdown.selling_price} × ${record.gst2_pct}%`, value: breakdown.gst2_amt },
        { label: "12. MSP (Min. Selling Price)", formula: "Selling Price + GST2", value: breakdown.msp, highlight: "emerald" },
        { label: "13. Recommended Price", formula: `Target Price to get M2 margin after ${record.platform_fee_pct}% Platform Fee + GST`, value: breakdown.recommended_price, highlight: "indigo" },
    ];

    return (
        <div style={{ maxWidth: "600px" }}>
            <h4 style={{ marginBottom: "0.75rem", fontWeight: 700, fontSize: "0.8125rem" }}>
                Step-by-Step Calculation for <span style={{ color: "var(--accent-indigo-light)" }}>{record.sku}</span>
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.375rem 0.5rem", borderRadius: "6px", background: step.highlight ? `rgba(${step.highlight === "amber" ? "245,158,11" : step.highlight === "sky" ? "14,165,233" : step.highlight === "indigo" ? "99,102,241" : "16,185,129"}, 0.08)` : "transparent" }}>
                        <div>
                            <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{step.label}</span>
                            <br />
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{step.formula}</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: step.highlight ? `var(--accent-${step.highlight})` : "var(--text-primary)", fontFamily: "monospace" }}>
                            ₹{step.value.toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---- Form Modal Component ---- */
function CogsFormModal({
    record,
    skus,
    saving,
    onSave,
    onCancel,
}: {
    record: CogsRecord;
    skus: SkuInfo[];
    saving: string | null;
    onSave: (r: CogsRecord) => void;
    onCancel: () => void;
}) {
    const [form, setForm] = useState<CogsRecord>(record);
    const bd = calculateCogs({
        import_price: form.import_price,
        currency: form.currency,
        exchange_rate: form.exchange_rate,
        custom_duty_pct: form.custom_duty_pct,
        gst1_pct: form.gst1_pct,
        shipping_cost: form.shipping_cost,
        margin1_pct: form.margin1_pct,
        marketing_cost: form.marketing_cost,
        margin2_pct: form.margin2_pct,
        gst2_pct: form.gst2_pct,
        platform_fee_pct: form.platform_fee_pct,
    });

    function setField(field: keyof CogsRecord, value: string | number) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    const isNew = !record.id;

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}
            onClick={onCancel}
        >
            <div
                className="glass-card animate-fade-in"
                style={{ width: "100%", maxWidth: "900px", maxHeight: "90vh", overflow: "auto", padding: "2rem" }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>
                    {isNew ? "Add" : "Edit"} COGS — {form.sku || "New SKU"}
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                    {/* Inputs */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div>
                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>SKU *</label>
                            {isNew ? (
                                <div>
                                    <input
                                        className="input-field"
                                        list="sku-list"
                                        value={form.sku}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setField("sku", val);
                                            const match = skus.find((s) => s.sku === val);
                                            if (match) setField("product_name", match.name);
                                        }}
                                        placeholder="Type or select SKU..."
                                    />
                                    <datalist id="sku-list">
                                        {skus.map((s) => (
                                            <option key={s.sku} value={s.sku}>
                                                {s.name} ({s.brand})
                                            </option>
                                        ))}
                                    </datalist>
                                </div>
                            ) : (
                                <div style={{ padding: "0.5rem 0.75rem", background: "var(--bg-secondary)", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.875rem" }}>
                                    {form.sku}
                                </div>
                            )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Product Name</label>
                                <input className="input-field" value={form.product_name || ""} onChange={(e) => setField("product_name", e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Article Number</label>
                                <input className="input-field" value={form.article_number || ""} onChange={(e) => setField("article_number", e.target.value)} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Import Price</label>
                                <input className="input-field" type="number" step="0.01" value={form.import_price} onChange={(e) => setField("import_price", parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Currency</label>
                                <select className="select-field" style={{ width: "100%" }} value={form.currency} onChange={(e) => setField("currency", e.target.value)}>
                                    <option value="USD">USD ($)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="INR">INR (₹)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Exchange Rate</label>
                                <input className="input-field" type="number" step="0.01" value={form.exchange_rate} onChange={(e) => setField("exchange_rate", parseFloat(e.target.value) || 1)} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Custom Duty %</label>
                                <input className="input-field" type="number" step="0.1" value={form.custom_duty_pct} onChange={(e) => setField("custom_duty_pct", parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>GST on Import %</label>
                                <input className="input-field" type="number" step="0.1" value={form.gst1_pct} onChange={(e) => setField("gst1_pct", parseFloat(e.target.value) || 0)} />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Shipping Cost (₹ per unit)</label>
                            <input className="input-field" type="number" step="0.01" value={form.shipping_cost} onChange={(e) => setField("shipping_cost", parseFloat(e.target.value) || 0)} />
                        </div>

                        <div>
                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>JH Margin (M1) %</label>
                            <input className="input-field" type="number" step="0.1" value={form.margin1_pct} onChange={(e) => setField("margin1_pct", parseFloat(e.target.value) || 0)} />
                        </div>

                        <div>
                            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Marketing Cost (₹ per unit)</label>
                            <input className="input-field" type="number" step="0.01" value={form.marketing_cost} onChange={(e) => setField("marketing_cost", parseFloat(e.target.value) || 0)} />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Halte Margin (M2) %</label>
                                <input className="input-field" type="number" step="0.1" value={form.margin2_pct} onChange={(e) => setField("margin2_pct", parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Platform Fee %</label>
                                <input className="input-field" type="number" step="0.1" value={form.platform_fee_pct} onChange={(e) => setField("platform_fee_pct", parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>GST on Selling %</label>
                                <input className="input-field" type="number" step="0.1" value={form.gst2_pct} onChange={(e) => setField("gst2_pct", parseFloat(e.target.value) || 0)} />
                            </div>
                        </div>
                    </div>

                    {/* Live Preview */}
                    <div style={{ background: "var(--bg-secondary)", borderRadius: "12px", padding: "1.25rem" }}>
                        <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, marginBottom: "1rem", color: "var(--accent-indigo-light)" }}>
                            📐 Live Calculation Preview
                        </h3>
                        <CalculationBreakdown record={form} breakdown={bd} />
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                    <button className="btn-secondary" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn-primary"
                        disabled={!form.sku || saving === form.sku}
                        onClick={() => onSave(form)}
                    >
                        {saving === form.sku ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span className="spinner" style={{ width: 14, height: 14 }} /> Saving...
                            </span>
                        ) : (
                            "Save COGS"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---- Bulk Update Modal Component ---- */
function BulkUpdateModal({
    onSave,
    onCancel,
}: {
    onSave: (currency: string, rate: number) => void;
    onCancel: () => void;
}) {
    const [currency, setCurrency] = useState("USD");
    const [rate, setRate] = useState(83.5);
    const [saving, setSaving] = useState(false);

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}
            onClick={onCancel}
        >
            <div
                className="glass-card animate-fade-in"
                style={{ width: "100%", maxWidth: "450px", padding: "2rem" }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Bulk Update Currency</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                    Update the exchange rate for all SKUs using the specified currency.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Currency to Update</label>
                        <select className="select-field" style={{ width: "100%" }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="INR">INR (₹)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>New Exchange Rate</label>
                        <input className="input-field" type="number" step="0.01" value={rate} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} />
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                    <button className="btn-secondary" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn-primary"
                        disabled={saving}
                        onClick={() => {
                            setSaving(true);
                            onSave(currency, rate);
                        }}
                    >
                        {saving ? "Updating..." : "Apply to All SKUs"}
                    </button>
                </div>
            </div>
        </div>
    );
}
