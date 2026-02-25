"""
Upload combined2.xlsx data to Supabase.

This script:
1. Reads combined2.xlsx
2. Converts all string data values to lowercase (headers maintain original case)
3. Extracts product catalog (ASIN -> BRAND, Category, Segment mapping)
4. Uploads data to Supabase sales_data table in batches
5. Uploads product catalog to product_catalog table

Usage:
    python -m scripts.upload_excel
    python -m scripts.upload_excel --truncate    # Clear existing data first
    python -m scripts.upload_excel --file path/to/file.xlsx
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---- Constants ----

BATCH_SIZE = 500

# Column names matching combined2.xlsx headers exactly
EXCEL_COLUMNS = [
    "Date", "Year", "Month_Num", "Month_Name", "Month_Year",
    "Quarter", "Quarter_Name", "Business", "Invoice Number",
    "Invoice Date", "Transaction Type", "Order Id", "Quantity",
    "BRAND", "Item Description", "Asin", "Sku", "Category",
    "Segment", "Ship To City", "Ship To State", "Ship To Country",
    "Ship To Postal Code", "Invoice Amount", "Principal Amount",
    "Warehouse Id", "Customer Bill To Gstid", "Buyer Name",
    "Source", "Channel",
]


def get_supabase_client():
    """Create Supabase client from env vars."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)
    return create_client(url, key)


