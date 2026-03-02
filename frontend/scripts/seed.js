const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: "../.env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yquqkoeptxqgfaiatstk.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
    console.error("Missing SUPABASE KEY. Please provide it in env or script.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedData() {
    console.log("Fetching exact count of sales_data...");
    const { count, error: countErr } = await supabase
        .from("sales_data")
        .select("*", { count: "exact", head: true });

    if (countErr) {
        console.error("Error fetching count:", countErr.message);
        return;
    }

    const totalCount = count || 0;
    console.log(`Total sales_data rows: ${totalCount}`);

    console.log("Paginating to fetch ALL SKUs and Order IDs...");
    const allSkus = new Set();
    const allOrders = new Set();

    // Batch fetch all rows in chunks of 1000
    for (let offset = 0; offset < totalCount; offset += 1000) {
        const { data, error } = await supabase
            .from("sales_data")
            .select('"Order Id", Sku')
            .range(offset, offset + 999);

        if (error) {
            console.error("Error fetching chunk:", error.message);
            break;
        }

        if (data && data.length > 0) {
            for (const row of data) {
                if (row.Sku) allSkus.add(row.Sku);
                if (row["Order Id"]) allOrders.add(row["Order Id"]);
            }
        }
    }

    const uniqueSkus = Array.from(allSkus);
    const uniqueOrders = Array.from(allOrders).filter(Boolean);
    console.log(`Found ${uniqueSkus.length} unique SKUs entirely.`);
    console.log(`Found ${uniqueOrders.length} unique Orders entirely.`);

    console.log("Generating random COGS for each SKU...");
    const cogsToInsert = uniqueSkus.map((sku) => {
        const importPrice = Math.floor(Math.random() * 50) + 10;
        const exchangeRate = 85;
        const importPriceInr = importPrice * exchangeRate;
        const customs = importPriceInr * 0.1;
        const gst1 = (importPriceInr + customs) * 0.18;
        const shipping = Math.floor(Math.random() * 50) + 20;
        const landedCost = importPriceInr + customs + gst1 + shipping;
        const margin1Amt = landedCost * 0.15;
        const halteCostPrice = landedCost + margin1Amt;
        const margin2Amt = halteCostPrice * 0.2;
        const sellingPrice = halteCostPrice + 100 + margin2Amt;
        const gst2 = sellingPrice * 0.18;
        const msp = sellingPrice + gst2;

        return {
            sku,
            product_name: `Product ${sku}`,
            import_price: importPrice,
            currency: "USD",
            exchange_rate: exchangeRate,
            import_price_inr: importPriceInr,
            custom_duty_pct: 10,
            custom_duty_amt: customs,
            gst1_pct: 18,
            gst1_amt: gst1,
            shipping_cost: shipping,
            landed_cost: landedCost,
            margin1_pct: 15,
            margin1_amt: margin1Amt,
            halte_cost_price: halteCostPrice,
            marketing_cost: 100,
            margin2_pct: 20,
            margin2_amt: margin2Amt,
            selling_price: sellingPrice,
            gst2_pct: 18,
            gst2_amt: gst2,
            msp: msp,
        };
    });

    console.log("Inserting COGS...");
    for (let i = 0; i < cogsToInsert.length; i += 100) {
        const batch = cogsToInsert.slice(i, i + 100);
        const { error: insErr } = await supabase.from("cogs").upsert(batch, { onConflict: "sku" });
        if (insErr) {
            console.error("Error inserting COGS batch:", insErr.message);
        }
    }

    console.log("Generating random Shipments for each Order...");
    const shipmentsToInsert = uniqueOrders.map((orderId) => {
        return {
            order_id: String(orderId),
            shipping_cost: Math.floor(Math.random() * 100) + 30,
            carrier: "Delhivery",
            tracking_number: `DM-${Math.floor(Math.random() * 1000000)}`,
        };
    });

    console.log("Inserting Shipments...");
    for (let i = 0; i < shipmentsToInsert.length; i += 1000) {
        const batch = shipmentsToInsert.slice(i, i + 1000);
        const { error: insShipErr } = await supabase.from("shipments").upsert(batch, { onConflict: "order_id" });
        if (insShipErr) {
            console.error("Error inserting Shipments batch:", insShipErr.message);
        }
    }

    console.log("Deleting Order Snapshots to force recalculation of the new generic values...");
    const { error: delErr } = await supabase.from("order_cogs_snapshot").delete().neq("order_id", "force_all_delete");

    console.log("Seeding complete! Dashboard should now show accurate data for 30k+ rows.");
}

seedData();
