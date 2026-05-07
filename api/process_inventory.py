import html
import re
from pathlib import Path

import pandas as pd


def clean_text(value):
    """Clean text from Excel cells."""
    if pd.isna(value):
        return None

    value = str(value)
    value = html.unescape(value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)

    return value.strip()


def clean_numeric(value):
    """Convert report values like '-', '$1,200', '54.9%' into numbers."""
    if pd.isna(value):
        return None

    value = str(value).strip()
    value = html.unescape(value)
    value = value.replace("\xa0", " ")

    if value in ["", "-", "nan", "None"]:
        return None

    value = (
        value.replace("$", "")
        .replace(",", "")
        .replace("%", "")
        .strip()
    )

    try:
        return float(value)
    except ValueError:
        return None


def clean_numeric_series(series):
    """Vectorized numeric cleaner for pandas Series."""
    return pd.to_numeric(
        series.astype(str)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.replace("-", "", regex=False)
        .replace("", None),
        errors="coerce"
    )


def replace_nan_with_none(df):
    """Make DataFrame JSON-safe by replacing NaN with None."""
    if isinstance(df, pd.DataFrame):
        return df.astype(object).where(pd.notna(df), None)
    return df


def parse_category_detail(detail_text):
    """Extract category code and category name from Detail row."""
    if not detail_text:
        return None, None

    detail_text = detail_text.replace("Detail:", "").strip()

    code_match = re.search(r"\[(\d+)\]", detail_text)
    category_code = code_match.group(1) if code_match else None

    category_name = re.sub(r"\[\d+\]\s*", "", detail_text).strip()

    return category_code, category_name


