#!/usr/bin/env python3
import json
import re
import sys
from io import StringIO

import numpy as np
import pandas as pd

MONTHS_COLS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
SUBCAT_LABEL = 19
SUBCAT_BOM = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
SUBCAT_SELLS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62]
SUBCAT_BUYS = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47]
SUBCAT_EOM = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77]
SUBCAT_ST = [79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]
SUBCAT_TURNRATE = 92
SUBCAT_RETAIL = 48
SUBCAT_AVG_RETAIL = 49
DETAIL_LABEL = 93
DETAIL_BOM = [94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106]
DETAIL_SELLS = [124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136]
DETAIL_BUYS = [109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]
DETAIL_EOM = [139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151]
DETAIL_ST = [153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165]
DETAIL_TURNRATE = 166
DETAIL_RETAIL = 122
DETAIL_AVG_RETAIL = 123


def cn(v):
    if v is None:
        return None
    s = str(v).strip().replace(',', '').replace('$', '').replace('%', '')
    if s.lower() in {'', '-', 'nan', 'none'}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def get_cell(row, idx):
    return row.iat[idx] if idx < len(row) else None


def to_records(df):
    return json.loads(df.to_json(orient='records'))


def build_fact_records(df):
    months = [str(df.iat[1, i]).strip() if i < df.shape[1] else '' for i in MONTHS_COLS]
    records = []

    for ri in range(1, len(df)):
        row = df.iloc[ri]
        if len(row) < 100:
            continue

        scl = str(get_cell(row, SUBCAT_LABEL) or '').strip()
        dl = str(get_cell(row, DETAIL_LABEL) or '').strip()

        sm = re.match(r"\[(\d+)\]\s+(.+)", scl)
        if not sm:
            continue

        dm = re.search(r":\s+[^:]+:\s+(.+)$", dl) or re.search(r"\[\d+\]\s+(.+)$", dl)
        if not dm:
            continue

        sid = sm.group(1)
        sname = sm.group(2).strip()
        dname = dm.group(1).strip()

        for mi, month in enumerate(months):
            records.append(
                {
                    'SubcategoryID': sid,
                    'Subcategory': sname,
                    'Detail': dname,
                    'Month': month,
                    'SubCat_BOM': cn(get_cell(row, SUBCAT_BOM[mi])),
                    'SubCat_Sells': cn(get_cell(row, SUBCAT_BUYS[mi])),
                    'SubCat_Buys': cn(get_cell(row, SUBCAT_SELLS[mi])),
                    'SubCat_EOM': cn(get_cell(row, SUBCAT_EOM[mi])),
                    'SubCat_SellThrough_Pct': cn(get_cell(row, SUBCAT_ST[mi])),
                    'SubCat_TurnRate': cn(get_cell(row, SUBCAT_TURNRATE)),
                    'SubCat_LatestRetail': cn(get_cell(row, SUBCAT_RETAIL)),
                    'SubCat_AvgRetail': cn(get_cell(row, SUBCAT_AVG_RETAIL)),
                    'Detail_BOM': cn(get_cell(row, DETAIL_BOM[mi])),
                    'Detail_Sells': cn(get_cell(row, DETAIL_BUYS[mi])),
                    'Detail_Buys': cn(get_cell(row, DETAIL_SELLS[mi])),
                    'Detail_EOM': cn(get_cell(row, DETAIL_EOM[mi])),
                    'Detail_SellThrough_Pct': cn(get_cell(row, DETAIL_ST[mi])),
                    'Detail_TurnRate': cn(get_cell(row, DETAIL_TURNRATE)),
                    'Detail_LatestRetail': cn(get_cell(row, DETAIL_RETAIL)),
                    'Detail_AvgRetail': cn(get_cell(row, DETAIL_AVG_RETAIL)),
                }
            )

    return months, pd.DataFrame(records)


def build_ai_summary(fact_df, months):
    if fact_df.empty:
        return '', pd.DataFrame()

    latest_month = months[-1] if months else ''
    recent_months = [m for m in months if m][-3:]

    latest_df = fact_df[fact_df['Month'] == latest_month].copy()
    recent_df = fact_df[fact_df['Month'].isin(recent_months)].copy()

    agg = (
        recent_df.groupby('Detail', dropna=False)
        .agg(
            Avg3Mo_SellThrough_Pct=('Detail_SellThrough_Pct', 'mean'),
            Total3Mo_Buys=('Detail_Sells', 'sum'),
            Total3Mo_Sells=('Detail_Buys', 'sum'),
        )
        .reset_index()
    )

    ai = latest_df.merge(agg, on='Detail', how='left')
    ai['Avg3Mo_SellThrough_Pct'] = ai['Avg3Mo_SellThrough_Pct'].round(1)

    st = ai['Detail_SellThrough_Pct']
    tr = ai['Detail_TurnRate']
    ai['Flag'] = np.select(
        [
            st.isna(),
            tr.ge(1.0),
            st.ge(10),
            st.lt(3),
        ],
        ['No Data', 'Strong Turner', 'High Sell-Through', 'Low Sell-Through'],
        default='Normal',
    )

    ai_out = pd.DataFrame(
        {
            'ReportMonth': latest_month,
            'Subcategory': ai['Subcategory'],
            'Detail': ai['Detail'],
            'OnHand_BOM': ai['Detail_BOM'],
            'Buys_LatestMo': ai['Detail_Sells'],
            'Sells_LatestMo': ai['Detail_Buys'],
            'OnHand_EOM': ai['Detail_EOM'],
            'SellThrough_Pct': ai['Detail_SellThrough_Pct'],
            'Avg3Mo_SellThrough_Pct': ai['Avg3Mo_SellThrough_Pct'],
            'Total3Mo_Buys': ai['Total3Mo_Buys'],
            'Total3Mo_Sells': ai['Total3Mo_Sells'],
            'TurnRate': ai['Detail_TurnRate'],
            'TotalRetailValue': ai['Detail_LatestRetail'],
            'AvgRetailPrice': ai['Detail_AvgRetail'],
            'Flag': ai['Flag'],
        }
    )

    return latest_month, ai_out


def main():
    payload = json.load(sys.stdin)
    csv_text = payload.get('csvText')
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise ValueError('Missing csvText payload')

    df = pd.read_csv(StringIO(csv_text), header=None, dtype=str, keep_default_na=False, engine='python')
    if len(df) < 2:
        raise ValueError('CSV does not contain enough rows')

    months, fact_df = build_fact_records(df)
    latest_month, ai_df = build_ai_summary(fact_df, months)

    flags = {
        'strong': int((ai_df['Flag'] == 'Strong Turner').sum()) if not ai_df.empty else 0,
        'high': int((ai_df['Flag'] == 'High Sell-Through').sum()) if not ai_df.empty else 0,
        'low': int((ai_df['Flag'] == 'Low Sell-Through').sum()) if not ai_df.empty else 0,
        'normal': int((ai_df['Flag'] == 'Normal').sum()) if not ai_df.empty else 0,
    }

    out = {
        'months': months,
        'latestMonth': latest_month,
        'factRecords': to_records(fact_df),
        'aiSummary': to_records(ai_df),
        'flags': flags,
    }
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'error': str(exc)}), file=sys.stderr)
        sys.exit(1)
