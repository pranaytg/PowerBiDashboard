"""Amazon SP-API integration service."""

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
SP_API_BASE_URL = "https://sellingpartnerapi-fe.amazon.com"  # Far East (India)

# Report types for Indian marketplace MTR
REPORT_TYPE_B2C = "GET_GST_MTR_B2C_CUSTOM"
REPORT_TYPE_B2B = "GET_GST_MTR_B2B_CUSTOM"

# Polling config
REPORT_POLL_INTERVAL = 30  # seconds
REPORT_MAX_WAIT = 600  # 10 minutes max


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
        """Get SP-API credentials dict."""
        return {
            "refresh_token": self.settings.sp_api_refresh_token,
            "lwa_app_id": self.settings.sp_api_lwa_app_id,
            "lwa_client_secret": self.settings.sp_api_lwa_client_secret,
            "aws_access_key": self.settings.sp_api_aws_access_key,
            "aws_secret_key": self.settings.sp_api_aws_secret_key,
            "role_arn": self.settings.sp_api_role_arn,
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
            logger.error("SP-API request failed: %s %s -> %s", method, path, e)
            raise SPAPIReportError(f"SP-API request failed: {e}")

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
        # Get the download URL
        doc_info = self._make_request(
            "GET",
            f"/reports/2021-06-30/documents/{report_document_id}",
        )

        download_url = doc_info.get("url")
        compression = doc_info.get("compressionAlgorithm")

        logger.info("Downloading report document from %s...", download_url[:80])

        # Download the report
        response = httpx.get(download_url, timeout=120.0)
        response.raise_for_status()

        # Decompress if needed
        content = response.content
        if compression == "GZIP":
            content = gzip.decompress(content)

        # Parse TSV/CSV content
        text = content.decode("utf-8")
        rows = []

        # SP-API reports are typically tab-separated
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

    def fetch_b2c_data(self, start_date: str, end_date: str) -> list[dict]:
        """Fetch B2C MTR report data."""
        return self.fetch_report_data(REPORT_TYPE_B2C, start_date, end_date)

    def fetch_b2b_data(self, start_date: str, end_date: str) -> list[dict]:
        """Fetch B2B MTR report data."""
        return self.fetch_report_data(REPORT_TYPE_B2B, start_date, end_date)

    def fetch_all_data(
        self,
        start_date: str,
        end_date: str,
        report_types: list[str] = None,
    ) -> dict:
        """Fetch data for specified report types.
        
        Returns: {"b2c": [...], "b2b": [...]}
        """
        if report_types is None:
            report_types = ["B2C", "B2B"]

        results = {}

        if "B2C" in report_types:
            try:
                results["b2c"] = self.fetch_b2c_data(start_date, end_date)
                logger.info("Fetched %d B2C records", len(results["b2c"]))
            except Exception as e:
                logger.error("Failed to fetch B2C data: %s", e)
                results["b2c_error"] = str(e)

        if "B2B" in report_types:
            try:
                results["b2b"] = self.fetch_b2b_data(start_date, end_date)
                logger.info("Fetched %d B2B records", len(results["b2b"]))
            except Exception as e:
                logger.error("Failed to fetch B2B data: %s", e)
                results["b2b_error"] = str(e)

        return results
