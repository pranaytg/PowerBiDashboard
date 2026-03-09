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
    platform_fee_pct: number; // e.g., 15 for 15% Amazon referral fee
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
    recommended_price: number; // Price to sell at to achieve target (M2) margin after platform fees
}

/**
 * Calculate all COGS derived values from user inputs.
 * Returns the full breakdown for display/verification.
 */
export function calculateCogs(input: CogsInput): CogsBreakdown {
    // Standardize input types to prevent NaN issues
    const import_price = Number(input.import_price) || 0;
    const exchange_rate = Number(input.exchange_rate) || 1;
    const custom_duty_pct = Number(input.custom_duty_pct) || 0;
    const gst1_pct = Number(input.gst1_pct) || 0;
    const shipping_cost = Number(input.shipping_cost) || 0;
    const margin1_pct = Number(input.margin1_pct) || 0;
    const marketing_cost = Number(input.marketing_cost) || 0;
    const margin2_pct = Number(input.margin2_pct) || 0;
    const gst2_pct = Number(input.gst2_pct) || 0;
    const platform_fee_pct = Number(input.platform_fee_pct) || 0;

    // Step 1: Convert import price to INR
    const import_price_inr = import_price * exchange_rate;

    // Step 2: Custom duty
    const custom_duty_amt = import_price_inr * (custom_duty_pct / 100);

    // Step 3: GST on import (applied on import_price_inr + custom_duty)
    const gst1_amt = (import_price_inr + custom_duty_amt) * (gst1_pct / 100);

    // Step 4: Landed cost
    const landed_cost = import_price_inr + custom_duty_amt + gst1_amt + shipping_cost;

    // Step 5: JH Margin (margin1)
    const margin1_amt = landed_cost * (margin1_pct / 100);

    // Step 6: Halte cost price (what JH sells to Halte at)
    const halte_cost_price = landed_cost + margin1_amt;

    // Step 7: Halte margin (margin2)
    const margin2_amt = halte_cost_price * (margin2_pct / 100);

    // Step 8: Selling price (Cost to Halte + Marketing + Target Profit)
    const selling_price = halte_cost_price + marketing_cost + margin2_amt;

    // Step 9: GST on selling
    const gst2_amt = selling_price * (gst2_pct / 100);

    // Step 10: MSP (Minimum Selling Price before Amazon fees)
    const msp = selling_price + gst2_amt;

    // Additional calculation: Recommended Price (accounting for GST AND Platform fees)
    // Target Net Realization = Halte Cost + Marketing + Target Margin (selling_price)
    // Formula: R - (R * platform_fee%) - (R * gst2 / (100 + gst2)) = Net Realization
    // R * (1 - platform_fee_pct/100 - gst_fraction) = selling_price
    const gst_fraction = gst2_pct / (100 + gst2_pct);
    const platform_fraction = platform_fee_pct / 100;
    const deduction_factor = 1 - platform_fraction - gst_fraction;

    // Safety check so we don't divide by zero or negative if fees > 100%
    let recommended_price = msp;
    if (deduction_factor > 0) {
        recommended_price = selling_price / deduction_factor;
    }

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
        recommended_price: round2(recommended_price),
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
    platform_fee_pct?: number; // Estimated Amazon referral fee %
    gst2_pct?: number; // GST Output %
}

export interface ProfitabilityResult {
    revenue: number;
    amazon_fee_amt: number;
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
    const revenue = Number(input.invoice_amount) || 0;
    const qty = Number(input.quantity) || 0;
    const halte_cost_price = Number(input.halte_cost_price) || 0;
    const landed_cost = Number(input.landed_cost) || 0;
    const shipment_cost = Number(input.shipment_cost) || 0;
    const platform_fee_pct = Number(input.platform_fee_pct) || 15; // default 15%
    const gst2_pct = Number(input.gst2_pct) || 18; // default 18%

    const total_cogs = halte_cost_price * qty;

    // JH profit: what JH earns by selling to Halte at halte_cost_price vs its landed_cost
    const jh_profit = (halte_cost_price - landed_cost) * qty;
    const jh_revenue = halte_cost_price * qty;

    // Halte profit: Amazon revenue - Amazon fees - GST Output - COGS paid to JH - shipping
    const amazon_fee_amt = revenue * (platform_fee_pct / 100);

    // Output GST is calculated inclusively if revenue is total invoice value
    const gst_output_amt = revenue * (gst2_pct / (100 + gst2_pct));

    const halte_profit = revenue - amazon_fee_amt - gst_output_amt - total_cogs - shipment_cost;
    const total_profit = jh_profit + halte_profit;

    return {
        revenue: round2(revenue),
        amazon_fee_amt: round2(amazon_fee_amt),
        total_cogs: round2(total_cogs),
        jh_profit: round2(jh_profit),
        jh_margin_pct: jh_revenue > 0 ? round2((jh_profit / jh_revenue) * 100) : 0,
        halte_profit: round2(halte_profit),
        halte_margin_pct: revenue > 0 ? round2((halte_profit / revenue) * 100) : 0,
        total_profit: round2(total_profit),
        total_margin_pct: revenue > 0 ? round2((total_profit / revenue) * 100) : 0,
    };
}

function round2(n: number): number {
    if (isNaN(n) || !isFinite(n)) return 0;
    return Math.round(Math.abs(n) * 100) / 100 * Math.sign(n);
}

