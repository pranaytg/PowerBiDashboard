"""Supabase database operations service."""

import logging
import math
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)

# Exact column names matching combined2.xlsx headers (for Power BI compatibility)
SALES_COLUMNS = [
    "Date", "Year", "Month_Num", "Month_Name", "Month_Year",
    "Quarter", "Quarter_Name", "Business", "Invoice Number",
    "Invoice Date", "Transaction Type", "Order Id", "Quantity",
    "BRAND", "Item Description", "Asin", "Sku", "Category",
    "Segment", "Ship To City", "Ship To State", "Ship To Country",
    "Ship To Postal Code", "Invoice Amount", "Principal Amount",
    "Warehouse Id", "Customer Bill To Gstid", "Buyer Name",
    "Source", "Channel",
]

BATCH_SIZE = 500


class SupabaseService:
    """Service for all Supabase database operations."""

    def __init__(self, client: Client):
        self.client = client

    # ---- Sales Data ----

    def get_sales(
        self,
        page: int = 1,
        per_page: int = 1000,
        filters: Optional[dict] = None,
    ) -> dict:
        """Get paginated sales data with optional filters."""
        query = self.client.table("sales_data").select("*", count="exact")

        if filters:
            if filters.get("date_from"):
                query = query.gte("Date", filters["date_from"])
            if filters.get("date_to"):
                query = query.lte("Date", filters["date_to"])
            if filters.get("year"):
                query = query.eq("Year", filters["year"])
            if filters.get("channel"):
                query = query.eq("Channel", filters["channel"])
            if filters.get("business"):
                query = query.eq("Business", filters["business"])
            if filters.get("brand"):
                query = query.eq("BRAND", filters["brand"])
            if filters.get("category"):
                query = query.eq("Category", filters["category"])
            if filters.get("transaction_type"):
                query = query.eq("Transaction Type", filters["transaction_type"])
            if filters.get("source"):
                query = query.eq("Source", filters["source"])
            if filters.get("asin"):
                query = query.eq("Asin", filters["asin"])
            if filters.get("order_id"):
                query = query.eq("Order Id", filters["order_id"])

        offset = (page - 1) * per_page
        query = query.order("id").range(offset, offset + per_page - 1)

        result = query.execute()
        total = result.count if result.count is not None else 0
        total_pages = math.ceil(total / per_page) if per_page > 0 else 0

        return {
            "data": result.data,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    def get_sales_count(self) -> int:
        """Get total count of sales records."""
        result = (
            self.client.table("sales_data")
            .select("id", count="exact")
            .limit(1)
            .execute()
        )
        return result.count if result.count is not None else 0

    def insert_sales_batch(self, records: list[dict]) -> int:
        """Insert sales records in batches. Returns count inserted."""
        total_inserted = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            try:
                result = self.client.table("sales_data").insert(batch).execute()
                total_inserted += len(result.data)
                logger.info(
                    "Inserted batch %d-%d (%d records)",
                    i,
                    i + len(batch),
                    len(result.data),
                )
            except Exception as e:
                logger.error("Error inserting batch %d-%d: %s", i, i + len(batch), e)
                raise
        return total_inserted

    def upsert_sales_batch(self, records: list[dict]) -> tuple[int, int]:
        """Upsert sales records. Returns (inserted, updated) counts."""
        total_inserted = 0
        total_updated = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            try:
                result = (
                    self.client.table("sales_data")
                    .upsert(batch, on_conflict="Order Id,Invoice Number,Asin,Transaction Type")
                    .execute()
                )
                total_inserted += len(result.data)
                logger.info(
                    "Upserted batch %d-%d (%d records)",
                    i,
                    i + len(batch),
                    len(result.data),
                )
            except Exception:
                # Fallback to plain insert if upsert fails (no unique constraint)
                try:
                    result = self.client.table("sales_data").insert(batch).execute()
                    total_inserted += len(result.data)
                except Exception as e2:
                    logger.error("Error in batch %d-%d: %s", i, i + len(batch), e2)
                    raise
        return total_inserted, total_updated

    def truncate_sales(self) -> None:
        """Delete all sales data (for fresh reload)."""
        self.client.table("sales_data").delete().neq("id", 0).execute()
        logger.info("Truncated sales_data table")

    def get_distinct_values(self, column: str) -> list:
        """Get distinct values for a column using RPC function."""
        try:
            result = self.client.rpc(
                "get_distinct_values", {"col_name": column}
            ).execute()
            return result.data if result.data else []
        except Exception as e:
            logger.warning("RPC get_distinct_values failed for %s: %s", column, e)
            # Fallback: fetch with high limit and extract unique values
            quoted_col = f'"{column}"' if " " in column else column
            try:
                result = (
                    self.client.table("sales_data")
                    .select(quoted_col)
                    .limit(50000)
                    .execute()
                )
                values = set()
                for row in result.data:
                    val = row.get(column)
                    if val is not None:
                        values.add(val)
                return sorted(values, key=lambda x: str(x))
            except Exception:
                return []

    # ---- Product Catalog ----

    def get_product_catalog(self) -> dict:
        """Get product catalog as {asin: {brand, category, segment}} mapping."""
        result = self.client.table("product_catalog").select("*").execute()
        catalog = {}
        for row in result.data:
            catalog[row["asin"]] = {
                "brand": row.get("brand"),
                "category": row.get("category"),
                "segment": row.get("segment"),
                "sku": row.get("sku"),
                "item_description": row.get("item_description"),
            }
        return catalog

    def upsert_product_catalog(self, records: list[dict]) -> int:
        """Upsert product catalog entries."""
        total = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            try:
                result = (
                    self.client.table("product_catalog")
                    .upsert(batch, on_conflict="asin")
                    .execute()
                )
                total += len(result.data)
            except Exception as e:
                logger.error("Error upserting product catalog batch: %s", e)
                raise
        return total

    # ---- Refresh Log ----

    def get_last_refresh(self) -> Optional[dict]:
        """Get the most recent refresh log entry."""
        result = (
            self.client.table("refresh_log")
            .select("*")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_last_successful_refresh(self) -> Optional[dict]:
        """Get the most recent successful refresh."""
        result = (
            self.client.table("refresh_log")
            .select("*")
            .eq("status", "completed")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def create_refresh_log(
        self,
        report_type: str,
        date_range_start: str,
        date_range_end: str,
    ) -> dict:
        """Create a new refresh log entry."""
        result = (
            self.client.table("refresh_log")
            .insert(
                {
                    "status": "in_progress",
                    "report_type": report_type,
                    "date_range_start": date_range_start,
                    "date_range_end": date_range_end,
                }
            )
            .execute()
        )
        return result.data[0]

    def update_refresh_log(self, log_id: int, updates: dict) -> dict:
        """Update a refresh log entry."""
        result = (
            self.client.table("refresh_log")
            .update(updates)
            .eq("id", log_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    def get_refresh_history(self, limit: int = 20) -> list[dict]:
        """Get refresh history."""
        result = (
            self.client.table("refresh_log")
            .select("*")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data

    # ---- Finances, Returns, Inventory ----

    def upsert_finances_batch(self, records: list[dict]) -> int:
        total = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            try:
                res = self.client.table("financial_events").upsert(
                    batch, on_conflict="order_id,sku,event_type"
                ).execute()
                total += len(res.data)
            except Exception as e:
                logger.error("Error upserting finances: %s", e)
        return total

    def upsert_returns_batch(self, records: list[dict]) -> int:
        total = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            try:
                res = self.client.table("returns").upsert(
                    batch, on_conflict="order_id,sku,return_date"
                ).execute()
                total += len(res.data)
            except Exception as e:
                logger.error("Error upserting returns: %s", e)
        return total

    def upsert_inventory_snapshots_batch(self, records: list[dict]) -> int:
        total = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            try:
                res = self.client.table("inventory_snapshots").upsert(
                    batch, on_conflict="snapshot_date,sku"
                ).execute()
                total += len(res.data)
            except Exception as e:
                logger.error("Error upserting inventory snapshots: %s", e)
        return total

    def upsert_warehouse_inventory_batch(self, records: list[dict]) -> int:
        total = 0
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            try:
                res = self.client.table("warehouse_inventory_snapshots").upsert(
                    batch, on_conflict="snapshot_date,sku,fulfillment_center_id,condition"
                ).execute()
                total += len(res.data)
            except Exception as e:
                logger.error("Error upserting warehouse inventory: %s", e)
        return total
