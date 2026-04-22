const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const MONTHS_COLS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const SUBCAT_LABEL = 19;
const SUBCAT_BOM = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const SUBCAT_SELLS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];
const SUBCAT_BUYS = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47];
const SUBCAT_EOM = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];
const SUBCAT_ST = [79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91];
const SUBCAT_TURNRATE = 92;
const SUBCAT_RETAIL = 48;
const SUBCAT_AVG_RETAIL = 49;
const DETAIL_LABEL = 93;
const DETAIL_BOM = [94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106];
const DETAIL_SELLS = [124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136];
const DETAIL_BUYS = [109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121];
const DETAIL_EOM = [139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151];
const DETAIL_ST = [153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165];
const DETAIL_TURNRATE = 166;
const DETAIL_RETAIL = 122;
const DETAIL_AVG_RETAIL = 123;

function cn(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(/,/g, '').replace(/[$%]/g, '');
  if (!text || text === '-' || text.toLowerCase() === 'nan' || text.toLowerCase() === 'none') return null;
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, {
    skipEmptyLines: false,
    dynamicTyping: false,
  });

  if (parsed.errors && parsed.errors.length) {
    throw new Error(parsed.errors[0].message || 'CSV parse error');
  }

  return (parsed.data || [])
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => (cell === undefined || cell === null ? '' : String(cell))))
    .filter((row) => row.some((cell) => String(cell).trim() !== ''));
}

function printAvailableColumns(rows) {
  console.error('Available rows/columns preview:');
  rows.slice(0, 3).forEach((row, index) => {
    console.error(`- row ${index}: ${row.map((cell, cellIndex) => `${cellIndex}:${String(cell).slice(0, 48)}`).join(' | ')}`);
  });
}

function getCell(row, index) {
  return index < row.length ? row[index] : '';
}

function buildFactRecords(rows) {
  const months = MONTHS_COLS.map((index) => String(getCell(rows[1] || [], index)).trim());
  const factRecords = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row || row.length < 100) continue;

    const subcategoryLabel = String(getCell(row, SUBCAT_LABEL)).trim();
    const detailLabel = String(getCell(row, DETAIL_LABEL)).trim();
    const subcategoryMatch = subcategoryLabel.match(/\[(\d+)\]\s+(.+)/);
    const detailMatch = detailLabel.match(/:\s+[^:]+:\s+(.+)$/) || detailLabel.match(/\[\d+\]\s+(.+)$/);
    if (!subcategoryMatch || !detailMatch) continue;

    const subcategoryId = subcategoryMatch[1];
    const subcategoryName = subcategoryMatch[2].trim();
    const detailName = detailMatch[1].trim();

    months.forEach((month, monthIndex) => {
      factRecords.push({
        SubcategoryID: subcategoryId,
        Subcategory: subcategoryName,
        Detail: detailName,
        Month: month,
        SubCat_BOM: cn(getCell(row, SUBCAT_BOM[monthIndex])),
        SubCat_Sells: cn(getCell(row, SUBCAT_SELLS[monthIndex])),
        SubCat_Buys: cn(getCell(row, SUBCAT_BUYS[monthIndex])),
        SubCat_EOM: cn(getCell(row, SUBCAT_EOM[monthIndex])),
        SubCat_SellThrough_Pct: cn(getCell(row, SUBCAT_ST[monthIndex])),
        SubCat_TurnRate: cn(getCell(row, SUBCAT_TURNRATE)),
        SubCat_LatestRetail: cn(getCell(row, SUBCAT_RETAIL)),
        SubCat_AvgRetail: cn(getCell(row, SUBCAT_AVG_RETAIL)),
        Detail_BOM: cn(getCell(row, DETAIL_BOM[monthIndex])),
        Detail_Sells: cn(getCell(row, DETAIL_SELLS[monthIndex])),
        Detail_Buys: cn(getCell(row, DETAIL_BUYS[monthIndex])),
        Detail_EOM: cn(getCell(row, DETAIL_EOM[monthIndex])),
        Detail_SellThrough_Pct: cn(getCell(row, DETAIL_ST[monthIndex])),
        Detail_TurnRate: cn(getCell(row, DETAIL_TURNRATE)),
        Detail_LatestRetail: cn(getCell(row, DETAIL_RETAIL)),
        Detail_AvgRetail: cn(getCell(row, DETAIL_AVG_RETAIL)),
      });
    });
  }

  return { months, factRecords };
}

