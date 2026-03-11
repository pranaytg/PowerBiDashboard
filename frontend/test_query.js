require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        console.log("Running marchSales query...");
        const res = await pool.query(`WITH ActiveSkus AS (
               SELECT DISTINCT "Sku"
               FROM sales_data
               WHERE "Date" >= CURRENT_DATE - INTERVAL '6 months'
                 AND "Transaction Type" != 'return'
             )
             SELECT sd."Sku", sd."Warehouse Id", SUM(COALESCE(CAST(sd."Quantity" AS integer), 0)) as total_sales
             FROM sales_data sd
             JOIN ActiveSkus a ON sd."Sku" = a."Sku"
             WHERE sd."Date" >= '2026-03-01' AND sd."Date" < '2026-04-01'
               AND sd."Transaction Type" != 'return'
               AND sd."Warehouse Id" IS NOT NULL
               AND sd."Warehouse Id" != ''
             GROUP BY sd."Sku", sd."Warehouse Id"`);
        console.log("marchSales", res.rows.length);

        console.log("Running inventorySnapshots query...");
        const res2 = await pool.query(`WITH ActiveSkus AS (
               SELECT DISTINCT "Sku"
               FROM sales_data
               WHERE "Date" >= CURRENT_DATE - INTERVAL '6 months'
                 AND "Transaction Type" != 'return'
             )
             SELECT DISTINCT ON (w.sku, w.fulfillment_center_id) 
               w.sku, w.fulfillment_center_id, w.quantity, w.condition, w.snapshot_date
             FROM warehouse_inventory_snapshots w
             JOIN ActiveSkus a ON w.sku = a."Sku"
             WHERE w.snapshot_date >= '2026-03-01'
             ORDER BY w.sku, w.fulfillment_center_id, w.snapshot_date DESC`);
        console.log("inventorySnapshots", res2.rows.length);
    } catch (e) {
        console.error("ERROR", e.message);
    } finally {
        pool.end();
    }
}
run();
