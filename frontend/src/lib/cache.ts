/**
 * In-memory TTL cache for Next.js API routes (Node.js runtime).
 *
 * Provides a simple Map-based cache with per-entry TTL expiration and
 * bounded size with LRU-style eviction. Also exports helpers for
 * HTTP Cache-Control headers.
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number; // epoch ms
}

const MAX_CACHE_SIZE = 256;

const store = new Map<string, CacheEntry<unknown>>();

/** Remove all expired entries (lazy sweep). */
function sweep(): void {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) {
            store.delete(key);
        }
    }
}

/**
 * Get a cached value by key. Returns `undefined` on miss or expiry.
 */
export function cacheGet<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value as T;
}

/**
 * Store a value in the cache with a given TTL (milliseconds).
 * If the cache is at capacity, the oldest entry is evicted first.
 */
export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
    // Evict oldest if at capacity
    if (store.size >= MAX_CACHE_SIZE && !store.has(key)) {
        sweep(); // first try to clear expired
        if (store.size >= MAX_CACHE_SIZE) {
            // Evict the first (oldest) entry
            const firstKey = store.keys().next().value;
            if (firstKey !== undefined) {
                store.delete(firstKey);
            }
        }
    }
    store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

/**
 * Invalidate a single cache entry.
 */
export function cacheInvalidate(key: string): void {
    store.delete(key);
}

/**
 * Invalidate all cache entries.
 */
export function cacheInvalidateAll(): void {
    store.clear();
}

/**
 * Build a deterministic cache key from a URL's search params.
 */
export function makeCacheKey(prefix: string, params: URLSearchParams): string {
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    return `${prefix}:${sorted.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

/**
 * Return standard Cache-Control headers for API responses.
 *
 * @param maxAge  — browser + CDN cache duration in seconds
 * @param staleWhileRevalidate — serve stale while refetching (seconds)
 */
export function getCacheHeaders(
    maxAge: number,
    staleWhileRevalidate: number = 30
): Record<string, string> {
    return {
        "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
        "CDN-Cache-Control": `public, max-age=${maxAge}`,
    };
}
