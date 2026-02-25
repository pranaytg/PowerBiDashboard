"""Supabase client initialization."""

import logging
from functools import lru_cache

from supabase import create_client, Client

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_supabase_client() -> Client:
    """Get cached Supabase client instance."""
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_key)
    logger.info("Supabase client initialized for %s", settings.supabase_url)
    return client
