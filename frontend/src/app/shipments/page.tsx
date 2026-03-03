"use client";

import { useEffect, useState, useCallback } from "react";

interface ShipmentRecord {
    id?: number;
    order_id: string;
    sku: string;
    shipping_cost: number;
    carrier: string;
    tracking_number: string;
    shipped_date: string;
}

interface Toast {
    message: string;
    type: "success" | "error";
}

const emptyShipment = (): ShipmentRecord => ({
    order_id: "",
    sku: "",
    shipping_cost: 0,
    carrier: "",
    tracking_number: "",
    shipped_date: "",
});

export default function ShipmentsPage() {
    const [records, setRecords] = useState<ShipmentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editRow, setEditRow] = useState<ShipmentRecord>(emptyShipment());
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const showToast = useCallback((message: string, type: "success" | "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/shipments");
                const data = await res.json();
                setRecords(Array.isArray(data) ? data : []);
            } catch {
                showToast("Failed to load shipments", "error");
            }
            setLoading(false);
        }
        load();
    }, [showToast]);

    async function saveRecord() {
        if (!editRow.order_id) {
            showToast("Order ID is required", "error");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/shipments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editRow),
            });
            const data = await res.json();
            if (res.ok) {
                setRecords((prev) => {
                    const idx = prev.findIndex((r) => r.id === data.id);
                    if (idx >= 0) {
                        const next = [...prev];
                        next[idx] = data;
                        return next;
                    }
                    return [data, ...prev];
                });
                showToast("Shipment saved!", "success");
                setShowForm(false);
                setEditRow(emptyShipment());
            } else {
                showToast(data.error || "Save failed", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
        setSaving(false);
    }

    const filtered = records.filter(
        (r) =>
            r.order_id.includes(searchTerm.toLowerCase()) ||
            (r.sku || "").includes(searchTerm.toLowerCase()) ||
            (r.carrier || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalShipping = filtered.reduce((s, r) => s + (r.shipping_cost || 0), 0);

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div style={{ padding: "2rem 1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
            <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.375rem" }}>Shipments</h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                        Manage shipping costs per order for profitability calculation.
                    </p>
                </div>
                <button className="btn-primary" onClick={() => { setEditRow(emptyShipment()); setShowForm(true); }}>+ Add Shipment</button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", fontSize: "0.8125rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>
                    Total: <strong style={{ color: "var(--text-primary)" }}>{records.length}</strong>
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                    Total Shipping: <strong style={{ color: "var(--accent-rose)" }}>₹{totalShipping.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                </span>
            </div>

            {/* Search */}
            <div style={{ marginBottom: "1rem" }}>
                <input className="input-field" placeholder="Search by Order ID, SKU, or carrier..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ maxWidth: "400px" }} />
            </div>

            {/* Table */}
            <div className="glass-card" style={{ overflow: "auto", maxHeight: "65vh" }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>SKU</th>
                            <th>Shipping Cost</th>
                            <th>Carrier</th>
                            <th>Tracking</th>
                            <th>Ship Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No shipment records yet.</td></tr>
                        ) : filtered.map((r) => (
                            <tr key={r.id}>
                                <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{r.order_id}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{r.sku || "—"}</td>
                                <td style={{ fontWeight: 600, color: "var(--accent-amber)" }}>₹{Number(r.shipping_cost || 0).toFixed(2)}</td>
                                <td>{r.carrier || "—"}</td>
                                <td style={{ fontFamily: "monospace", fontSize: "0.6875rem" }}>{r.tracking_number || "—"}</td>
                                <td style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{r.shipped_date || "—"}</td>
                                <td>
                                    <button className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => { setEditRow({ ...r }); setShowForm(true); }}>
                                        ✏️ Edit
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {showForm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }} onClick={() => setShowForm(false)}>
                    <div className="glass-card animate-fade-in" style={{ width: "100%", maxWidth: "500px", padding: "2rem" }} onClick={(e) => e.stopPropagation()}>
                        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1.25rem" }}>
                            {editRow.id ? "Edit" : "Add"} Shipment
                        </h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Order ID *</label>
                                <input className="input-field" value={editRow.order_id} onChange={(e) => setEditRow({ ...editRow, order_id: e.target.value })} placeholder="e.g. 408-1234567-8901234" />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>SKU (optional)</label>
                                <input className="input-field" value={editRow.sku} onChange={(e) => setEditRow({ ...editRow, sku: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Shipping Cost (₹)</label>
                                <input className="input-field" type="number" step="0.01" value={editRow.shipping_cost} onChange={(e) => setEditRow({ ...editRow, shipping_cost: parseFloat(e.target.value) || 0 })} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                                <div>
                                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Carrier</label>
                                    <input className="input-field" value={editRow.carrier} onChange={(e) => setEditRow({ ...editRow, carrier: e.target.value })} placeholder="e.g. Delhivery, BlueDart" />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Ship Date</label>
                                    <input className="input-field" type="date" value={editRow.shipped_date} onChange={(e) => setEditRow({ ...editRow, shipped_date: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem", display: "block" }}>Tracking Number</label>
                                <input className="input-field" value={editRow.tracking_number} onChange={(e) => setEditRow({ ...editRow, tracking_number: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                            <button className="btn-primary" disabled={saving || !editRow.order_id} onClick={saveRecord}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
