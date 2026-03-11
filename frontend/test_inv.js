require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const res = await pool.query(`SELECT sku, fulfillable_quantity, snapshot_date FROM inventory_snapshots WHERE sku = 'hm0674' LIMIT 5`);
    console.log('hm0674 inventory:', res.rows);
    const all = await pool.query(`SELECT count(DISTINCT sku) FROM inventory_snapshots`);
    console.log('Unique SKUs with inventory:', all.rows);
    pool.end();
}
run();
