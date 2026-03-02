import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const client = new Client({
    connectionString: 'postgresql://postgres:RamanSir1234%40@db.yquqkoeptxqgfaiatstk.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to Supabase!");
        const sql = fs.readFileSync(path.join(process.cwd(), '../scripts/cogs_migration.sql'), 'utf8');
        await client.query(sql);
        console.log("Migration executed successfully!");

        // verify
        const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        console.log("Tables:", res.rows.map(r => r.table_name).filter(t => ['cogs', 'shipments', 'sales_data'].includes(t)));

    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        await client.end();
    }
}

run();
