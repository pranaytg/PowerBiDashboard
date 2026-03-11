require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        const { rows: snapshotHistory } = await pool.query(
            `SELECT sku, snapshot_date, fulfillable_quantity, total_quantity
             FROM inventory_snapshots
             WHERE snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
             ORDER BY snapshot_date ASC`
        );
        console.log("Q1 success, rows:", snapshotHistory.length);
    } catch (e) {
        console.error("ERROR running full queries:", e.message);
    } finally {
        pool.end();
    }
}
run();