def read_excel(file_path: str) -> pd.DataFrame:
    """Read the Excel file and return a DataFrame."""
    logger.info("Reading Excel file: %s", file_path)
    df = pd.read_excel(file_path, sheet_name="Combined Data", engine="openpyxl")
    logger.info("Read %d rows, %d columns", len(df), len(df.columns))
    logger.info("Columns: %s", list(df.columns))
    return df


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Process DataFrame: lowercase all string data values, keep headers as-is."""
    logger.info("Processing data - lowercasing all string values...")

    # Ensure column names match expected headers
    df.columns = [str(c).strip() for c in df.columns]

    for col in df.columns:
        if df[col].dtype == object:  # String columns
            df[col] = df[col].apply(
                lambda x: str(x).strip().lower()
                if pd.notna(x) and str(x).strip().lower() != "none"
                else None
            )

    # Convert numeric columns properly
    numeric_cols = ["Year", "Month_Num", "Quarter", "Quantity", "Invoice Amount", "Principal Amount"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Ship To Postal Code should be string
    if "Ship To Postal Code" in df.columns:
        df["Ship To Postal Code"] = df["Ship To Postal Code"].apply(
            lambda x: str(int(x)) if pd.notna(x) and x != "" else None
        )

    # Replace NaN with None for JSON compatibility
    df = df.where(pd.notna(df), None)

    logger.info("Data processing complete")
    return df


def extract_product_catalog(df: pd.DataFrame) -> list[dict]:
    """Extract unique ASIN -> (BRAND, Category, Segment, SKU, Item Description) mapping."""
    logger.info("Extracting product catalog...")

    catalog_df = df[["Asin", "Sku", "BRAND", "Item Description", "Category", "Segment"]].copy()
    catalog_df = catalog_df.dropna(subset=["Asin"])
    catalog_df = catalog_df.drop_duplicates(subset=["Asin"], keep="first")

    catalog = []
    for _, row in catalog_df.iterrows():
        entry = {
            "asin": row["Asin"],
            "sku": row["Sku"],
            "brand": row["BRAND"],
            "item_description": row["Item Description"],
            "category": row["Category"],
            "segment": row["Segment"],
        }
        catalog.append(entry)

    logger.info("Extracted %d unique product entries", len(catalog))
    return catalog


def upload_sales_data(client, df: pd.DataFrame, truncate: bool = False):
    """Upload sales data to Supabase in batches."""
    if truncate:
        logger.info("Truncating existing sales data...")
        try:
            client.table("sales_data").delete().neq("id", 0).execute()
            logger.info("Truncated sales_data table")
        except Exception as e:
            logger.warning("Truncate failed (table may not exist): %s", e)

    # Convert DataFrame to list of dicts
    records = df.to_dict(orient="records")

    # Clean records - remove any keys not in EXCEL_COLUMNS
    clean_records = []
    int_columns = {"Year", "Month_Num", "Quarter", "Quantity"}
    float_columns = {"Invoice Amount", "Principal Amount"}
    
    for record in records:
        clean = {}
        for col in EXCEL_COLUMNS:
            val = record.get(col)
            # Convert numpy types to Python native types
            if val is not None:
                if hasattr(val, "item"):  # numpy scalar
                    val = val.item()
                # Check for NaN
                try:
                    if isinstance(val, float) and (val != val):  # NaN check
                        val = None
                except (TypeError, ValueError):
                    pass
                # Force integer columns to int
                if col in int_columns and val is not None:
                    try:
                        val = int(float(val))
                    except (ValueError, TypeError):
                        val = None
                # Force float columns to float
                elif col in float_columns and val is not None:
                    try:
                        fval = float(val)
                        if fval != fval:  # NaN check
                            val = None
                        else:
                            val = fval
                    except (ValueError, TypeError):
                        val = None
            clean[col] = val
        clean_records.append(clean)

    total = len(clean_records)
    total_inserted = 0

    logger.info("Uploading %d records to sales_data...", total)

    for i in range(0, total, BATCH_SIZE):
        batch = clean_records[i : i + BATCH_SIZE]
        try:
            result = client.table("sales_data").insert(batch).execute()
            batch_count = len(result.data)
            total_inserted += batch_count
            progress = min(i + BATCH_SIZE, total)
            logger.info(
                "Progress: %d/%d (%.1f%%) - Batch inserted %d records",
                progress,
                total,
                progress / total * 100,
                batch_count,
            )
        except Exception as e:
            logger.error("Error uploading batch %d-%d: %s", i, i + BATCH_SIZE, e)
            logger.error("First record in failed batch: %s", batch[0] if batch else "empty")
            raise

    logger.info("Upload complete: %d/%d records inserted", total_inserted, total)
    return total_inserted


def upload_product_catalog(client, catalog: list[dict]):
    """Upload product catalog to Supabase."""
    logger.info("Uploading %d product catalog entries...", len(catalog))

    total_upserted = 0
    for i in range(0, len(catalog), BATCH_SIZE):
        batch = catalog[i : i + BATCH_SIZE]
        try:
            result = (
                client.table("product_catalog")
                .upsert(batch, on_conflict="asin")
                .execute()
            )
            total_upserted += len(result.data)
        except Exception as e:
            logger.error("Error uploading product catalog batch: %s", e)
            raise

    logger.info("Product catalog upload complete: %d entries", total_upserted)
    return total_upserted


def main():
    parser = argparse.ArgumentParser(description="Upload combined2.xlsx to Supabase")
    parser.add_argument(
        "--file",
        default="combined2.xlsx",
        help="Path to the Excel file (default: combined2.xlsx)",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Delete existing data before upload",
    )
    parser.add_argument(
        "--skip-catalog",
        action="store_true",
        help="Skip product catalog upload",
    )
    args = parser.parse_args()

    # Resolve file path
    file_path = Path(args.file)
    if not file_path.is_absolute():
        file_path = Path(__file__).resolve().parent.parent / file_path
    
    if not file_path.exists():
        logger.error("File not found: %s", file_path)
        sys.exit(1)

    # Connect to Supabase
    logger.info("Connecting to Supabase...")
    client = get_supabase_client()
    logger.info("Connected to Supabase")

    # Read and process Excel
    df = read_excel(str(file_path))
    df = process_dataframe(df)

    # Upload product catalog
    if not args.skip_catalog:
        catalog = extract_product_catalog(df)
        upload_product_catalog(client, catalog)

    # Upload sales data
    total = upload_sales_data(client, df, truncate=args.truncate)

    logger.info("=" * 60)
    logger.info("UPLOAD COMPLETE")
    logger.info("Total records uploaded: %d", total)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
