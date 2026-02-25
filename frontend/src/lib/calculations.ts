// ============================================
// COGS & Profitability Calculation Engine
// ============================================

export interface CogsInput {
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
}

export interface CogsBreakdown {
    import_price_inr: number;
    custom_duty_amt: number;
    gst1_amt: number;
    landed_cost: number;
    margin1_amt: number;
    halte_cost_price: number;
    margin2_amt: number;
    selling_price: number;
    gst2_amt: number;
    msp: number;
}

/**
 * Calculate all COGS derived values from user inputs.
 * Returns the full breakdown for display/verification.
 */
export function calculateCogs(input: CogsInput): CogsBreakdown {
    // Step 1: Convert import price to INR
    const import_price_inr = input.import_price * input.exchange_rate;

    // Step 2: Custom duty
    const custom_duty_amt = import_price_inr * (input.custom_duty_pct / 100);

    // Step 3: GST on import (applied on import_price_inr + custom_duty)
    const gst1_amt =
        (import_price_inr + custom_duty_amt) * (input.gst1_pct / 100);

    // Step 4: Landed cost
    const landed_cost =
        import_price_inr + custom_duty_amt + gst1_amt + input.shipping_cost;

    // Step 5: JH Margin (margin1)
    const margin1_amt = landed_cost * (input.margin1_pct / 100);

    // Step 6: Halte cost price (what JH sells to Halte at)
    const halte_cost_price = landed_cost + margin1_amt;

    // Step 7: Halte margin (margin2)
    const margin2_amt = halte_cost_price * (input.margin2_pct / 100);

    // Step 8: Selling price
    const selling_price =
        halte_cost_price + input.marketing_cost + margin2_amt;

    // Step 9: GST on selling
    const gst2_amt = selling_price * (input.gst2_pct / 100);

    // Step 10: MSP (Minimum Selling Price)
    const msp = selling_price + gst2_amt;

    return {
        import_price_inr: round2(import_price_inr),
        custom_duty_amt: round2(custom_duty_amt),
        gst1_amt: round2(gst1_amt),
        landed_cost: round2(landed_cost),
        margin1_amt: round2(margin1_amt),
        halte_cost_price: round2(halte_cost_price),
        margin2_amt: round2(margin2_amt),
        selling_price: round2(selling_price),
        gst2_amt: round2(gst2_amt),
        msp: round2(msp),
    };
}

/**
 * Calculate profitability for a single order line.
 */
export interface ProfitabilityInput {
    invoice_amount: number; // Actual selling price from Amazon
    quantity: number;
    halte_cost_price: number; // Per unit from COGS
    landed_cost: number; // Per unit from COGS
    shipment_cost: number; // Total shipment cost for this order line
}

export interface ProfitabilityResult {
    revenue: number;
    total_cogs: number;
    jh_profit: number;
    jh_margin_pct: number;
    halte_profit: number;
    halte_margin_pct: number;
    total_profit: number;
    total_margin_pct: number;
}

export function calculateProfitability(
    input: ProfitabilityInput
): ProfitabilityResult {
    const revenue = input.invoice_amount;
    const total_cogs = input.halte_cost_price * input.quantity;

    // JH profit: what JH earns by selling to Halte at halte_cost_price vs its landed_cost
    const jh_profit =
        (input.halte_cost_price - input.landed_cost) * input.quantity;
    const jh_revenue = input.halte_cost_price * input.quantity;

    // Halte profit: Amazon revenue - COGS paid to JH - shipping
    const halte_profit =
        revenue - total_cogs - input.shipment_cost;

    const total_profit = jh_profit + halte_profit;

    return {
        revenue: round2(revenue),
        total_cogs: round2(total_cogs),
        jh_profit: round2(jh_profit),
        jh_margin_pct: jh_revenue > 0 ? round2((jh_profit / jh_revenue) * 100) : 0,
        halte_profit: round2(halte_profit),
        halte_margin_pct:
            revenue > 0 ? round2((halte_profit / revenue) * 100) : 0,
        total_profit: round2(total_profit),
        total_margin_pct:
            revenue > 0 ? round2((total_profit / revenue) * 100) : 0,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
