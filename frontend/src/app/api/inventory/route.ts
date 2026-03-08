import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, getCacheHeaders } from "@/lib/cache";

export const maxDuration = 60;

const CACHE_TTL_MS = 300_000; // 5 minutes
const CACHE_KEY = "inventory_forecast_v2";

// ===================================================================
//  ALGORITHM 1: Holt-Winters Triple Exponential Smoothing
//  Best at: seasonal demand patterns (monthly cycles)
// ===================================================================
function holtWinters(data: number[], forecastPeriods: number, seasonLen: number = 12): number[] {
    const n = data.length;
    if (n === 0) return Array(forecastPeriods).fill(0);
    if (n < seasonLen) {
        const avg = data.reduce((a, b) => a + b, 0) / n;
        return Array(forecastPeriods).fill(Math.round(avg));
    }

    const ALPHA = 0.4, BETA = 0.3, GAMMA = 0.3;
    let L = data.slice(0, seasonLen).reduce((a, b) => a + b, 0) / seasonLen;
    let T = 0;

    if (n >= 2 * seasonLen) {
        let tSum = 0;
        for (let i = 0; i < seasonLen; i++) tSum += (data[i + seasonLen] - data[i]) / seasonLen;
        T = tSum / seasonLen;
    }

    const S = Array(seasonLen).fill(1).map((_, i) => (L !== 0 ? data[i] / L : 1));

    for (let i = 0; i < n; i++) {
        const cs = S[i % seasonLen] === 0 ? 0.01 : S[i % seasonLen];
        const lastL = L;
        L = ALPHA * (data[i] / cs) + (1 - ALPHA) * (lastL + T);
        T = BETA * (L - lastL) + (1 - BETA) * T;
        S[i % seasonLen] = GAMMA * (data[i] / L) + (1 - GAMMA) * cs;
    }

    const forecast: number[] = [];
    for (let m = 1; m <= forecastPeriods; m++) {
        const cs = S[(n + m - 1) % seasonLen];
        forecast.push(Math.max(0, Math.round((L + m * T) * cs)));
    }
    return forecast;
}

// ===================================================================
//  ALGORITHM 2: Weighted Moving Average (recent-bias)
//  Best at: detecting recent trend shifts
// ===================================================================
function weightedMovingAverage(data: number[], forecastPeriods: number, window: number = 90): number[] {
    const n = data.length;
    if (n === 0) return Array(forecastPeriods).fill(0);

    const w = Math.min(window, n);
    const recent = data.slice(-w);
    let weightedSum = 0, weightTotal = 0;

    for (let i = 0; i < recent.length; i++) {
        const weight = i + 1; // more recent = higher weight
        weightedSum += recent[i] * weight;
        weightTotal += weight;
    }

    const wma = weightedSum / weightTotal;

    // Detect trend from last 30 vs first 30 of the window
    const halfW = Math.min(30, Math.floor(w / 2));
    const firstHalf = recent.slice(0, halfW);
    const lastHalf = recent.slice(-halfW);
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgLast = lastHalf.reduce((a, b) => a + b, 0) / lastHalf.length;
    const dailyTrend = halfW > 0 ? (avgLast - avgFirst) / (w - halfW) : 0;

    const forecast: number[] = [];
    for (let m = 1; m <= forecastPeriods; m++) {
        forecast.push(Math.max(0, Math.round(wma + dailyTrend * m)));
    }
    return forecast;
}

// ===================================================================
//  ALGORITHM 3: Linear Regression (least squares)
//  Best at: long-term trend direction
// ===================================================================
function linearRegression(data: number[], forecastPeriods: number): number[] {
    const n = data.length;
    if (n === 0) return Array(forecastPeriods).fill(0);
    if (n === 1) return Array(forecastPeriods).fill(data[0]);

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += data[i];
        sumXY += i * data[i];
        sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const forecast: number[] = [];
    for (let m = 1; m <= forecastPeriods; m++) {
        forecast.push(Math.max(0, Math.round(intercept + slope * (n + m - 1))));
    }
    return forecast;
}