function buildAiSummary(factRecords, months) {
  if (!factRecords.length) {
    return { latestMonth: '', aiSummary: [], flags: { strong: 0, high: 0, low: 0, normal: 0 } };
  }

  const latestMonth = months[months.length - 1] || '';
  const recentMonths = months.slice(-3).filter(Boolean);
  const latestRecords = factRecords.filter((record) => record.Month === latestMonth);

  const aiSummary = latestRecords.map((record) => {
    const recent = factRecords.filter((candidate) => candidate.Detail === record.Detail && recentMonths.includes(candidate.Month));
    const avg3mo = recent.length
      ? recent.reduce((sum, candidate) => sum + (candidate.Detail_SellThrough_Pct || 0), 0) / recent.length
      : 0;
    const total3MoBuys = recent.reduce((sum, candidate) => sum + (candidate.Detail_Buys || 0), 0);
    const total3MoSells = recent.reduce((sum, candidate) => sum + (candidate.Detail_Sells || 0), 0);
    const sellThrough = record.Detail_SellThrough_Pct;
    const turnRate = record.Detail_TurnRate;

    let flag = 'Normal';
    if (sellThrough === null) flag = 'No Data';
    else if (turnRate !== null && turnRate >= 1.0) flag = 'Strong Turner';
    else if (sellThrough >= 10) flag = 'High Sell-Through';
    else if (sellThrough < 3) flag = 'Low Sell-Through';

    return {
      ReportMonth: latestMonth,
      Subcategory: record.Subcategory,
      Detail: record.Detail,
      OnHand_BOM: record.Detail_BOM,
      Buys_LatestMo: record.Detail_Buys,
      Sells_LatestMo: record.Detail_Sells,
      OnHand_EOM: record.Detail_EOM,
      SellThrough_Pct: sellThrough,
      Avg3Mo_SellThrough_Pct: Math.round(avg3mo * 10) / 10,
      Total3Mo_Buys: total3MoBuys,
      Total3Mo_Sells: total3MoSells,
      TurnRate: turnRate,
      TotalRetailValue: record.Detail_LatestRetail,
      AvgRetailPrice: record.Detail_AvgRetail,
      Flag: flag,
    };
  });

  const flags = {
    strong: aiSummary.filter((row) => row.Flag === 'Strong Turner').length,
    high: aiSummary.filter((row) => row.Flag === 'High Sell-Through').length,
    low: aiSummary.filter((row) => row.Flag === 'Low Sell-Through').length,
    normal: aiSummary.filter((row) => row.Flag === 'Normal').length,
  };

  return { latestMonth, aiSummary, flags };
}

