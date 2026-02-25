"""Data transformation and processing utilities."""

import logging
from datetime import datetime
from typing import Optional

from dateutil import parser as dateparser

logger = logging.getLogger(__name__)

# Month name mapping
MONTH_NAMES = {
    1: "january", 2: "february", 3: "march", 4: "april",
    5: "may", 6: "june", 7: "july", 8: "august",
    9: "september", 10: "october", 11: "november", 12: "december",
}

MONTH_ABBR = {
    1: "jan", 2: "feb", 3: "mar", 4: "apr",
    5: "may", 6: "jun", 7: "jul", 8: "aug",
    9: "sep", 10: "oct", 11: "nov", 12: "dec",
}


def safe_lowercase(value) -> Optional[str]:
    """Lowercase a value if it's a string, return None for None."""
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        return s.lower() if s else None
    return str(value).lower()


def safe_int(value) -> Optional[int]:
    """Safely convert to integer."""
    if value is None:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def safe_float(value) -> Optional[float]:
    """Safely convert to float."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse a date string into datetime object."""
    if not date_str or date_str.lower() == "none":
        return None
    try:
        return dateparser.parse(str(date_str))
    except (ValueError, TypeError):
        return None


def derive_date_fields(date_str: str) -> dict:
    """Derive all date-related fields from a date string.
    
    Returns dict with: Date, Year, Month_Num, Month_Name, Month_Year,
    Quarter, Quarter_Name, Source (fiscal year).
    All string values are lowercase as per requirement.
    """
    dt = parse_date(date_str)
    if not dt:
        return {
            "Date": None, "Year": None, "Month_Num": None,
            "Month_Name": None, "Month_Year": None,
            "Quarter": None, "Quarter_Name": None, "Source": None,
        }

    month_num = dt.month
    quarter_num = (month_num - 1) // 3 + 1

    # Indian fiscal year: April-March
    # FY2025 = April 2024 - March 2025
    fiscal_year_end = dt.year if dt.month >= 4 else dt.year
    fiscal_year_start = fiscal_year_end if dt.month >= 4 else fiscal_year_end - 1
    source = f"fy{fiscal_year_start + 1}"

    return {
        "Date": dt.strftime("%Y-%m-%d"),
        "Year": dt.year,
        "Month_Num": month_num,
        "Month_Name": MONTH_NAMES[month_num],
        "Month_Year": f"{MONTH_ABBR[month_num]} {dt.year}",
        "Quarter": quarter_num,
        "Quarter_Name": f"q{quarter_num}",
        "Source": source,
    }


def process_excel_row(row: dict) -> dict:
    """Process a single Excel row: keep headers as-is, lowercase all string data values.
    
    Headers maintain their exact case (e.g., "Invoice Number", "BRAND").
    All string data values are converted to lowercase.
    Numeric values are preserved as-is.
    """
    processed = {}
    for key, value in row.items():
        if value is None or (isinstance(value, str) and value.strip().lower() == "none"):
            processed[key] = None
        elif isinstance(value, str):
            processed[key] = value.strip().lower()
        elif isinstance(value, (int, float)):
            processed[key] = value
        else:
            processed[key] = str(value).strip().lower()
    return processed


