#!/usr/bin/env python3
"""Prepare a clean JSON payload from a Winmark Used Inventory Productivity CSV.

The script is intentionally defensive:
- it prints the available columns up front
- it infers common fields from multiple possible column names
- it keeps running even when some fields are missing
- it writes a clean JSON document to data/clean.json by default
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
import pandas as pd


DATE_ALIASES = [
    "date",
    "report_date",
    "inventory_date",
    "purchase_date",
    "received_date",
    "transaction_date",
    "created_date",
    "posted_date",
    "as_of_date",
]

GROUP_ALIASES = {
    "category": ["category", "sub_category", "subcategory", "item_category", "product_category"],
    "department": ["department", "dept", "division"],
    "brand": ["brand", "vendor", "maker", "label"],
}

QUANTITY_ALIASES = [
    "quantity",
    "qty",
    "units",
    "unit_count",
    "count",
    "on_hand",
    "qty_on_hand",
    "inventory_count",
    "stock",
    "available",
]

PRICE_ALIASES = [
    "price",
    "unit_price",
    "retail",
    "avg_retail",
    "average_price",
    "sale_price",
    "sell_price",
]

COST_ALIASES = ["cost", "unit_cost", "item_cost", "landed_cost"]
VALUE_ALIASES = ["value", "inventory_value", "retail_value", "total_value", "extended_value"]
SOLD_ALIASES = ["sold", "sales", "units_sold", "qty_sold", "sell_qty"]
BOUGHT_ALIASES = ["bought", "purchased", "units_bought", "qty_bought", "received"]
SELL_THROUGH_ALIASES = ["sell_through", "sellthrough", "sell_thru", "sell_through_pct", "sell_through_rate"]


@dataclass
class ColumnSet:
    date: Optional[str] = None
    report_date: Optional[str] = None
    quantity: Optional[str] = None
    price: Optional[str] = None
    cost: Optional[str] = None
    value: Optional[str] = None
    sold: Optional[str] = None
    bought: Optional[str] = None
    sell_through: Optional[str] = None
    group_by: Optional[str] = None


def normalize_column_name(name: object) -> str:
    text = str(name).strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return re.sub(r"_+", "_", text).strip("_")


def load_csv(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path, dtype=str, keep_default_na=False, engine="python")
    except Exception:
        return pd.read_csv(path, dtype=str, keep_default_na=False, engine="python", sep=None)


def print_available_columns(columns: Iterable[str]) -> None:
    columns_list = list(columns)
    print("Available columns:", file=sys.stderr)
    for column in columns_list:
        print(f"- {column}", file=sys.stderr)


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    standardized = df.copy()
    standardized.columns = [normalize_column_name(column) for column in standardized.columns]
    return standardized


def remove_empty_rows(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.replace(r"^\s*$", np.nan, regex=True)
    cleaned = cleaned.dropna(how="all")
    return cleaned.reset_index(drop=True)


def match_column(columns: Iterable[str], aliases: Iterable[str]) -> Optional[str]:
    cols = list(columns)
    alias_list = [normalize_column_name(alias) for alias in aliases]

    for alias in alias_list:
        if alias in cols:
            return alias

    for alias in alias_list:
        for column in cols:
            if alias in column:
                return column

    return None


def infer_columns(df: pd.DataFrame) -> ColumnSet:
    columns = list(df.columns)
    inferred = ColumnSet()
    inferred.date = match_column(columns, DATE_ALIASES)
    inferred.report_date = match_column(columns, ["report_date", "as_of_date", "snapshot_date", "run_date"])
    inferred.quantity = match_column(columns, QUANTITY_ALIASES)
    inferred.price = match_column(columns, PRICE_ALIASES)
    inferred.cost = match_column(columns, COST_ALIASES)
    inferred.value = match_column(columns, VALUE_ALIASES)
    inferred.sold = match_column(columns, SOLD_ALIASES)
    inferred.bought = match_column(columns, BOUGHT_ALIASES)
    inferred.sell_through = match_column(columns, SELL_THROUGH_ALIASES)

    for group_name, aliases in GROUP_ALIASES.items():
        group_column = match_column(columns, aliases)
        if group_column:
            inferred.group_by = group_column
            break

    return inferred


def parse_date_columns(df: pd.DataFrame, inferred: ColumnSet) -> pd.DataFrame:
    parsed = df.copy()

    candidates = [column for column in [inferred.date, inferred.report_date] if column]
    if not candidates:
        candidates = [
            column
            for column in parsed.columns
            if any(token in column for token in ["date", "month", "day", "created", "posted", "received", "purchase"])
        ]

    for column in candidates:
        parsed[column] = pd.to_datetime(parsed[column], errors="coerce", infer_datetime_format=True)

    return parsed


def coerce_numeric_columns(df: pd.DataFrame, inferred: ColumnSet) -> pd.DataFrame:
    numeric_columns = [
        inferred.quantity,
        inferred.price,
        inferred.cost,
        inferred.value,
        inferred.sold,
        inferred.bought,
        inferred.sell_through,
    ]
    numeric_columns = [column for column in numeric_columns if column]

    coerced = df.copy()
    for column in numeric_columns:
        cleaned = coerced[column].astype(str).str.replace(r"[$,%]", "", regex=True)
        cleaned = cleaned.str.replace(",", "", regex=False)
        coerced[column] = pd.to_numeric(cleaned, errors="coerce")

    return coerced


def choose_reference_date(df: pd.DataFrame, inferred: ColumnSet) -> pd.Timestamp:
    for column in [inferred.report_date, inferred.date]:
        if column and column in df.columns:
            series = pd.to_datetime(df[column], errors="coerce")
            valid = series.dropna()
            if not valid.empty:
                return valid.max()
    return pd.Timestamp.today().normalize()


def series_or_default(df: pd.DataFrame, column: Optional[str], default: float = 1.0) -> pd.Series:
    if column and column in df.columns:
        return df[column].fillna(default)
    return pd.Series(default, index=df.index, dtype="float64")


def calculate_inventory_value(df: pd.DataFrame, inferred: ColumnSet) -> pd.Series:
    quantity = series_or_default(df, inferred.quantity, default=1.0)

    if inferred.value and inferred.value in df.columns:
        return pd.to_numeric(df[inferred.value], errors="coerce").fillna(0) * 1

    if inferred.price and inferred.price in df.columns:
        return pd.to_numeric(df[inferred.price], errors="coerce").fillna(0) * quantity

    if inferred.cost and inferred.cost in df.columns:
        return pd.to_numeric(df[inferred.cost], errors="coerce").fillna(0) * quantity

    return pd.Series(0.0, index=df.index)


def calculate_average_price(df: pd.DataFrame, inferred: ColumnSet) -> Optional[float]:
    for column in [inferred.price, inferred.cost]:
        if column and column in df.columns:
            values = pd.to_numeric(df[column], errors="coerce").dropna()
            if not values.empty:
                return float(values.mean())
    return None


def calculate_sell_through_rate(df: pd.DataFrame, inferred: ColumnSet) -> Optional[float]:
    if inferred.sell_through and inferred.sell_through in df.columns:
        values = pd.to_numeric(df[inferred.sell_through], errors="coerce").dropna()
        if not values.empty:
            return float(values.mean())

    sold = pd.to_numeric(df[inferred.sold], errors="coerce") if inferred.sold and inferred.sold in df.columns else None
    on_hand = pd.to_numeric(df[inferred.quantity], errors="coerce") if inferred.quantity and inferred.quantity in df.columns else None
    bought = pd.to_numeric(df[inferred.bought], errors="coerce") if inferred.bought and inferred.bought in df.columns else None

    if sold is not None and on_hand is not None:
        denom = sold.fillna(0) + on_hand.fillna(0)
        total = denom.sum()
        if total > 0:
            return float((sold.fillna(0).sum() / total) * 100)

    if sold is not None and bought is not None:
        total = bought.fillna(0).sum()
        if total > 0:
            return float((sold.fillna(0).sum() / total) * 100)

    return None


def build_summary(df: pd.DataFrame, inferred: ColumnSet, reference_date: pd.Timestamp) -> dict:
    quantity = series_or_default(df, inferred.quantity, default=1.0)
    inventory_value = calculate_inventory_value(df, inferred)

    total_inventory_count = float(quantity.fillna(1).sum())
    total_inventory_value = float(inventory_value.fillna(0).sum())
    average_item_price = calculate_average_price(df, inferred)
    sell_through_rate_pct = calculate_sell_through_rate(df, inferred)

    return {
        "total_inventory_count": total_inventory_count,
        "total_inventory_value": total_inventory_value,
        "average_item_price": average_item_price,
        "sell_through_rate_pct": sell_through_rate_pct,
        "reference_date": reference_date.date().isoformat(),
        "grouping_used": inferred.group_by,
    }


def build_buy_breakdown(df: pd.DataFrame, inferred: ColumnSet) -> list[dict]:
    if not inferred.group_by or inferred.group_by not in df.columns:
        return []

    quantity = series_or_default(df, inferred.quantity, default=1.0)
    inventory_value = calculate_inventory_value(df, inferred)
    price_series = pd.to_numeric(df[inferred.price], errors="coerce") if inferred.price and inferred.price in df.columns else None

    grouped = df.groupby(inferred.group_by, dropna=False)
    results = []

    for group_value, group_df in grouped:
        idx = group_df.index
        group_quantity = float(quantity.loc[idx].fillna(1).sum())
        group_value_total = float(inventory_value.loc[idx].fillna(0).sum())
        avg_price = None
        if price_series is not None:
            price_values = price_series.loc[idx].dropna()
            if not price_values.empty:
                avg_price = float(price_values.mean())

        results.append(
            {
                "group": None if pd.isna(group_value) else str(group_value),
                "item_count": group_quantity,
                "inventory_value": group_value_total,
                "average_price": avg_price,
            }
        )

    results.sort(key=lambda row: (row["item_count"], row["inventory_value"]), reverse=True)
    return results


def build_inventory_aging(df: pd.DataFrame, inferred: ColumnSet, reference_date: pd.Timestamp) -> list[dict]:
    date_column = inferred.date or inferred.report_date
    if not date_column or date_column not in df.columns:
        return [
            {"bucket": "0-30 days", "item_count": 0, "inventory_value": 0.0},
            {"bucket": "31-60 days", "item_count": 0, "inventory_value": 0.0},
            {"bucket": "61-90 days", "item_count": 0, "inventory_value": 0.0},
            {"bucket": "90+ days", "item_count": 0, "inventory_value": 0.0},
        ]

    working = df.copy()
    working["_source_date"] = pd.to_datetime(working[date_column], errors="coerce")
    working["_age_days"] = (reference_date - working["_source_date"]).dt.days
    working = working[working["_age_days"].notna() & (working["_age_days"] >= 0)]

    quantity = series_or_default(working, inferred.quantity, default=1.0)
    inventory_value = calculate_inventory_value(working, inferred)

    buckets = [
        (0, 30, "0-30 days"),
        (31, 60, "31-60 days"),
        (61, 90, "61-90 days"),
        (91, None, "90+ days"),
    ]

    results = []
    for low, high, label in buckets:
        if high is None:
            mask = working["_age_days"] >= low
        else:
            mask = (working["_age_days"] >= low) & (working["_age_days"] <= high)

        bucket_df = working.loc[mask]
        bucket_quantity = float(quantity.loc[mask].fillna(1).sum())
        bucket_value = float(inventory_value.loc[mask].fillna(0).sum())

        results.append(
            {
                "bucket": label,
                "item_count": bucket_quantity,
                "inventory_value": bucket_value,
            }
        )

    return results


def build_top_categories(df: pd.DataFrame, inferred: ColumnSet) -> list[dict]:
    breakdown = build_buy_breakdown(df, inferred)
    top = sorted(breakdown, key=lambda row: row["inventory_value"], reverse=True)
    return top[:10]


def clean_inventory(csv_path: Path) -> dict:
    raw = load_csv(csv_path)
    raw = remove_empty_rows(raw)

    standardized = standardize_columns(raw)
    print_available_columns(standardized.columns)

    inferred = infer_columns(standardized)
    print("Detected columns:", file=sys.stderr)
    for field, value in inferred.__dict__.items():
        print(f"- {field}: {value or 'not found'}", file=sys.stderr)

    parsed = parse_date_columns(standardized, inferred)
    numeric = coerce_numeric_columns(parsed, inferred)
    reference_date = choose_reference_date(numeric, inferred)

    summary = build_summary(numeric, inferred, reference_date)
    buy_breakdown = build_buy_breakdown(numeric, inferred)
    inventory_aging = build_inventory_aging(numeric, inferred, reference_date)
    top_categories = build_top_categories(numeric, inferred)

    return {
        "summary": summary,
        "buy_breakdown": buy_breakdown,
        "inventory_aging": inventory_aging,
        "top_categories": top_categories,
    }


def save_json(payload: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean a Winmark Used Inventory Productivity CSV into JSON.")
    parser.add_argument("input_csv", help="Path to the Winmark CSV export")
    parser.add_argument("--output", default="data/clean.json", help="Output JSON path (default: data/clean.json)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input_csv)
    output_path = Path(args.output)

    if not input_path.exists():
      raise FileNotFoundError(f"Input CSV not found: {input_path}")

    payload = clean_inventory(input_path)
    save_json(payload, output_path)
    print(f"Wrote cleaned JSON to {output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())