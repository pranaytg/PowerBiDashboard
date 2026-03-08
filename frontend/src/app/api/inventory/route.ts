import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { cacheGet, cacheSet, getCacheHeaders } from "@/lib/cache";

export const maxDuration = 60; // Allow 60s for forecasting 30k datasets

const CACHE_TTL_MS = 300_000; // 5 minutes — CPU-intensive forecasting
const CACHE_KEY = "inventory_forecast";

// Configuration for Holt-Winters algorithm
const ALPHA = 0.4; // Level smoothing
const BETA = 0.3;  // Trend smoothing
const GAMMA = 0.3; // Seasonal smoothing
const SEASON_LENGTH = 12; // 12 months in a year

// Helper to run Holt-Winters Triple Exponential Smoothing
// Uses a multiplicative seasonality model
function holtWintersForecast(data: number[], forecastPeriods: number = 12): number[] {
    const n = data.length;

    if (n < SEASON_LENGTH) {
        if (n === 0) return Array(forecastPeriods).fill(0);
        const avg = data.reduce((a, b) => a + b, 0) / n;
        return Array(forecastPeriods).fill(Math.round(avg));
    }

    let L = data.slice(0, SEASON_LENGTH).reduce((a, b) => a + b, 0) / SEASON_LENGTH;

    let T = 0;
    if (n >= 2 * SEASON_LENGTH) {
        let trendSum = 0;
        for (let i = 0; i < SEASON_LENGTH; i++) {
            trendSum += (data[i + SEASON_LENGTH] - data[i]) / SEASON_LENGTH;
        }
        T = trendSum / SEASON_LENGTH;
    }

    const S = Array(SEASON_LENGTH).fill(1).map((_, i) => (L !== 0 ? data[i] / L : 1));

    for (let i = 0; i < n; i++) {
        const currentS = S[i % SEASON_LENGTH] === 0 ? 0.01 : S[i % SEASON_LENGTH];
        const lastL = L;
        L = ALPHA * (data[i] / currentS) + (1 - ALPHA) * (lastL + T);
        T = BETA * (L - lastL) + (1 - BETA) * T;
        S[i % SEASON_LENGTH] = GAMMA * (data[i] / L) + (1 - GAMMA) * currentS;
    }

    const forecast: number[] = [];
    for (let m = 1; m <= forecastPeriods; m++) {
        const seasonOffset = (n + m - 1) % SEASON_LENGTH;
        const currentS = S[seasonOffset];
        const rawForecast = (L + m * T) * currentS;
        forecast.push(Math.max(0, Math.round(rawForecast)));
    }

    return forecast;
}

interface SalesRow {
    Sku: string;
    Quantity: string;
    Month_Num: string;
    Year: string;
    Month_Name: string;
}

export async function GET(request: NextRequest) {
    // Check cache — inventory forecast is CPU-heavy
    const cached = cacheGet<object>(CACHE_KEY);
    if (cached) {
        return NextResponse.json(cached, { headers: getCacheHeaders(300) });
    }

    try {
        // 1. Fetch ALL required sales data
        const { rows: allSalesData } = await query<SalesRow>(
            `SELECT "Sku", "Quantity", "Month_Num", "Year", "Month_Name"
             FROM sales_data
             WHERE "Transaction Type" != 'return'
             LIMIT 50000`
        );

        // 2. Aggregate quantity sold per SKU per month
        let minYear = Infinity, minMonth = Infinity;
        let maxYear = -Infinity, maxMonth = -Infinity;

        const skuDataMap: Record<string, Record<string, number>> = {};

        for (const row of allSalesData) {
            const sku = row.Sku || "Unknown";
            const qty = parseInt(row.Quantity) || 0;
            const month = parseInt(row.Month_Num);
            const year = parseInt(row.Year);

            if (!month || !year) continue;

            if (year < minYear || (year === minYear && month < minMonth)) {
                minYear = year; minMonth = month;
            }
            if (year > maxYear || (year === maxYear && month > maxMonth)) {
                maxYear = year; maxMonth = month;
            }

            const timeKey = `${year}-${month.toString().padStart(2, '0')}`;

            if (!skuDataMap[sku]) skuDataMap[sku] = {};
            skuDataMap[sku][timeKey] = (skuDataMap[sku][timeKey] || 0) + qty;
        }

        if (minYear === Infinity) return NextResponse.json({ data: [] });

        // 3. Generate a complete timeline array
        const globalTimeline: string[] = [];
        let currY = minYear;
        let currM = minMonth;
        while (currY < maxYear || (currY === maxYear && currM <= maxMonth)) {
            globalTimeline.push(`${currY}-${currM.toString().padStart(2, '0')}`);
            currM++;
            if (currM > 12) { currM = 1; currY++; }
        }

        const projectionTimeline: string[] = [];
        let projY = maxYear;
        let projM = maxMonth + 1;
        if (projM > 12) { projM = 1; projY++; }

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        for (let i = 0; i < 12; i++) {
            projectionTimeline.push(`${monthNames[projM - 1]} ${projY}`);
            projM++;
            if (projM > 12) { projM = 1; projY++; }
        }

        // 4. Run forecasting algorithm per SKU
        const inventoryAnalysis = [];
        for (const sku of Object.keys(skuDataMap)) {
            const historicalDemand: number[] = [];
            for (const monthKey of globalTimeline) {
                historicalDemand.push(skuDataMap[sku][monthKey] || 0);
            }

            const projectedDemand = holtWintersForecast(historicalDemand, 12);
            const totalProjected12M = projectedDemand.reduce((a, b) => a + b, 0);

            const mockCurrentStock = Math.floor(Math.random() * totalProjected12M * 0.5) + 10;
            const reorderThreshold = projectedDemand.slice(0, 3).reduce((a, b) => a + b, 0);

            const status = mockCurrentStock < reorderThreshold ? "Critical/Low Stock" :
                (mockCurrentStock > totalProjected12M ? "Overstocked" : "Healthy");

            inventoryAnalysis.push({
                sku,
                historical_avg_monthly: Math.round(historicalDemand.reduce((a, b) => a + b, 0) / historicalDemand.length),
                projection_12m_total: totalProjected12M,
                forecast_timeline: projectionTimeline,
                forecast_values: projectedDemand,
                current_stock: mockCurrentStock,
                reorder_threshold: reorderThreshold,
                status,
                recent_history: historicalDemand.slice(-12)
            });
        }

        // Sort to show critical items first
        inventoryAnalysis.sort((a, b) => {
            if (a.status === "Critical/Low Stock" && b.status !== "Critical/Low Stock") return -1;
            if (b.status === "Critical/Low Stock" && a.status !== "Critical/Low Stock") return 1;
            return b.projection_12m_total - a.projection_12m_total;
        });

        const response = {
            historical_timeline: globalTimeline.slice(-12),
            projection_timeline: projectionTimeline,
            data: inventoryAnalysis
        };

        cacheSet(CACHE_KEY, response, CACHE_TTL_MS);
        return NextResponse.json(response, { headers: getCacheHeaders(300) });

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Inventory API Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