// ===================================================================
//  ENSEMBLE: Combine all forecasts with configurable weights
// ===================================================================
function ensembleForecast(
    data: number[],
    forecastPeriods: number,
    monthlyData: number[],
): { forecast: number[]; upper: number[]; lower: number[] } {
    const hwForecast = holtWinters(monthlyData, forecastPeriods, 12);
    const wmaForecast = weightedMovingAverage(data, forecastPeriods, 90);
    const lrForecast = linearRegression(data, forecastPeriods);

    // Weights: HW=40%, WMA=35%, LR=25%
    const W_HW = 0.40, W_WMA = 0.35, W_LR = 0.25;

    // For Holt-Winters: it forecasts monthly, so we need to scale
    // Convert daily-level WMA/LR to monthly for comparison, or HW to daily
    // Strategy: produce monthly ensemble, since dashboard shows monthly
    const forecast: number[] = [];
    for (let i = 0; i < forecastPeriods; i++) {
        const hw = hwForecast[i] || 0;
        // WMA and LR give daily values — scale to monthly (×30)
        const wma = (wmaForecast[i] || 0) * 30;
        const lr = (lrForecast[i] || 0) * 30;
        forecast.push(Math.max(0, Math.round(hw * W_HW + wma * W_WMA + lr * W_LR)));
    }

    // Confidence interval: based on std dev of residuals
    const n = data.length;
    const mean = n > 0 ? data.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance) * 30; // scale to monthly

    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < forecastPeriods; i++) {
        // Wider bounds further into the future
        const spread = 1.96 * stdDev * Math.sqrt(1 + (i + 1) / forecastPeriods);
        upper.push(Math.max(0, Math.round(forecast[i] + spread)));
        lower.push(Math.max(0, Math.round(forecast[i] - spread)));
    }

    return { forecast, upper, lower };
}

// ===================================================================
//  Velocity Trend Detection
// ===================================================================
function detectVelocity(data: number[]): "accelerating" | "stable" | "decelerating" {
    if (data.length < 14) return "stable";
    const recent7 = data.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const prior7 = data.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    if (prior7 === 0) return recent7 > 0 ? "accelerating" : "stable";
    const change = (recent7 - prior7) / prior7;
    if (change > 0.15) return "accelerating";
    if (change < -0.15) return "decelerating";
    return "stable";
}

// ===================================================================
//  Interfaces
// ===================================================================
interface SalesRow {
    Sku: string;
    Quantity: string;
    Date: string;
    Month_Num: string;
    Year: string;
    Month_Name: string;
}

interface SnapshotRow {
    sku: string;
    snapshot_date: string;
    fulfillable_quantity: number;
    inbound_quantity: number;
    reserved_quantity: number;
    unfulfillable_quantity: number;
    total_quantity: number;
}

