import { Pool, QueryResult, QueryResultRow } from "pg";

/**
 * Production-grade PostgreSQL connection pool.
 *
 * Key settings to prevent "connection lost" on Render + Supabase free tier:
 *
 * 1. keepAlive: true          — sends TCP keepalive packets so Supabase doesn't
 *                                kill the connection for being "idle"
 * 2. keepAliveInitialDelayMs  — start keepalive probes after 30s of silence
 * 3. max: 5                   — Supabase free tier allows ~20 connections total;
 *                                the backend uses some, so we cap the frontend low
 * 4. idleTimeoutMillis: 10000 — release idle connections after 10s (instead of 30s)
 *                                so Supabase doesn't kill them first
 * 5. allowExitOnIdle: true    — lets the pool shrink to 0 when idle, preventing
 *                                leaked connections on serverless cold starts
 * 6. pool.on('error')         — catches unexpected disconnections so the pool
 *                                doesn't crash the whole process
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: false },
    // TCP keepalive — prevents Supabase from killing idle connections
    keepAlive: true,
    keepAliveInitialDelayMs: 30_000,
});

// CRITICAL: Without this handler, a dropped connection causes an unhandled
// error that crashes the Node.js process. With this handler, the pool
// silently removes the dead connection and creates a fresh one on next query.
pool.on("error", (err) => {
    console.error("PostgreSQL pool: unexpected error on idle client", err.message);
    // Don't exit — the pool will create a new connection on next query
});

/**
 * Run a parameterized SQL query against the database.
 * Returns the rows and rowCount from the query result.
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
    text: string,
    params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
    const result: QueryResult<T> = await pool.query<T>(text, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

/**
 * Run a query and return the count via a separate COUNT(*) query.
 * Useful for paginated endpoints.
 */
export async function queryWithCount<T extends QueryResultRow = Record<string, unknown>>(
    dataQuery: string,
    countQuery: string,
    params?: unknown[],
    countParams?: unknown[]
): Promise<{ rows: T[]; total: number }> {
    const [dataResult, countResult] = await Promise.all([
        pool.query<T>(dataQuery, params),
        pool.query<{ count: string }>(countQuery, countParams),
    ]);
    return {
        rows: dataResult.rows,
        total: parseInt(countResult.rows[0]?.count || "0"),
    };
}

export default pool;
