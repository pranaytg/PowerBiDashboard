"""Background scheduler for keep-alive pings and daily SP-API refresh.

Uses APScheduler to run:
1. Self-ping every 13 minutes → prevents Render from spinning down the service
2. Daily refresh at 7 PM IST → calls the SP-API refresh endpoint to update data
"""

import logging

import httpx
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")

_scheduler: BackgroundScheduler | None = None


def _self_ping():
    """Ping own health endpoint to keep the Render service alive."""
    settings = get_settings()
    url = f"{settings.self_base_url}/health"
    try:
        r = httpx.get(url, timeout=15.0)
        logger.info("Keep-alive ping → %s (status %d)", url, r.status_code)
    except Exception as e:
        logger.warning("Keep-alive ping failed: %s", e)


def _daily_refresh():
    """Trigger the SP-API data refresh (Orders API, last 2 days)."""
    settings = get_settings()
    url = f"{settings.self_base_url}/api/v1/refresh"
    try:
        r = httpx.post(
            url,
            json={"report_types": ["ORDERS"]},
            timeout=30.0,
        )
        logger.info("Daily refresh triggered → status %d, body: %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.error("Daily refresh trigger failed: %s", e)


def _daily_inventory_snapshot():
    """Trigger a daily FBA inventory snapshot."""
    settings = get_settings()
    url = f"{settings.self_base_url}/api/v1/inventory/sync"
    try:
        r = httpx.post(url, timeout=30.0)
        logger.info("Inventory snapshot triggered → status %d, body: %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.error("Inventory snapshot trigger failed: %s", e)


def start_scheduler():
    """Start the background scheduler with keep-alive and daily refresh jobs."""
    global _scheduler
    if _scheduler is not None:
        return  # Already running

    settings = get_settings()
    _scheduler = BackgroundScheduler(timezone=IST)

    # Job 1: Self-ping every 13 minutes to prevent Render spin-down
    _scheduler.add_job(
        _self_ping,
        trigger=IntervalTrigger(minutes=13),
        id="keep_alive_ping",
        name="Keep-alive self-ping",
        replace_existing=True,
    )

    # Job 2: Daily refresh at configured hour IST (default 7 PM = 19:00)
    _scheduler.add_job(
        _daily_refresh,
        trigger=CronTrigger(hour=settings.refresh_hour_ist, minute=0, timezone=IST),
        id="daily_sp_api_refresh",
        name="Daily SP-API data refresh",
        replace_existing=True,
    )

    # Job 3: Daily inventory snapshot (30 min after order refresh)
    _scheduler.add_job(
        _daily_inventory_snapshot,
        trigger=CronTrigger(hour=settings.refresh_hour_ist, minute=30, timezone=IST),
        id="daily_inventory_snapshot",
        name="Daily FBA inventory snapshot",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started: keep-alive every 13 min, daily refresh at %02d:00 IST, inventory snapshot at %02d:30 IST",
        settings.refresh_hour_ist,
        settings.refresh_hour_ist,
    )


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")