// ===================================================================
//  GET /api/inventory
// ===================================================================
export async function GET(request: NextRequest) {
    const cached = cacheGet<object>(CACHE_KEY);
    if (cached) return NextResponse.json(cached, { headers: getCacheHeaders(300) });

    try {
        // 1. Fetch daily sales data
        const { rows: allSalesData } = await query<SalesRow>(
            `SELECT "Sku", "Quantity", "Date", "Month_Num", "Year", "Month_Name"
             FROM sales_data
             WHERE "Transaction Type" != 'return'
             ORDER BY "Date" ASC
             LIMIT 50000`
        );

        // 2. Fetch latest inventory snapshots (most recent per SKU)
        const { rows: snapshots } = await query<SnapshotRow>(
            `SELECT DISTINCT ON (sku) sku, snapshot_date, fulfillable_quantity,
                    inbound_quantity, reserved_quantity, unfulfillable_quantity, total_quantity
             FROM inventory_snapshots
             ORDER BY sku, snapshot_date DESC`
        );

        // 3. Fetch snapshot history (last 90 days, all SKUs)
        const { rows: snapshotHistory } = await query<SnapshotRow>(
            `SELECT sku, snapshot_date, fulfillable_quantity, total_quantity
             FROM inventory_snapshots
             WHERE snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
             ORDER BY snapshot_date ASC`
        );

        // Build snapshot maps
        const latestStock: Record<string, SnapshotRow> = {};
        for (const s of snapshots) latestStock[s.sku] = s;

        const stockHistory: Record<string, { date: string; qty: number }[]> = {};
        for (const s of snapshotHistory) {
            if (!stockHistory[s.sku]) stockHistory[s.sku] = [];
            stockHistory[s.sku].push({ date: s.snapshot_date, qty: s.fulfillable_quantity });
        }

        // 4. Aggregate daily + monthly sales
        const dailySales: Record<string, Record<string, number>> = {};  // sku -> date -> qty
        const monthlySales: Record<string, Record<string, number>> = {}; // sku -> YYYY-MM -> qty

        let minYear = Infinity, minMonth = Infinity;
        let maxYear = -Infinity, maxMonth = -Infinity;

        for (const row of allSalesData) {
            const sku = row.Sku || "Unknown";
            const qty = parseInt(row.Quantity) || 0;
            const date = row.Date || "";
            const month = parseInt(row.Month_Num);
            const year = parseInt(row.Year);

            if (!month || !year || !date) continue;

            if (year < minYear || (year === minYear && month < minMonth)) { minYear = year; minMonth = month; }
            if (year > maxYear || (year === maxYear && month > maxMonth)) { maxYear = year; maxMonth = month; }

            // Daily
            if (!dailySales[sku]) dailySales[sku] = {};
            dailySales[sku][date] = (dailySales[sku][date] || 0) + qty;

            // Monthly
            const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
            if (!monthlySales[sku]) monthlySales[sku] = {};
            monthlySales[sku][monthKey] = (monthlySales[sku][monthKey] || 0) + qty;
        }

        if (minYear === Infinity) return NextResponse.json({ data: [] });

        // 5. Build timelines
        const monthTimeline: string[] = [];
        let cy = minYear, cm = minMonth;
        while (cy < maxYear || (cy === maxYear && cm <= maxMonth)) {
            monthTimeline.push(`${cy}-${cm.toString().padStart(2, '0')}`);
            cm++; if (cm > 12) { cm = 1; cy++; }
        }

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const projTimeline: string[] = [];
        let py = maxYear, pm = maxMonth + 1;
        if (pm > 12) { pm = 1; py++; }
        for (let i = 0; i < 12; i++) {
            projTimeline.push(`${monthNames[pm - 1]} ${py}`);
            pm++; if (pm > 12) { pm = 1; py++; }
        }

        // 6. Build daily timeline for recent 90 days
        const today = new Date();
        const dailyTimeline: string[] = [];
        for (let d = 89; d >= 0; d--) {
            const dt = new Date(today);
            dt.setDate(dt.getDate() - d);
            dailyTimeline.push(dt.toISOString().split('T')[0]);
        }

        // Default lead time assumption (days)
        const LEAD_TIME = 21;
        const Z_95 = 1.65; // z-score for 95% service level

        // 7. Run forecasting per SKU
        const allSkus = new Set([...Object.keys(dailySales), ...Object.keys(latestStock)]);
        const inventoryAnalysis = [];

        for (const sku of allSkus) {
            // Daily demand array (last 90 days)
            const dailyDemand: number[] = [];
            const skuDailyMap = dailySales[sku] || {};
            for (const date of dailyTimeline) {
                dailyDemand.push(skuDailyMap[date] || 0);
            }

            // Monthly demand array (full history)
            const monthlyDemand: number[] = [];
            const skuMonthlyMap = monthlySales[sku] || {};
            for (const mk of monthTimeline) {
                monthlyDemand.push(skuMonthlyMap[mk] || 0);
            }

            // Ensemble forecast (monthly, 12 months ahead)
            const { forecast, upper, lower } = ensembleForecast(dailyDemand, 12, monthlyDemand);

            // Statistics
            const nonZeroDays = dailyDemand.filter(d => d > 0);
            const avgDailyDemand = nonZeroDays.length > 0
                ? nonZeroDays.reduce((a, b) => a + b, 0) / dailyDemand.length
                : 0;
            const stdDevDaily = dailyDemand.length > 1
                ? Math.sqrt(dailyDemand.reduce((s, v) => s + (v - avgDailyDemand) ** 2, 0) / (dailyDemand.length - 1))
                : 0;

            // Real stock from snapshots (or 0 if no snapshot yet)
            const snap = latestStock[sku];
            const currentStock = snap ? snap.fulfillable_quantity : 0;
            const inboundQty = snap ? snap.inbound_quantity : 0;
            const reservedQty = snap ? snap.reserved_quantity : 0;
            const hasRealStock = !!snap;

            // Safety stock = z × σ × √lead_time
            const safetyStock = Math.ceil(Z_95 * stdDevDaily * Math.sqrt(LEAD_TIME));

            // Reorder point = (avg_daily × lead_time) + safety_stock
            const reorderPoint = Math.ceil(avgDailyDemand * LEAD_TIME + safetyStock);

            // Days of stock = current_stock / avg_daily_demand
            const daysOfStock = avgDailyDemand > 0 ? Math.round(currentStock / avgDailyDemand) : 999;

            // Stockout date prediction
            let stockoutDate: string | null = null;
            if (avgDailyDemand > 0 && daysOfStock < 365) {
                const sod = new Date();
                sod.setDate(sod.getDate() + daysOfStock);
                stockoutDate = sod.toISOString().split('T')[0];
            }

            // Recommended reorder quantity (3 months of demand)
            const reorderQty = Math.max(0,
                Math.ceil(avgDailyDemand * 90) - currentStock + safetyStock
            );

            // Status classification
            let status: string;
            if (!hasRealStock && avgDailyDemand === 0) {
                status = "No Data";
            } else if (currentStock <= safetyStock) {
                status = "Critical";
            } else if (daysOfStock < 30) {
                status = "Low";
            } else if (daysOfStock > 180 && avgDailyDemand > 0) {
                status = "Overstocked";
            } else {
                status = "Healthy";
            }

            // Velocity trend
            const velocity = detectVelocity(dailyDemand);

            // Total projected 12-month demand
            const projection12m = forecast.reduce((a, b) => a + b, 0);

            inventoryAnalysis.push({
                sku,
                has_real_stock: hasRealStock,
                current_stock: currentStock,
                fulfillable_qty: currentStock,
                inbound_qty: inboundQty,
                reserved_qty: reservedQty,
                snapshot_date: snap?.snapshot_date || null,
                avg_daily_demand: round2(avgDailyDemand),
                avg_monthly_demand: Math.round(avgDailyDemand * 30),
                days_of_stock: daysOfStock,
                stockout_date: stockoutDate,
                safety_stock: safetyStock,
                reorder_point: reorderPoint,
                reorder_qty: reorderQty,
                status,
                velocity_trend: velocity,
                projection_12m_total: projection12m,
                forecast_values: forecast,
                confidence_upper: upper,
                confidence_lower: lower,
                historical_daily: dailyDemand,
                historical_monthly: monthlyDemand.slice(-12),
                stock_history: stockHistory[sku] || [],
            });
        }

        // Sort: Critical first, then Low, then by demand
        const statusOrder: Record<string, number> = { Critical: 0, Low: 1, Healthy: 2, Overstocked: 3, "No Data": 4 };
        inventoryAnalysis.sort((a, b) => {
            const sA = statusOrder[a.status] ?? 4;
            const sB = statusOrder[b.status] ?? 4;
            if (sA !== sB) return sA - sB;
            return b.projection_12m_total - a.projection_12m_total;
        });

        const response = {
            historical_timeline: monthTimeline.slice(-12),
            projection_timeline: projTimeline,
            daily_timeline: dailyTimeline,
            lead_time_days: LEAD_TIME,
            data: inventoryAnalysis,
        };

        cacheSet(CACHE_KEY, response, CACHE_TTL_MS);
        return NextResponse.json(response, { headers: getCacheHeaders(300) });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Inventory API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
