require("dotenv").config({ path: ".env.local" });
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        const res = await pool.query(`SELECT 1 FROM sales_data WHERE CAST("Date" AS TIMESTAMP) >= NOW() - INTERVAL '6 months' LIMIT 1`);
        console.log("Query success with CAST:", res.rows);
    } catch (e) {
        console.error("ERROR 1:", e.message);
    }

    try {
        const res = await pool.query(`SELECT 1 FROM sales_data WHERE TO_TIMESTAMP("Date", 'YYYY-MM-DD HH24:MI:SS') >= NOW() - INTERVAL '6 months' LIMIT 1`);
        console.log("Query success with TO_TIMESTAMP:", res.rows);
    } catch (e) {
        console.error("ERROR 2:", e.message);
    }

    try {
        const res = await pool.query(`SELECT 1 FROM sales_data WHERE "Date" >= TO_CHAR(NOW() - INTERVAL '6 months', 'YYYY-MM-DD') LIMIT 1`);
        console.log("Query success with TO_CHAR:", res.rows);
    } catch (e) {
        console.error("ERROR 3:", e.message);
    }

    pool.end();
}
run();