def process_inventory_report(file_path, return_full_monthly=False):
    """
    Process Plato's Closet Used Inventory Productivity Excel report.

    Parameters:
        file_path: Path to uploaded Excel file.
        return_full_monthly:
            False = returns aggregated monthly chart data for the frontend.
            True = returns all monthly records, useful for database loading.

    Returns:
        {
            "summary": {...},
            "currentInventory": [...],
            "monthlyInventory": [...]
        }
    """

    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    print("Reading Excel...")
    raw = pd.read_excel(file_path, sheet_name=0, header=None)
    print(f"Excel loaded: {raw.shape}")

    # Report structure:
    # Row 8 contains month headers.
    # Columns 2 through 14 are the 13 historical months.
    month_cols = list(range(2, 15))
    month_labels = raw.iloc[8, month_cols].tolist()

    # -----------------------------
    # Parse monthly inventory metrics
    # -----------------------------

    monthly_records = []

    current_brand = None
    current_category_code = None
    current_category_name = None

    metric_rows = {
        "BOM Units": "bom_units",
        "Sales*": "sales_units",
        "Buys": "buy_units",
        "EOM Units": "eom_units",
        "Sell-Through": "sell_through"
    }

    print("Parsing monthly records...")

    for i in range(len(raw)):
        col0 = clean_text(raw.iloc[i, 0])
        col1 = clean_text(raw.iloc[i, 1])

        if col0 and "Brand:" in col0:
            current_brand = col0.replace("Brand:", "").strip()

        if col1 and "Detail:" in col1:
            current_category_code, current_category_name = parse_category_detail(col1)

        if col1 in metric_rows and current_brand and current_category_code and current_category_name:
            metric_name = metric_rows[col1]

            for col_idx, month_label in zip(month_cols, month_labels):
                monthly_records.append({
                    "brand": current_brand,
                    "category_code": current_category_code,
                    "category_name": current_category_name,
                    "month": month_label,
                    "metric": metric_name,
                    "value": raw.iloc[i, col_idx]
                })

    inventory_long = pd.DataFrame(monthly_records)
    print(f"Monthly long records: {inventory_long.shape}")

    inventory_long["value"] = inventory_long["value"].apply(clean_numeric)

    inventory_monthly = inventory_long.pivot_table(
        index=["brand", "category_code", "category_name", "month"],
        columns="metric",
        values="value",
        aggfunc="sum",
        fill_value=0
    ).reset_index()

    inventory_monthly.columns.name = None

    expected_monthly_cols = [
        "bom_units",
        "sales_units",
        "buy_units",
        "eom_units",
        "sell_through"
    ]

    for col in expected_monthly_cols:
        if col not in inventory_monthly.columns:
            inventory_monthly[col] = 0

    inventory_monthly["month"] = pd.to_datetime(
        inventory_monthly["month"],
        format="%b %Y",
        errors="coerce"
    )

    inventory_monthly = inventory_monthly.sort_values(
        ["brand", "category_name", "month"]
    ).reset_index(drop=True)

    print(f"Monthly table created: {inventory_monthly.shape}")

    # -----------------------------
    # Parse current on-hand metrics
    # -----------------------------

    print("Parsing current inventory records...")

    current_records = []

    current_brand = None
    current_snapshot = None

    for i in range(len(raw)):
        col0 = clean_text(raw.iloc[i, 0])
        col1 = clean_text(raw.iloc[i, 1])

        if col0 and "Brand:" in col0:
            current_brand = col0.replace("Brand:", "").strip()

        if col1 and "Detail:" in col1:
            if current_snapshot is not None:
                current_records.append(current_snapshot)

            category_code, category_name = parse_category_detail(col1)

            current_snapshot = {
                "brand": current_brand,
                "category_code": category_code,
                "category_name": category_name,
                "current_units": None,
                "avg_stock": None,
                "retail": None,
                "avg_retail": None,
                "cost": None,
                "avg_cost": None,
                "imu_percent": None,
                "turn_rate": None
            }

        if current_snapshot is not None:
            if col1 == "BOM Units":
                current_snapshot["current_units"] = clean_numeric(raw.iloc[i, 16])
                current_snapshot["avg_stock"] = clean_numeric(raw.iloc[i, 18])

            elif col1 == "Sales*":
                current_snapshot["retail"] = clean_numeric(raw.iloc[i, 16])
                current_snapshot["avg_retail"] = clean_numeric(raw.iloc[i, 18])

            elif col1 == "Buys":
                current_snapshot["cost"] = clean_numeric(raw.iloc[i, 16])
                current_snapshot["avg_cost"] = clean_numeric(raw.iloc[i, 18])

            elif col1 == "EOM Units":
                current_snapshot["imu_percent"] = clean_numeric(raw.iloc[i, 16])

            elif col1 == "Sell-Through":
                current_snapshot["turn_rate"] = clean_numeric(raw.iloc[i, 16])

    if current_snapshot is not None:
        current_records.append(current_snapshot)

    inventory_current = pd.DataFrame(current_records)
    print(f"Current table created: {inventory_current.shape}")

    numeric_current_cols = [
        "current_units",
        "avg_stock",
        "retail",
        "avg_retail",
        "cost",
        "avg_cost",
        "imu_percent",
        "turn_rate"
    ]

    for col in numeric_current_cols:
        inventory_current[col] = pd.to_numeric(
            inventory_current[col],
            errors="coerce"
        )

    inventory_current["has_imu"] = inventory_current["imu_percent"].notna()
    inventory_current["has_turn_rate"] = inventory_current["turn_rate"].notna()

    # -----------------------------
    # Build dimensions
    # -----------------------------

    print("Building dimensions...")

    dim_brand = (
        pd.concat([
            inventory_monthly[["brand"]],
            inventory_current[["brand"]]
        ])
        .drop_duplicates()
        .sort_values("brand")
        .reset_index(drop=True)
    )

    dim_brand["brand_id"] = dim_brand.index + 1
    dim_brand = dim_brand[["brand_id", "brand"]]

    dim_category = (
        pd.concat([
            inventory_monthly[["category_code", "category_name"]],
            inventory_current[["category_code", "category_name"]]
        ])
        .drop_duplicates()
        .sort_values(["category_code", "category_name"])
        .reset_index(drop=True)
    )

    dim_category["category_id"] = dim_category.index + 1
    dim_category = dim_category[[
        "category_id",
        "category_code",
        "category_name"
    ]]

    # -----------------------------
    # Build fact tables
    # -----------------------------

    print("Building fact tables...")

    fact_inventory_monthly = inventory_monthly.merge(
        dim_brand,
        on="brand",
        how="left"
    ).merge(
        dim_category,
        on=["category_code", "category_name"],
        how="left"
    )

    fact_inventory_monthly = fact_inventory_monthly[[
        "brand_id",
        "category_id",
        "month",
        "bom_units",
        "buy_units",
        "eom_units",
        "sales_units",
        "sell_through"
    ]]

    fact_inventory_current = inventory_current.merge(
        dim_brand,
        on="brand",
        how="left"
    ).merge(
        dim_category,
        on=["category_code", "category_name"],
        how="left"
    )

    fact_inventory_current = fact_inventory_current[[
        "brand_id",
        "category_id",
        "current_units",
        "avg_stock",
        "retail",
        "avg_retail",
        "cost",
        "avg_cost",
        "imu_percent",
        "turn_rate",
        "has_imu",
        "has_turn_rate"
    ]]

    # -----------------------------
    # Build web-ready joined tables
    # -----------------------------

    print("Building web-ready tables...")

    web_inventory_monthly = fact_inventory_monthly.merge(
        dim_brand,
        on="brand_id",
        how="left"
    ).merge(
        dim_category,
        on="category_id",
        how="left"
    )

    web_inventory_current = fact_inventory_current.merge(
        dim_brand,
        on="brand_id",
        how="left"
    ).merge(
        dim_category,
        on="category_id",
        how="left"
    )

    # -----------------------------
    # Dashboard summary
    # -----------------------------

    dashboard_summary = {
        "total_current_units": int(web_inventory_current["current_units"].sum()),
        "total_retail_value": round(float(web_inventory_current["retail"].sum()), 2),
        "total_cost_value": round(float(web_inventory_current["cost"].sum()), 2),
        "avg_turn_rate": round(float(web_inventory_current["turn_rate"].mean()), 2),
        "current_record_count": int(len(web_inventory_current)),
        "monthly_record_count": int(len(web_inventory_monthly))
    }

    # -----------------------------
    # Monthly chart data
    # -----------------------------

    monthly_chart = web_inventory_monthly.groupby(
        "month",
        as_index=False
    ).agg({
        "sales_units": "sum",
        "buy_units": "sum",
        "bom_units": "sum",
        "eom_units": "sum",
        "sell_through": "mean"
    })

    monthly_chart["month"] = monthly_chart["month"].astype(str)
    web_inventory_monthly["month"] = web_inventory_monthly["month"].astype(str)

    # -----------------------------
    # JSON safety
    # -----------------------------

    web_inventory_current = replace_nan_with_none(web_inventory_current)
    web_inventory_monthly = replace_nan_with_none(web_inventory_monthly)
    monthly_chart = replace_nan_with_none(monthly_chart)

    if return_full_monthly:
        monthly_output = web_inventory_monthly.to_dict("records")
    else:
        monthly_output = monthly_chart.to_dict("records")

    current_output = web_inventory_current.to_dict("records")

    return {
        "summary": dashboard_summary,
        "currentInventory": current_output,
        "monthlyInventory": monthly_output
    }

if __name__ == "__main__":
    result = process_inventory_report(
        "../assets/data/PlatosExcel.xlsx",
        return_full_monthly=False
    )

    print(result["summary"])
    print("Current records:", len(result["currentInventory"]))
    print("Monthly records returned:", len(result["monthlyInventory"]))