def transform_sp_api_mtr_row(row: dict, business_type: str, product_catalog: dict) -> dict:
    """Transform an SP-API MTR (Merchant Tax Report) row to our schema.
    
    Maps SP-API report columns to combined2.xlsx column format.
    All string data values are lowercased.
    
    Args:
        row: Raw row from SP-API MTR report
        business_type: 'b2b' or 'b2c'
        product_catalog: ASIN -> {brand, category, segment} mapping
    """
    # Get invoice date for date field derivation
    invoice_date_str = (
        row.get("Invoice Date")
        or row.get("invoice_date")
        or row.get("INVOICE_DATE")
        or ""
    )
    date_fields = derive_date_fields(invoice_date_str)

    # Get ASIN (try multiple possible column names from SP-API)
    asin = (
        row.get("ASIN")
        or row.get("asin")
        or row.get("Asin")
        or ""
    )
    asin_lower = asin.strip().lower() if asin else None

    # Look up product info from catalog
    product_info = product_catalog.get(asin_lower, {})

    # Get SKU
    sku = (
        row.get("SKU")
        or row.get("sku")
        or row.get("Sku")
        or product_info.get("sku")
        or ""
    )

    # Get Order ID (try multiple column names)
    order_id = (
        row.get("Order ID")
        or row.get("Order Id")
        or row.get("order_id")
        or row.get("ORDER_ID")
        or ""
    )

    # Get Invoice Number
    invoice_number = (
        row.get("Invoice Number")
        or row.get("invoice_number")
        or row.get("INVOICE_NUMBER")
        or ""
    )

    # Get Transaction Type
    transaction_type = (
        row.get("Transaction Type")
        or row.get("transaction_type")
        or row.get("TRANSACTION_TYPE")
        or ""
    )

    # Get amounts
    invoice_amount = safe_float(
        row.get("Invoice Amount")
        or row.get("invoice_amount")
        or row.get("INVOICE_AMOUNT")
    )
    principal_amount = safe_float(
        row.get("Tax Exclusive Gross")
        or row.get("Principal Amount")
        or row.get("tax_exclusive_gross")
        or row.get("TAX_EXCLUSIVE_GROSS")
    )

    # Get shipping info
    ship_city = (
        row.get("Ship To City")
        or row.get("Shipping city")
        or row.get("shipping_city")
        or ""
    )
    ship_state = (
        row.get("Ship To State")
        or row.get("Shipping state")
        or row.get("Bill To / Ship To State")
        or row.get("shipping_state")
        or ""
    )
    ship_country = (
        row.get("Ship To Country")
        or row.get("Shipping country")
        or row.get("shipping_country")
        or "in"
    )
    ship_postal = (
        row.get("Ship To Postal Code")
        or row.get("Ship-To Postal Code")
        or row.get("ship_to_postal_code")
        or ""
    )

    # B2B specific fields
    gstid = (
        row.get("Customer Bill To GSTID")
        or row.get("Customer Bill To Gstid")
        or row.get("customer_bill_to_gstid")
        or ""
    )
    buyer_name = (
        row.get("Buyer Name")
        or row.get("Customer Name")
        or row.get("buyer_name")
        or ""
    )

    # Item description
    item_desc = (
        row.get("Item Description")
        or row.get("item_description")
        or row.get("ITEM_DESCRIPTION")
        or product_info.get("item_description")
        or ""
    )

    # Warehouse
    warehouse_id = (
        row.get("Warehouse ID")
        or row.get("Warehouse Id")
        or row.get("warehouse_id")
        or ""
    )

    # Quantity
    quantity = safe_int(
        row.get("Quantity")
        or row.get("quantity")
        or row.get("QUANTITY")
    )

    record = {
        "Date": date_fields["Date"],
        "Year": date_fields["Year"],
        "Month_Num": date_fields["Month_Num"],
        "Month_Name": date_fields["Month_Name"],
        "Month_Year": date_fields["Month_Year"],
        "Quarter": date_fields["Quarter"],
        "Quarter_Name": date_fields["Quarter_Name"],
        "Business": business_type.lower(),
        "Invoice Number": safe_lowercase(invoice_number),
        "Invoice Date": safe_lowercase(invoice_date_str),
        "Transaction Type": safe_lowercase(transaction_type),
        "Order Id": safe_lowercase(order_id),
        "Quantity": quantity,
        "BRAND": product_info.get("brand", safe_lowercase(asin)),
        "Item Description": safe_lowercase(item_desc),
        "Asin": asin_lower,
        "Sku": safe_lowercase(sku),
        "Category": product_info.get("category"),
        "Segment": product_info.get("segment"),
        "Ship To City": safe_lowercase(ship_city),
        "Ship To State": safe_lowercase(ship_state),
        "Ship To Country": safe_lowercase(ship_country),
        "Ship To Postal Code": safe_lowercase(ship_postal),
        "Invoice Amount": invoice_amount,
        "Principal Amount": principal_amount,
        "Warehouse Id": safe_lowercase(warehouse_id) or None,
        "Customer Bill To Gstid": safe_lowercase(gstid) or None,
        "Buyer Name": safe_lowercase(buyer_name) or None,
        "Source": date_fields["Source"],
        "Channel": "amazon",
    }

    return record


def transform_sp_api_orders_row(row: dict, product_catalog: dict) -> dict:
    """Transform an SP-API Orders API row to our schema.
    
    Alternative to MTR reports - uses the Orders API directly.
    """
    purchase_date = row.get("PurchaseDate", "")
    date_fields = derive_date_fields(purchase_date)

    asin = safe_lowercase(row.get("ASIN", ""))
    product_info = product_catalog.get(asin, {})

    # Determine business type from order
    is_business = row.get("IsBusinessOrder", False)
    business_type = "b2b" if is_business else "b2c"

    # Shipping address
    shipping = row.get("ShippingAddress", {}) or {}

    record = {
        "Date": date_fields["Date"],
        "Year": date_fields["Year"],
        "Month_Num": date_fields["Month_Num"],
        "Month_Name": date_fields["Month_Name"],
        "Month_Year": date_fields["Month_Year"],
        "Quarter": date_fields["Quarter"],
        "Quarter_Name": date_fields["Quarter_Name"],
        "Business": business_type,
        "Invoice Number": None,  # Not available from Orders API
        "Invoice Date": safe_lowercase(purchase_date),
        "Transaction Type": safe_lowercase(row.get("OrderStatus", "shipment")),
        "Order Id": safe_lowercase(row.get("AmazonOrderId", "")),
        "Quantity": safe_int(row.get("NumberOfItemsShipped", 0)),
        "BRAND": product_info.get("brand"),
        "Item Description": product_info.get("item_description"),
        "Asin": asin,
        "Sku": safe_lowercase(row.get("SellerSKU", "")) or product_info.get("sku"),
        "Category": product_info.get("category"),
        "Segment": product_info.get("segment"),
        "Ship To City": safe_lowercase(shipping.get("City", "")),
        "Ship To State": safe_lowercase(shipping.get("StateOrRegion", "")),
        "Ship To Country": safe_lowercase(shipping.get("CountryCode", "in")),
        "Ship To Postal Code": safe_lowercase(shipping.get("PostalCode", "")),
        "Invoice Amount": safe_float(row.get("OrderTotal", {}).get("Amount")),
        "Principal Amount": safe_float(row.get("OrderTotal", {}).get("Amount")),
        "Warehouse Id": None,
        "Customer Bill To Gstid": None,
        "Buyer Name": safe_lowercase(row.get("BuyerInfo", {}).get("BuyerName", "")),
        "Source": date_fields["Source"],
        "Channel": "amazon",
    }

    return record
