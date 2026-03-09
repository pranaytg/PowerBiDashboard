"""Amazon SP-API integration service.

Uses the Orders API (requires 'Inventory and Order Tracking' role) as the
primary data source.  GST MTR reports are kept as a fallback for when the
'Restricted Tax' role is available.
"""

import io
import csv
import gzip
import time
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# SP-API endpoints
LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
SP_API_BASE_URL = "https://sellingpartnerapi-eu.amazon.com"  # EU region (includes India)

# Report types (kept as fallback – need Restricted Tax role)
REPORT_TYPE_B2C = "GET_GST_MTR_B2C_CUSTOM"
REPORT_TYPE_B2B = "GET_GST_MTR_B2B_CUSTOM"

# Polling config
REPORT_POLL_INTERVAL = 30  # seconds
REPORT_MAX_WAIT = 600  # 10 minutes max

# Orders API pagination
ORDERS_MAX_RESULTS_PER_PAGE = 100


class SPAPIAuthError(Exception):
    """SP-API authentication error."""
    pass


class SPAPIReportError(Exception):
    """SP-API report error."""
    pass


class SPAPIService:
    """Service for Amazon Selling Partner API interactions."""

    def __init__(self):
        self.settings = get_settings()
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None

    @property
    def is_configured(self) -> bool:
        """Check if SP-API credentials are configured."""
        return self.settings.sp_api_configured

    def _get_credentials(self) -> dict:
        """Get SP-API credentials dict (LWA only, AWS no longer needed)."""
        return {
            "refresh_token": self.settings.sp_api_refresh_token,
            "lwa_app_id": self.settings.sp_api_lwa_app_id,
            "lwa_client_secret": self.settings.sp_api_lwa_client_secret,
        }

    def _get_access_token(self) -> str:
        """Get or refresh the LWA access token."""
        if self._access_token and self._token_expiry and datetime.utcnow() < self._token_expiry:
            return self._access_token

        logger.info("Requesting new LWA access token...")
        try:
            response = httpx.post(
                LWA_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.settings.sp_api_refresh_token,
                    "client_id": self.settings.sp_api_lwa_app_id,
                    "client_secret": self.settings.sp_api_lwa_client_secret,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            token_data = response.json()
            self._access_token = token_data["access_token"]
            self._token_expiry = datetime.utcnow() + timedelta(
                seconds=token_data.get("expires_in", 3600) - 60
            )
            logger.info("LWA access token obtained successfully")
            return self._access_token
        except Exception as e:
            logger.error("Failed to get LWA access token: %s", e)
            raise SPAPIAuthError(f"Authentication failed: {e}")

    def _make_request(self, method: str, path: str, **kwargs) -> dict:
        """Make an authenticated SP-API request."""
        token = self._get_access_token()
        headers = {
            "x-amz-access-token": token,
            "Content-Type": "application/json",
            "User-Agent": "QnA-Analytics/1.0",
        }

        url = f"{SP_API_BASE_URL}{path}"
        try:
            response = httpx.request(
                method,
                url,
                headers=headers,
                timeout=60.0,
                **kwargs,
            )

            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(response.headers.get("Retry-After", 2))
                logger.warning("Rate limited, waiting %d seconds...", retry_after)
                time.sleep(retry_after)
                return self._make_request(method, path, **kwargs)

            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "SP-API request failed: %s %s -> %s | Body: %s",
                method, path, e, e.response.text[:500],
            )
            raise SPAPIReportError(f"SP-API request failed: {e}")

    # ------------------------------------------------------------------ #
    #  Orders API  (primary – works with 'Inventory and Order Tracking')
    # ------------------------------------------------------------------ #

    def fetch_orders(
        self,
        start_date: str,
        end_date: str,
        max_pages: int = 50,
    ) -> list[dict]:
        """Fetch orders from the Orders API.

        Args:
            start_date: YYYY-MM-DD
            end_date:   YYYY-MM-DD
            max_pages:  Safety limit on pagination depth

        Returns:
            List of order dicts with order-level info.
        """
        if not self.is_configured:
            raise SPAPIAuthError(
                "SP-API credentials not configured. "
                "Please set SP_API_REFRESH_TOKEN, SP_API_LWA_APP_ID, "
                "and SP_API_LWA_CLIENT_SECRET in .env"
            )

        marketplace = self.settings.sp_api_marketplace_id
        all_orders: list[dict] = []

        from datetime import datetime, timedelta
        
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        now = datetime.utcnow() - timedelta(minutes=5)
        # If the requested end_date is today or in the future, cap it to (now - 5 mins)
        if end_dt.date() >= now.date():
            created_before = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            created_before = f"{end_date}T23:59:59Z"

        params = {
            "MarketplaceIds": marketplace,
            "CreatedAfter": f"{start_date}T00:00:00Z",
            "CreatedBefore": created_before,
            "MaxResultsPerPage": str(ORDERS_MAX_RESULTS_PER_PAGE),
            "OrderStatuses": ["Shipped", "Unshipped", "PartiallyShipped"],
        }

        pages_fetched = 0
        next_token: Optional[str] = None

        while pages_fetched < max_pages:
            if next_token:
                # Subsequent pages use NextToken only
                result = self._make_request(
                    "GET",
                    "/orders/v0/orders",
                    params={"MarketplaceIds": marketplace, "NextToken": next_token},
                )
            else:
                result = self._make_request("GET", "/orders/v0/orders", params=params)

            payload = result.get("payload", {})
            orders = payload.get("Orders", [])
            all_orders.extend(orders)
            pages_fetched += 1

            logger.info(
                "Fetched page %d: %d orders (total so far: %d)",
                pages_fetched, len(orders), len(all_orders),
            )

            next_token = payload.get("NextToken")
            if not next_token or len(orders) == 0:
                break

            # Small delay to avoid rate limiting
            time.sleep(0.5)

        logger.info("Fetched %d total orders across %d pages", len(all_orders), pages_fetched)
        return all_orders

    def fetch_order_items(self, order_id: str) -> list[dict]:
        """Fetch line items for a specific order."""
        result = self._make_request(
            "GET", f"/orders/v0/orders/{order_id}/orderItems"
        )
        payload = result.get("payload", {})
        items = payload.get("OrderItems", [])
        return items

    def fetch_orders_with_items(
        self,
        start_date: str,
        end_date: str,
        max_pages: int = 50,
    ) -> list[dict]:
        """Fetch orders and enrich each with its line items.

        Returns a flat list of dicts – one per order-item combination –
        ready for transformation by the data processor.
        """
        orders = self.fetch_orders(start_date, end_date, max_pages=max_pages)
        flat_records: list[dict] = []

        for idx, order in enumerate(orders):
            order_id = order.get("AmazonOrderId", "")
            try:
                items = self.fetch_order_items(order_id)
            except Exception as e:
                logger.warning("Failed to get items for order %s: %s", order_id, e)
                # Still include order-level data even without items
                flat_records.append(order)
                continue

            for item in items:
                # Merge order-level + item-level data
                merged = {**order, **item}
                flat_records.append(merged)

            # Rate-limit protection
            if (idx + 1) % 20 == 0:
                logger.info("Processed %d / %d orders for items...", idx + 1, len(orders))
                time.sleep(1)
            else:
                time.sleep(0.2)

        logger.info(
            "Fetched %d order-item records from %d orders",
            len(flat_records), len(orders),
        )
        return flat_records

    # ------------------------------------------------------------------ #
    #  Reports API  (fallback – needs Restricted Tax role for GST MTR)
    # ------------------------------------------------------------------ #

    def create_report(
        self,
        report_type: str,
        start_date: str,
        end_date: str,
        marketplace_id: Optional[str] = None,
    ) -> str:
        """Create a report request. Returns reportId."""
        marketplace = marketplace_id or self.settings.sp_api_marketplace_id

        body = {
            "reportType": report_type,
            "marketplaceIds": [marketplace],
            "dataStartTime": f"{start_date}T00:00:00Z",
            "dataEndTime": f"{end_date}T23:59:59Z",
        }

        result = self._make_request("POST", "/reports/2021-06-30/reports", json=body)
        report_id = result.get("reportId")
        logger.info("Created report %s (type=%s, %s to %s)", report_id, report_type, start_date, end_date)
        return report_id

    def get_report_status(self, report_id: str) -> dict:
        """Get report status."""
        return self._make_request("GET", f"/reports/2021-06-30/reports/{report_id}")

    def wait_for_report(self, report_id: str) -> str:
        """Poll until report is done. Returns reportDocumentId."""
        start = time.time()
        while time.time() - start < REPORT_MAX_WAIT:
            status = self.get_report_status(report_id)
            processing_status = status.get("processingStatus")

            if processing_status == "DONE":
                doc_id = status.get("reportDocumentId")
                logger.info("Report %s completed. Document: %s", report_id, doc_id)
                return doc_id
            elif processing_status in ("CANCELLED", "FATAL"):
                raise SPAPIReportError(
                    f"Report {report_id} failed with status: {processing_status}"
                )
            else:
                logger.info("Report %s status: %s, waiting...", report_id, processing_status)
                time.sleep(REPORT_POLL_INTERVAL)

        raise SPAPIReportError(f"Report {report_id} timed out after {REPORT_MAX_WAIT}s")

    def download_report(self, report_document_id: str) -> list[dict]:
        """Download and parse a report document. Returns list of row dicts."""
        doc_info = self._make_request(
            "GET",
            f"/reports/2021-06-30/documents/{report_document_id}",
        )

        download_url = doc_info.get("url")
        compression = doc_info.get("compressionAlgorithm")

        logger.info("Downloading report document from %s...", download_url[:80])

        response = httpx.get(download_url, timeout=120.0)
        response.raise_for_status()

        content = response.content
        if compression == "GZIP":
            content = gzip.decompress(content)

        text = content.decode("utf-8")
        rows = []

        reader = csv.DictReader(io.StringIO(text), delimiter="\t")
        for row in reader:
            rows.append(dict(row))

        logger.info("Downloaded %d rows from report document", len(rows))
        return rows

    def fetch_report_data(
        self,
        report_type: str,
        start_date: str,
        end_date: str,
    ) -> list[dict]:
        """Full flow: create report -> wait -> download -> return data."""
        if not self.is_configured:
            raise SPAPIAuthError(
                "SP-API credentials not configured. "
                "Please set SP_API_REFRESH_TOKEN, SP_API_LWA_APP_ID, "
                "and SP_API_LWA_CLIENT_SECRET in .env"
            )

        report_id = self.create_report(report_type, start_date, end_date)
        doc_id = self.wait_for_report(report_id)
        data = self.download_report(doc_id)
        return data

    # ------------------------------------------------------------------ #
    #  Catalog Items API  (product metadata, images, titles)
    # ------------------------------------------------------------------ #

    def fetch_catalog_item(self, asin: str) -> dict:
        """Fetch catalog info for a single ASIN.

        Returns dict with: asin, title, brand, image_url, category, etc.
        """
        marketplace = self.settings.sp_api_marketplace_id
        params = {
            "marketplaceIds": marketplace,
            "includedData": "attributes,images,summaries",
        }
        try:
            result = self._make_request(
                "GET",
                f"/catalog/2022-04-01/items/{asin}",
                params=params,
            )
            item = {}
            item["asin"] = result.get("asin", asin)

            # Extract title + brand from summaries
            summaries = result.get("summaries", [])
            if summaries:
                s = summaries[0]
                item["title"] = s.get("itemName", "")
                item["brand"] = s.get("brand", "")
                item["color"] = s.get("color", "")
                item["size"] = s.get("size", "")
                item["classification"] = (
                    s.get("classificationNode", {}).get("displayName", "")
                )

            # Extract main image
            images = result.get("images", [])
            if images:
                img_list = images[0].get("images", [])
                for img in img_list:
                    if img.get("variant") == "MAIN":
                        item["image_url"] = img.get("link", "")
                        break
                if not item.get("image_url") and img_list:
                    item["image_url"] = img_list[0].get("link", "")

            return item
        except Exception as e:
            logger.warning("Catalog fetch failed for ASIN %s: %s", asin, e)
            return {"asin": asin, "error": str(e)}

    def fetch_catalog_batch(self, asins: list[str]) -> list[dict]:
        """Fetch catalog info for a batch of ASINs (with rate limiting)."""
        results = []
        for i, asin in enumerate(asins):
            if i > 0 and i % 5 == 0:
                time.sleep(1)  # Rate limit: ~5 req/sec
            item = self.fetch_catalog_item(asin)
            if "error" not in item:
                results.append(item)
        logger.info("Fetched catalog data for %d/%d ASINs", len(results), len(asins))
        return results

    # ------------------------------------------------------------------ #
    #  Finances API  (fees, settlements, refunds)
    # ------------------------------------------------------------------ #

    def fetch_financial_events(
        self,
        start_date: str,
        end_date: str,
        max_pages: int = 20,
    ) -> list[dict]:
        """Fetch financial event groups from the Finances API.

        Returns a flat list of shipment-level financial events with fee breakdowns.
        """
        params = {
            "PostedAfter": f"{start_date}T00:00:00Z",
            "PostedBefore": f"{end_date}T23:59:59Z",
            "MaxResultsPerPage": 100,
        }
        all_events = []
        next_token = None

        for page in range(max_pages):
            if next_token:
                params["NextToken"] = next_token

            result = self._make_request(
                "GET",
                "/finances/v0/financialEvents",
                params=params,
            )
            payload = result.get("payload", {})
            events = payload.get("FinancialEvents", {})

            # Extract shipment events (order-level fees)
            for group in events.get("ShipmentEventList", []):
                order_id = group.get("AmazonOrderId", "")
                posted = group.get("PostedDate", "")
                for item in group.get("ShipmentItemList", []):
                    event = {
                        "order_id": order_id,
                        "posted_date": posted,
                        "sku": item.get("SellerSKU", ""),
                        "asin": item.get("ASIN", ""),
                        "quantity": item.get("QuantityShipped", 0),
                        "event_type": "Shipment",
                    }
                    # Item charges (principal, tax, etc.)
                    total_charge = 0
                    for charge in item.get("ItemChargeList", []):
                        amt = charge.get("ChargeAmount", {})
                        val = float(amt.get("CurrencyAmount", 0))
                        event[f"charge_{charge.get('ChargeType', 'other')}"] = val
                        total_charge += val
                    event["total_charges"] = total_charge

                    # Item fees (commission, FBA fees, etc.)
                    total_fee = 0
                    for fee in item.get("ItemFeeList", []):
                        amt = fee.get("FeeAmount", {})
                        val = float(amt.get("CurrencyAmount", 0))
                        event[f"fee_{fee.get('FeeType', 'other')}"] = val
                        total_fee += val
                    event["total_fees"] = total_fee
                    event["net_amount"] = total_charge + total_fee

                    all_events.append(event)

            # Extract refund events
            for group in events.get("RefundEventList", []):
                order_id = group.get("AmazonOrderId", "")
                posted = group.get("PostedDate", "")
                for item in group.get("ShipmentItemAdjustmentList", []):
                    event = {
                        "order_id": order_id,
                        "posted_date": posted,
                        "sku": item.get("SellerSKU", ""),
                        "asin": item.get("ASIN", ""),
                        "quantity": item.get("QuantityShipped", 0),
                        "event_type": "Refund",
                    }
                    total_adj = 0
                    for charge in item.get("ItemChargeAdjustmentList", []):
                        amt = charge.get("ChargeAmount", {})
                        val = float(amt.get("CurrencyAmount", 0))
                        event[f"charge_{charge.get('ChargeType', 'other')}"] = val
                        total_adj += val
                    for fee in item.get("ItemFeeAdjustmentList", []):
                        amt = fee.get("FeeAmount", {})
                        val = float(amt.get("CurrencyAmount", 0))
                        event[f"fee_{fee.get('FeeType', 'other')}"] = val
                        total_adj += val
                    event["net_amount"] = total_adj
                    all_events.append(event)

            next_token = payload.get("NextToken")
            if not next_token:
                break

        logger.info("Fetched %d financial events for %s to %s", len(all_events), start_date, end_date)
        return all_events

    # ------------------------------------------------------------------ #
    #  Returns Report  (FBA returns via report API)
    # ------------------------------------------------------------------ #

    def fetch_returns_report(
        self,
        start_date: str,
        end_date: str,
    ) -> list[dict]:
        """Fetch FBA returns report data.

        Uses GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA report type.
        Returns list of return records.
        """
        report_type = "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA"
        try:
            data = self.fetch_report_data(report_type, start_date, end_date)
            logger.info("Fetched %d returns records for %s to %s", len(data), start_date, end_date)
            return data
        except Exception as e:
            logger.error("Returns report fetch failed: %s", e)
            raise

    # ------------------------------------------------------------------ #
    #  FBA Inventory Report  (daily stock snapshot)
    # ------------------------------------------------------------------ #

    def fetch_inventory_report(self) -> list[dict]:
        """Fetch current FBA inventory levels via the Reports API.

        Uses GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA report type.
        This is a tab-delimited flat file containing current FBA stock
        levels per SKU including fulfillable, inbound, reserved, and
        unfulfillable quantities.

        Returns:
            List of inventory row dicts, one per SKU/FNSKU.
        """
        if not self.is_configured:
            raise SPAPIAuthError(
                "SP-API credentials not configured. "
                "Please set SP_API_REFRESH_TOKEN, SP_API_LWA_APP_ID, "
                "and SP_API_LWA_CLIENT_SECRET in .env"
            )

        report_type = "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA"
        marketplace = self.settings.sp_api_marketplace_id

        # This report doesn't use date range — it returns current snapshot
        body = {
            "reportType": report_type,
            "marketplaceIds": [marketplace],
        }

        try:
            # Create the report
            result = self._make_request("POST", "/reports/2021-06-30/reports", json=body)
            report_id = result.get("reportId")
            logger.info("Created inventory report %s", report_id)

            # Wait for it to complete
            doc_id = self.wait_for_report(report_id)

            # Download and parse
            raw_rows = self.download_report(doc_id)

            # Normalize the column names (they vary slightly)
            inventory_rows = []
            for row in raw_rows:
                inv = {
                    "sku": row.get("sku", row.get("seller-sku", "")),
                    "fnsku": row.get("fnsku", ""),
                    "asin": row.get("asin", ""),
                    "product_name": row.get("product-name", row.get("product_name", "")),
                    "fulfillable_quantity": self._safe_int(
                        row.get("afn-fulfillable-quantity", row.get("Fulfillable Quantity", 0))
                    ),
                    "inbound_quantity": (
                        self._safe_int(row.get("afn-inbound-working-quantity", 0))
                        + self._safe_int(row.get("afn-inbound-shipped-quantity", 0))
                        + self._safe_int(row.get("afn-inbound-receiving-quantity", 0))
                    ),
                    "reserved_quantity": self._safe_int(
                        row.get("afn-reserved-quantity", row.get("Reserved Quantity", 0))
                    ),
                    "unfulfillable_quantity": self._safe_int(
                        row.get("afn-unsellable-quantity", row.get("Unfulfillable Quantity", 0))
                    ),
                }
                inv["total_quantity"] = (
                    inv["fulfillable_quantity"]
                    + inv["inbound_quantity"]
                    + inv["reserved_quantity"]
                    + inv["unfulfillable_quantity"]
                )
                if inv["sku"]:  # skip rows without SKU
                    inventory_rows.append(inv)

            logger.info("Fetched inventory snapshot: %d SKUs", len(inventory_rows))
            return inventory_rows

        except Exception as e:
            logger.error("Inventory report fetch failed: %s", e)
            raise

    @staticmethod
    def _safe_int(value) -> int:
        """Safely convert a value to int, defaulting to 0."""
        try:
            return int(value or 0)
        except (ValueError, TypeError):
            return 0