function buildCleanJson(aiSummary) {
  const validRows = aiSummary.filter(Boolean);
  const totalInventoryCount = validRows.reduce((sum, row) => sum + (row.OnHand_EOM || 0), 0);
  const totalInventoryValue = validRows.reduce((sum, row) => sum + ((row.OnHand_EOM || 0) * (row.AvgRetailPrice || row.TotalRetailValue || 0)), 0);
  const averageItemPrice = validRows.length
    ? validRows.reduce((sum, row) => sum + (row.AvgRetailPrice || row.TotalRetailValue || 0), 0) / validRows.length
    : null;
  const sellThroughRatePct = validRows.length
    ? validRows.reduce((sum, row) => sum + (row.SellThrough_Pct || 0), 0) / validRows.length
    : null;

  const summary = {
    total_inventory_count: totalInventoryCount,
    total_inventory_value: totalInventoryValue,
    average_item_price: averageItemPrice,
    sell_through_rate_pct: sellThroughRatePct,
  };

  const byCategory = new Map();
  for (const row of validRows) {
    const key = row.Subcategory || 'Unknown';
    if (!byCategory.has(key)) {
      byCategory.set(key, { item_count: 0, total_value: 0, sell_through_values: [] });
    }
    const bucket = byCategory.get(key);
    bucket.item_count += row.OnHand_EOM || 0;
    bucket.total_value += (row.OnHand_EOM || 0) * (row.AvgRetailPrice || row.TotalRetailValue || 0);
    if (row.SellThrough_Pct !== null && row.SellThrough_Pct !== undefined) {
      bucket.sell_through_values.push(row.SellThrough_Pct);
    }
  }

  const buyBreakdown = [...byCategory.entries()]
    .map(([group, bucket]) => ({
      group,
      item_count: bucket.item_count,
      inventory_value: bucket.total_value,
      average_sell_through_pct: bucket.sell_through_values.length
        ? bucket.sell_through_values.reduce((sum, value) => sum + value, 0) / bucket.sell_through_values.length
        : null,
    }))
    .sort((a, b) => b.item_count - a.item_count || b.inventory_value - a.inventory_value);

  const inventoryAging = [
    { bucket: '0-30 days', item_count: 0, inventory_value: 0 },
    { bucket: '31-60 days', item_count: 0, inventory_value: 0 },
    { bucket: '61-90 days', item_count: 0, inventory_value: 0 },
    { bucket: '90+ days', item_count: 0, inventory_value: 0 },
  ];

  for (const row of validRows) {
    const turnRate = row.TurnRate || 0;
    const estimatedDays = turnRate > 0 ? 365 / turnRate : 9999;
    const inventoryValue = (row.OnHand_EOM || 0) * (row.AvgRetailPrice || row.TotalRetailValue || 0);

    let bucketIndex = 3;
    if (estimatedDays <= 30) bucketIndex = 0;
    else if (estimatedDays <= 60) bucketIndex = 1;
    else if (estimatedDays <= 90) bucketIndex = 2;

    inventoryAging[bucketIndex].item_count += row.OnHand_EOM || 0;
    inventoryAging[bucketIndex].inventory_value += inventoryValue;
  }

  return {
    summary,
    buy_breakdown: buyBreakdown,
    inventory_aging: inventoryAging,
    top_categories: buyBreakdown.slice(0, 10),
  };
}

function processWinmarkCsv(csvText, options = {}) {
  const rows = parseCsvRows(csvText);
  if (options.logColumns !== false) printAvailableColumns(rows);

  const { months, factRecords } = buildFactRecords(rows);
  const { latestMonth, aiSummary, flags } = buildAiSummary(factRecords, months);
  const cleanJson = buildCleanJson(aiSummary);

  return {
    months,
    latestMonth,
    factRecords,
    aiSummary,
    flags,
    ...cleanJson,
  };
}

function writeCleanJsonFile(csvPath, outputPath = path.join('data', 'clean.json')) {
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const result = processWinmarkCsv(csvText, { logColumns: true });
  const payload = {
    summary: result.summary,
    buy_breakdown: result.buy_breakdown,
    inventory_aging: result.inventory_aging,
    top_categories: result.top_categories,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.error(`Wrote cleaned JSON to ${outputPath}`);
  return payload;
}

module.exports = {
  processWinmarkCsv,
  writeCleanJsonFile,
};

if (require.main === module) {
  const [, , inputCsv, flag, outputPath] = process.argv;
  if (!inputCsv) {
    console.error('Usage: node scripts/winmark-processor.js <input.csv> [--output data/clean.json]');
    process.exit(1);
  }

  try {
    const destination = flag === '--output' && outputPath ? outputPath : path.join('data', 'clean.json');
    writeCleanJsonFile(inputCsv, destination);
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}
