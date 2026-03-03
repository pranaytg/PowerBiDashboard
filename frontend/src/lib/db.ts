import { Pool, QueryResult, QueryResultRow } from "pg";

// Single pool instance reused across all API routes
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
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
