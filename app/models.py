"""Pydantic models for request/response validation."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---- Sales Data ----

class SalesRecord(BaseModel):
    """Single sales record matching combined2.xlsx schema."""
    Date: Optional[str] = None
    Year: Optional[int] = None
    Month_Num: Optional[int] = None
    Month_Name: Optional[str] = None
    Month_Year: Optional[str] = None
    Quarter: Optional[int] = None
    Quarter_Name: Optional[str] = None
    Business: Optional[str] = None
    Invoice_Number: Optional[str] = Field(None, alias="Invoice Number")
    Invoice_Date: Optional[str] = Field(None, alias="Invoice Date")
    Transaction_Type: Optional[str] = Field(None, alias="Transaction Type")
    Order_Id: Optional[str] = Field(None, alias="Order Id")
    Quantity: Optional[int] = None
    BRAND: Optional[str] = None
    Item_Description: Optional[str] = Field(None, alias="Item Description")
    Asin: Optional[str] = None
    Sku: Optional[str] = None
    Category: Optional[str] = None
    Segment: Optional[str] = None
    Ship_To_City: Optional[str] = Field(None, alias="Ship To City")
    Ship_To_State: Optional[str] = Field(None, alias="Ship To State")
    Ship_To_Country: Optional[str] = Field(None, alias="Ship To Country")
    Ship_To_Postal_Code: Optional[str] = Field(None, alias="Ship To Postal Code")
    Invoice_Amount: Optional[float] = Field(None, alias="Invoice Amount")
    Principal_Amount: Optional[float] = Field(None, alias="Principal Amount")
    Warehouse_Id: Optional[str] = Field(None, alias="Warehouse Id")
    Customer_Bill_To_Gstid: Optional[str] = Field(None, alias="Customer Bill To Gstid")
    Buyer_Name: Optional[str] = Field(None, alias="Buyer Name")
    Source: Optional[str] = None
    Channel: Optional[str] = None

    model_config = {"populate_by_name": True}


class SalesResponse(BaseModel):
    """Paginated sales data response."""
    data: list[dict]
    total: int
    page: int
    per_page: int
    total_pages: int


class SalesFilters(BaseModel):
    """Query filters for sales data."""
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    year: Optional[int] = None
    channel: Optional[str] = None
    business: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    transaction_type: Optional[str] = None
    source: Optional[str] = None
    asin: Optional[str] = None
    order_id: Optional[str] = None


# ---- Refresh ----

class RefreshRequest(BaseModel):
    """Request to trigger SP-API data refresh."""
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    report_types: list[str] = Field(
        default=["ORDERS"],
        description="Data source: ORDERS (Orders API, default), B2C, B2B (GST MTR reports)",
    )


class RefreshStatusResponse(BaseModel):
    """Response for refresh status."""
    id: Optional[int] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    status: str
    records_fetched: int = 0
    records_inserted: int = 0
    records_updated: int = 0
    error_message: Optional[str] = None
    report_type: Optional[str] = None
    date_range_start: Optional[str] = None
    date_range_end: Optional[str] = None


class RefreshHistoryResponse(BaseModel):
    """Response for refresh history."""
    data: list[RefreshStatusResponse]
    total: int


# ---- Health ----

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    environment: str
    supabase_connected: bool
    sp_api_configured: bool
    last_refresh: Optional[str] = None
    total_records: int = 0
