"""
Comprehensive data cleaning, validation, and upload script for combined2.xlsx -> Supabase.
- Cleans state names (fixes misspellings, abbreviations, address-in-state)
- Lowercases all row data (headers stay as-is)
- Validates every row & column
- Ensures Power BI-friendly types
- Truncates tables then re-uploads
"""
import os, sys, re, math, json, time
import pandas as pd
import numpy as np
from datetime import datetime

# -- paths --
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
EXCEL_PATH = os.path.join(ROOT_DIR, "combined2.xlsx")

sys.path.insert(0, ROOT_DIR)
from dotenv import load_dotenv
load_dotenv(os.path.join(ROOT_DIR, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# ===========================================================================
# 1. ACTUAL EXCEL / DB COLUMNS (must match exactly)
# ===========================================================================
COLUMNS = [
    "Date", "Year", "Month_Num", "Month_Name", "Month_Year",
    "Quarter", "Quarter_Name", "Business", "Invoice Number", "Invoice Date",
    "Transaction Type", "Order Id", "Quantity", "BRAND", "Item Description",
    "Asin", "Sku", "Category", "Segment",
    "Ship To City", "Ship To State", "Ship To Country", "Ship To Postal Code",
    "Invoice Amount", "Principal Amount",
    "Warehouse Id", "Customer Bill To Gstid", "Buyer Name",
    "Source", "Channel",
]

# Type specs per column for Power BI compatibility
COL_TYPES = {
    "Date": "date",
    "Year": "int",
    "Month_Num": "int",
    "Quarter": "int",
    "Invoice Date": "date",
    "Quantity": "int",
    "Invoice Amount": "float",
    "Principal Amount": "float",
    "Ship To Postal Code": "postal",
    "Ship To State": "state",
    # everything else -> "str" (lowercased)
}

# ===========================================================================
# 2. INDIAN STATE / UT CANONICAL LIST
# ===========================================================================
VALID_STATES = {
    "andaman and nicobar islands", "andhra pradesh", "arunachal pradesh", "assam",
    "bihar", "chandigarh", "chhattisgarh",
    "dadra and nagar haveli and daman and diu",
    "delhi", "goa", "gujarat", "haryana", "himachal pradesh",
    "jammu and kashmir", "jharkhand", "karnataka", "kerala", "ladakh",
    "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
    "nagaland", "odisha", "puducherry", "punjab", "rajasthan", "sikkim",
    "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
    "west bengal",
}

# ===========================================================================
# 3. EXPLICIT MAPPING  (dirty_lower -> canonical)
# ===========================================================================
STATE_MAP = {
    # -- misspellings / variants --
    "gujrat": "gujarat",
    "orrissa": "odisha", "orissa": "odisha",
    "chattisgarh": "chhattisgarh", "chhatisgarh": "chhattisgarh",
    "uttrakhand": "uttarakhand", "uttaranchal": "uttarakhand",
    # -- abbreviations --
    "mp": "madhya pradesh", "rj": "rajasthan",  "up": "uttar pradesh",
    "hp": "himachal pradesh", "jk": "jammu and kashmir", "j&k": "jammu and kashmir",
    "ap": "andhra pradesh",  "tn": "tamil nadu",  "wb": "west bengal",
    "ka": "karnataka", "dl": "delhi", "mh": "maharashtra",
    "pb": "punjab", "hr": "haryana", "uk": "uttarakhand",
    "ga": "goa", "br": "bihar", "jh": "jharkhand", "cg": "chhattisgarh",
    "gj": "gujarat", "kl": "kerala", "ts": "telangana", "od": "odisha",
    "sk": "sikkim", "mn": "manipur", "ml": "meghalaya", "mz": "mizoram",
    "nl": "nagaland", "tr": "tripura", "ar": "arunachal pradesh",
    "as": "assam", "py": "puducherry", "la": "ladakh",
    "an": "andaman and nicobar islands",
    # -- alternate names --
    "new delhi": "delhi", "nct of delhi": "delhi", "nct": "delhi",
    "andaman & nicobar islands": "andaman and nicobar islands",
    "andaman and nicobar island": "andaman and nicobar islands",
    "andaman nicobar": "andaman and nicobar islands",
    "andhra pradesh (new)": "andhra pradesh",
    "jammu & kashmir": "jammu and kashmir",
    "jammu & kashmir,": "jammu and kashmir",
    "jammu": "jammu and kashmir",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
    "pondicherry": "puducherry",
    # -- city names that appear as state --
    "noida": "uttar pradesh", "panchkula": "haryana",
    "bangalore": "karnataka", "bengaluru": "karnataka",
    "mumbai": "maharashtra", "hyderabad": "telangana",
    "chennai": "tamil nadu", "kolkata": "west bengal",
    "lucknow": "uttar pradesh", "jaipur": "rajasthan",
    "bhopal": "madhya pradesh", "patna": "bihar",
    "ranchi": "jharkhand", "shimla": "himachal pradesh",
    "dehradun": "uttarakhand", "chandigarh": "chandigarh",
    "thiruvananthapuram": "kerala", "kochi": "kerala",
    "gurgaon": "haryana", "gurugram": "haryana",
    "faridabad": "haryana", "meerut": "uttar pradesh",
    "agra": "uttar pradesh", "nagpur": "maharashtra",
    "pune": "maharashtra", "surat": "gujarat",
    "ahmedabad": "gujarat", "visakhapatnam": "andhra pradesh",
    "manimajra": "chandigarh",
    "sas nagar": "punjab",
}

# Build regex to extract state from address strings (longest first)
_state_names_for_regex = sorted(
    list(VALID_STATES | set(STATE_MAP.keys())),
    key=len, reverse=True,
)
_STATE_EXTRACT_RE = re.compile(
    r'(' + '|'.join(re.escape(s) for s in _state_names_for_regex) + r')',
    re.IGNORECASE,
)


def clean_state(raw_value):
    """Clean a raw state value -> canonical lowercase Indian state/UT or None."""
    if pd.isna(raw_value) or str(raw_value).strip() == "":
        return None

    # Normalize whitespace, strip trailing commas/periods
    val = re.sub(r'\s+', ' ', str(raw_value).strip())
    val = val.rstrip(',.;').strip()
    low = val.lower()

    # 1. Direct canonical match
    if low in VALID_STATES:
        return low

    # 2. Explicit mapping
    if low in STATE_MAP:
        return STATE_MAP[low]

    # 3. Regex extraction from address-like strings
    m = _STATE_EXTRACT_RE.search(low)
    if m:
        found = m.group(1).lower()
        if found in VALID_STATES:
            return found
        if found in STATE_MAP:
            return STATE_MAP[found]

    # 4. Unresolvable
    return None


# ===========================================================================
# 4. COLUMN CLEANERS
# ===========================================================================
def safe_str_lower(val):
    if pd.isna(val) or str(val).strip() == "":
        return None
    return str(val).strip().lower()

def safe_int(val):
    if pd.isna(val):
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None

def safe_float(val):
    if pd.isna(val):
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except (ValueError, TypeError):
        return None

def clean_postal_code(val):
    if pd.isna(val):
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f) or f == 0:
            return None
        code = str(int(f)).zfill(6)
        if len(code) == 6 and code.isdigit():
            return code
        return None
    except (ValueError, TypeError):
        s = re.sub(r'\D', '', str(val).strip())
        return s if len(s) == 6 else None

def clean_date(val):
    if pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%Y"]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s.lower()


# ===========================================================================
# 5. ROW PROCESSING
# ===========================================================================
def process_row(row_dict, row_idx):
    """Clean a single row dict. Returns (cleaned_dict, errors_list)."""
    cleaned = {}
    errors = []

    for col in COLUMNS:
        raw = row_dict.get(col)
        col_type = COL_TYPES.get(col, "str")

        if col_type == "date":
            cleaned[col] = clean_date(raw)
        elif col_type == "int":
            cleaned[col] = safe_int(raw)
        elif col_type == "float":
            cleaned[col] = safe_float(raw)
        elif col_type == "postal":
            cleaned[col] = clean_postal_code(raw)
        elif col_type == "state":
            cleaned[col] = clean_state(raw)
        else:
            cleaned[col] = safe_str_lower(raw)

    # -- Validation --
    if not cleaned.get("Order Id") and not cleaned.get("Sku") and not cleaned.get("Date"):
        errors.append(f"Row {row_idx}: missing Order Id, Sku, and Date")

    if cleaned.get("Quantity") is not None and cleaned["Quantity"] < 0:
        errors.append(f"Row {row_idx}: negative Quantity={cleaned['Quantity']}")

    if cleaned.get("Year") is not None and (cleaned["Year"] < 2015 or cleaned["Year"] > 2030):
        errors.append(f"Row {row_idx}: suspicious Year={cleaned['Year']}")

    return cleaned, errors


# ===========================================================================
# 6. MAIN PIPELINE
# ===========================================================================
def main():
    print("=" * 70)
    print("  COMBINED2.XLSX -> CLEAN -> VALIDATE -> SUPABASE")
    print("=" * 70)

    # -- Read Excel --
    print("\n[1/6] Reading Excel file...")
    df = pd.read_excel(EXCEL_PATH, sheet_name="Combined Data", engine="openpyxl")
    print(f"  Read {len(df)} rows, {len(df.columns)} columns")
    print(f"  Excel columns: {list(df.columns)}")

    missing_cols = [c for c in COLUMNS if c not in df.columns]
    extra_cols = [c for c in df.columns if c not in COLUMNS]
    if missing_cols:
        print(f"  WARNING: Missing columns: {missing_cols}")
    if extra_cols:
        print(f"  INFO: Extra columns (ignored): {extra_cols}")

    # -- Clean --
    print("\n[2/6] Cleaning & validating every row...")
    cleaned_records = []
    all_errors = []
    state_stats = {"resolved": 0, "unresolved": 0, "null_original": 0}

    for idx, row in df.iterrows():
        row_dict = row.to_dict()
        cleaned, errors = process_row(row_dict, idx + 2)
        cleaned_records.append(cleaned)
        all_errors.extend(errors)

        raw_state = row_dict.get("Ship To State")
        if pd.isna(raw_state) or str(raw_state).strip() == "":
            state_stats["null_original"] += 1
        elif cleaned["Ship To State"] is None:
            state_stats["unresolved"] += 1
        else:
            state_stats["resolved"] += 1

    print(f"  Cleaned {len(cleaned_records)} rows")
    print(f"  Validation errors: {len(all_errors)}")
    for e in all_errors[:10]:
        print(f"    - {e}")
    if len(all_errors) > 10:
        print(f"    ... and {len(all_errors) - 10} more")

    print(f"\n  State cleaning stats:")
    print(f"    Resolved to valid state: {state_stats['resolved']}")
    print(f"    Originally null/empty:   {state_stats['null_original']}")
    print(f"    Could not resolve:       {state_stats['unresolved']}")
    if state_stats["unresolved"] > 0:
        unresolved = set()
        for idx, row in df.iterrows():
            raw = row.get("Ship To State")
            if not pd.isna(raw) and str(raw).strip() != "" and cleaned_records[idx]["Ship To State"] is None:
                unresolved.add(str(raw).strip())
        print(f"    Unresolved values: {sorted(unresolved)}")

    # -- Samples --
    print("\n[3/6] Sample cleaned records:")
    for i in [0, 100, 1000, 15000, 30000]:
        if i < len(cleaned_records):
            r = cleaned_records[i]
            print(f"  Row {i}: Date={r['Date']}, State={r['Ship To State']}, "
                  f"Qty={r['Quantity']}, Postal={r['Ship To Postal Code']}, "
                  f"Amt={r['Invoice Amount']}, Brand={r.get('BRAND')}")

    # Distinct states
    states_after = sorted(set(r["Ship To State"] for r in cleaned_records if r["Ship To State"]))
    print(f"\n  Distinct states after cleaning: {len(states_after)}")
    for s in states_after:
        count = sum(1 for r in cleaned_records if r["Ship To State"] == s)
        print(f"    {s}: {count}")

    # -- Connect --
    print("\n[4/6] Connecting to Supabase...")
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    try:
        result = supabase.table("sales_data").select("id", count="exact").limit(1).execute()
        print(f"  Connected. Current sales_data count: {result.count}")
    except Exception as e:
        print(f"  Connection error: {e}")
        sys.exit(1)

    # -- Truncate --
    print("\n[5/6] Truncating all tables...")
    import psycopg2
    conn = psycopg2.connect(
        host="db.yquqkoeptxqgfaiatstk.supabase.co", port=5432,
        dbname="postgres", user="postgres", password="RamanSir1234@", sslmode="require",
    )
    conn.autocommit = True
    cur = conn.cursor()
    for table in ["sales_data", "product_catalog", "refresh_log"]:
        cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;")
        print(f"  Truncated {table}")
    cur.close()
    conn.close()

    # -- Upload --
    print(f"\n[6/6] Uploading {len(cleaned_records)} cleaned records in batches...")
    BATCH_SIZE = 500
    total_uploaded = 0
    failed_batches = 0

    for i in range(0, len(cleaned_records), BATCH_SIZE):
        batch = cleaned_records[i : i + BATCH_SIZE]

        # Final JSON safety pass
        safe_batch = []
        for rec in batch:
            safe_rec = {}
            for k, v in rec.items():
                if v is None:
                    safe_rec[k] = None
                elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    safe_rec[k] = None
                else:
                    safe_rec[k] = v
            safe_batch.append(safe_rec)

        try:
            supabase.table("sales_data").insert(safe_batch).execute()
            total_uploaded += len(safe_batch)
            if (i // BATCH_SIZE) % 10 == 0:
                pct = 100 * total_uploaded / len(cleaned_records)
                print(f"  Uploaded {total_uploaded}/{len(cleaned_records)} ({pct:.1f}%)")
        except Exception as e:
            failed_batches += 1
            print(f"  BATCH FAILED at row {i}: {e}")
            # Row-by-row fallback
            for j, rec in enumerate(safe_batch):
                try:
                    supabase.table("sales_data").insert(rec).execute()
                    total_uploaded += 1
                except Exception as e2:
                    print(f"    ROW {i+j} FAILED: {e2}")
                    print(f"    Data: {json.dumps(rec, default=str)[:200]}")

    print(f"\n{'='*70}")
    print(f"  UPLOAD COMPLETE: {total_uploaded}/{len(cleaned_records)}")
    print(f"  Failed batches: {failed_batches}")
    print(f"{'='*70}")

    # Final verify
    result = supabase.table("sales_data").select("id", count="exact").limit(1).execute()
    print(f"\n  Verification: sales_data rows = {result.count}")

    # Product catalog
    print("\n  Re-uploading product catalog...")
    catalog_records = []
    seen_skus = set()
    for rec in cleaned_records:
        sku = rec.get("Sku")
        if sku and sku not in seen_skus:
            seen_skus.add(sku)
            catalog_records.append({
                "sku": sku,
                "asin": rec.get("Asin"),
                "item_description": rec.get("Item Description"),
                "brand": rec.get("BRAND"),
                "category": rec.get("Category"),
                "segment": rec.get("Segment"),
            })

    for i in range(0, len(catalog_records), BATCH_SIZE):
        batch = catalog_records[i : i + BATCH_SIZE]
        try:
            supabase.table("product_catalog").insert(batch).execute()
        except Exception as e:
            print(f"  Catalog batch error at {i}: {e}")

    cat_result = supabase.table("product_catalog").select("id", count="exact").limit(1).execute()
    print(f"  Product catalog rows: {cat_result.count}")
    print("\nDone!")


if __name__ == "__main__":
    main()
