"""In-memory TTL cache for FastAPI endpoints.

Uses cachetools for thread-safe, bounded, TTL-expiring caches.
Each cache instance is independent with its own max-size and TTL.
All caches are invalidated together after a data refresh.
"""

import hashlib
import json
import logging
import threading
from typing import Any

from cachetools import TTLCache

from app.config import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Cache instances — created lazily on first access via get_cache()
# ---------------------------------------------------------------------------

_caches: dict[str, TTLCache] = {}

# Default configuration per cache name  (maxsize, ttl_seconds)
_CACHE_DEFAULTS: dict[str, tuple[int, int]] = {
    "sales":     (256, 300),   # 5 min  — paginated sales queries
    "filters":   (32,  600),   # 10 min — filter dropdown values
    "count":     (32,  300),   # 5 min  — record counts
    "catalog":   (8,   900),   # 15 min — product catalog
    "finances":  (64,  600),   # 10 min — financial events
    "returns":   (64,  600),   # 10 min — returns data
    "summary":   (32,  300),   # 5 min  — sales summaries
}


def _get_or_create_cache(name: str) -> TTLCache:
    """Get or create a named cache instance."""
    if name not in _caches:
        with _lock:
            if name not in _caches:
                maxsize, ttl = _CACHE_DEFAULTS.get(name, (64, 300))
                settings = get_settings()
                # Allow env-level override of TTL
                ttl = getattr(settings, f"cache_ttl_{name}", ttl)
                _caches[name] = TTLCache(maxsize=maxsize, ttl=ttl)
                logger.info(
                    "Cache '%s' created (maxsize=%d, ttl=%ds)", name, maxsize, ttl
                )
    return _caches[name]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def make_cache_key(*args: Any, **kwargs: Any) -> str:
    """Create a deterministic cache key from arbitrary arguments."""
    raw = json.dumps({"a": args, "k": kwargs}, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


def cache_get(cache_name: str, key: str) -> Any | None:
    """Retrieve a value from the named cache. Returns None on miss."""
    cache = _get_or_create_cache(cache_name)
    with _lock:
        value = cache.get(key)
    if value is not None:
        logger.debug("Cache HIT  [%s] key=%s", cache_name, key[:12])
    return value


def cache_set(cache_name: str, key: str, value: Any) -> None:
    """Store a value in the named cache."""
    cache = _get_or_create_cache(cache_name)
    with _lock:
        cache[key] = value
    logger.debug("Cache SET  [%s] key=%s", cache_name, key[:12])


def invalidate_cache(cache_name: str) -> int:
    """Clear a single named cache. Returns number of evicted entries."""
    cache = _get_or_create_cache(cache_name)
    with _lock:
        count = len(cache)
        cache.clear()
    logger.info("Cache '%s' invalidated (%d entries cleared)", cache_name, count)
    return count


def invalidate_all() -> dict[str, int]:
    """Clear every cache. Called after data refresh."""
    results = {}
    with _lock:
        for name, cache in _caches.items():
            results[name] = len(cache)
            cache.clear()
    logger.info("All caches invalidated: %s", results)
    return results


def get_cache_stats() -> dict[str, dict]:
    """Return current stats for all caches."""
    stats = {}
    with _lock:
        for name, cache in _caches.items():
            stats[name] = {
                "current_size": len(cache),
                "max_size": cache.maxsize,
                "ttl_seconds": int(cache.ttl),
            }
    return stats
