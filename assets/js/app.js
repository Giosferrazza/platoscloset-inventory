import {
  MONTHS_COLS,
  SUBCAT_LABEL,
  SUBCAT_BOM,
  SUBCAT_SELLS,
  SUBCAT_BUYS,
  SUBCAT_EOM,
  SUBCAT_ST,
  SUBCAT_TURNRATE,
  SUBCAT_RETAIL,
  SUBCAT_AVG_RETAIL,
  DETAIL_LABEL,
  DETAIL_BOM,
  DETAIL_SELLS,
  DETAIL_BUYS,
  DETAIL_EOM,
  DETAIL_ST,
  DETAIL_TURNRATE,
  DETAIL_RETAIL,
  DETAIL_AVG_RETAIL
} from './config.js';
import { cn, parseCSV, delay, dlCSV } from './utils.js';
import { buildBuyBreakdown, buildAging, buildEventReadiness } from './dashboards.js';

let selectedFile = null;
let factTableData = null;
let aiSummaryData = null;
const charts = {};

function showTab(name) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  document.getElementById(`panel-${name}`).classList.add('active');

  const matchingTab = document.querySelector(`.nav-tab[onclick="showTab('${name}')"]`);
  if (matchingTab) matchingTab.classList.add('active');
}

function saveKey() {
  const k = document.getElementById('apiKey').value.trim();
  if (!k.startsWith('sk-ant-')) {
    setStatus('Invalid key format', 'missing');
    return;
  }
  sessionStorage.setItem('ak', k);
  setStatus('&#x25CF; Key saved for this session', 'ok');
  checkRunnable();
}

function getKey() {
  return sessionStorage.getItem('ak') || '';
}

function setStatus(msg, cls) {
  const el = document.getElementById('apiStatus');
  el.innerHTML = msg;
  el.className = `api-status ${cls}`;
}

function initFromSession() {
  const k = getKey();
  if (k) {
    document.getElementById('apiKey').value = k;
    setStatus('&#x25CF; Key loaded from session', 'ok');
  }
  checkRunnable();
}

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = `${(file.size / 1024).toFixed(0)} KB`;
  document.getElementById('filePill').classList.add('show');
  checkRunnable();
}

function setupDropZone() {
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragging');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
}

function checkRunnable() {
  document.getElementById('runBtn').disabled = !(selectedFile && getKey());
}

function setStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove('active', 'done');
    const num = el.querySelector('.step-num');
    if (i < n) {
      el.classList.add('done');
      num.textContent = '✓';
    } else if (i === n) {
      el.classList.add('active');
      num.textContent = String(i).padStart(2, '0');
    } else {
      num.textContent = String(i).padStart(2, '0');
    }
  }
}

function doneAll() {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`step${i}`);
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.step-num').textContent = '✓';
  }
}

function showError(msg) {
  const b = document.getElementById('errorBox');
  b.textContent = msg;
  b.className = msg ? 'error-box show' : 'error-box';
}

async function runPipeline() {
  showError('');
  document.getElementById('progressCard').classList.add('show');
  document.getElementById('uploadResults').style.display = 'none';
  document.getElementById('runBtn').disabled = true;

  try {
    const text = await selectedFile.text();
    const lines = parseCSV(text);

    setStep(1);
    await delay(400);
    const months = MONTHS_COLS.map((i) => lines[1]?.[i]?.trim() || '');

    setStep(2);
    await delay(300);
    const factRecords = [];

    for (let ri = 1; ri < lines.length; ri++) {
      const row = lines[ri];
      if (!row || row.length < 100) continue;
      const scl = row[SUBCAT_LABEL]?.trim() || '';
      const dl = row[DETAIL_LABEL]?.trim() || '';
      const sm = scl.match(/\[(\d+)\]\s+(.+)/);
      if (!sm) continue;
      const sid = sm[1];
      const sname = sm[2].trim();
      const dm = dl.match(/:\s+[^:]+:\s+(.+)$/) ?? dl.match(/\[\d+\]\s+(.+)$/);
      if (!dm) continue;
      const dname = dm[1].trim();

      months.forEach((month, mi) => {
        factRecords.push({
          SubcategoryID: sid,
          Subcategory: sname,
          Detail: dname,
          Month: month,
          SubCat_BOM: cn(row[SUBCAT_BOM[mi]]),
          SubCat_Sells: cn(row[SUBCAT_BUYS[mi]]),
          SubCat_Buys: cn(row[SUBCAT_SELLS[mi]]),
          SubCat_EOM: cn(row[SUBCAT_EOM[mi]]),
          SubCat_SellThrough_Pct: cn(row[SUBCAT_ST[mi]]),
          SubCat_TurnRate: cn(row[SUBCAT_TURNRATE]),
          SubCat_LatestRetail: cn(row[SUBCAT_RETAIL]),
          SubCat_AvgRetail: cn(row[SUBCAT_AVG_RETAIL]),
          Detail_BOM: cn(row[DETAIL_BOM[mi]]),
          Detail_Sells: cn(row[DETAIL_BUYS[mi]]),
          Detail_Buys: cn(row[DETAIL_SELLS[mi]]),
          Detail_EOM: cn(row[DETAIL_EOM[mi]]),
          Detail_SellThrough_Pct: cn(row[DETAIL_ST[mi]]),
          Detail_TurnRate: cn(row[DETAIL_TURNRATE]),
          Detail_LatestRetail: cn(row[DETAIL_RETAIL]),
          Detail_AvgRetail: cn(row[DETAIL_AVG_RETAIL])
        });
      });
    }
    factTableData = factRecords;

    setStep(3);
    await delay(300);
    const latestMonth = months[months.length - 1];
    const recentMonths = months.slice(-3);
    const latestRecs = factRecords.filter((r) => r.Month === latestMonth);

    const aiSummary = latestRecs.map((r) => {
      const recent = factRecords.filter((f) => f.Detail === r.Detail && recentMonths.includes(f.Month));
      const avg3mo = recent.length ? recent.reduce((s, f) => s + (f.Detail_SellThrough_Pct || 0), 0) / recent.length : 0;
      const t3b = recent.reduce((s, f) => s + (f.Detail_Sells || 0), 0);
      const t3s = recent.reduce((s, f) => s + (f.Detail_Buys || 0), 0);
      const st = r.Detail_SellThrough_Pct;
      const tr = r.Detail_TurnRate;
      let flag = 'Normal';
      if (st === null) flag = 'No Data';
      else if (tr !== null && tr >= 1.0) flag = 'Strong Turner';
      else if (st >= 10) flag = 'High Sell-Through';
      else if (st < 3) flag = 'Low Sell-Through';
      return {
        ReportMonth: latestMonth,
        Subcategory: r.Subcategory,
        Detail: r.Detail,
        OnHand_BOM: r.Detail_BOM,
        Buys_LatestMo: r.Detail_Sells,
        Sells_LatestMo: r.Detail_Buys,
        OnHand_EOM: r.Detail_EOM,
        SellThrough_Pct: st,
        Avg3Mo_SellThrough_Pct: Math.round(avg3mo * 10) / 10,
        Total3Mo_Buys: t3b,
        Total3Mo_Sells: t3s,
        TurnRate: tr,
        TotalRetailValue: r.Detail_LatestRetail,
        AvgRetailPrice: r.Detail_AvgRetail,
        Flag: flag
      };
    });
    aiSummaryData = aiSummary;

    const flags = {
      strong: aiSummary.filter((r) => r.Flag === 'Strong Turner').length,
      high: aiSummary.filter((r) => r.Flag === 'High Sell-Through').length,
      low: aiSummary.filter((r) => r.Flag === 'Low Sell-Through').length,
      normal: aiSummary.filter((r) => r.Flag === 'Normal').length
    };

    setStep(4);
    await delay(300);
    buildBuyBreakdown(aiSummary, factRecords, months, latestMonth, charts);
    buildAging(aiSummary, factRecords, months, charts);
    buildEventReadiness(aiSummary, charts);

    document.getElementById('ovMonth').textContent = latestMonth;
    document.getElementById('ovStrong').textContent = flags.strong;
    document.getElementById('ovLow').textContent = flags.low;
    document.getElementById('ovTotal').textContent = aiSummary.length;
    document.getElementById('insightsMonth').textContent = latestMonth;
    document.getElementById('uploadResults').style.display = 'block';

    setStep(5);
    const top = aiSummary
      .filter((r) => r.Flag === 'Strong Turner' || r.Flag === 'High Sell-Through')
      .sort((a, b) => (b.SellThrough_Pct || 0) - (a.SellThrough_Pct || 0))
      .slice(0, 15);
    const low = aiSummary
      .filter((r) => r.Flag === 'Low Sell-Through')
      .sort((a, b) => (a.SellThrough_Pct || 0) - (b.SellThrough_Pct || 0))
      .slice(0, 15);

    const resp = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getKey(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a retail inventory analyst for Plato's Closet Store #80209 in Reno, NV - a used clothing resale store.

Analyze this inventory data for ${latestMonth}.

SUMMARY: Strong Turners: ${flags.strong} | High Sell-Through: ${flags.high} | Low Sell-Through: ${flags.low} | Normal: ${flags.normal}

TOP PERFORMERS:
${JSON.stringify(top.map((r) => ({ detail: r.Detail, st: r.SellThrough_Pct, avg3mo: r.Avg3Mo_SellThrough_Pct, tr: r.TurnRate, buys3mo: r.Total3Mo_Buys, onHand: r.OnHand_EOM, flag: r.Flag })), null, 1)}

UNDERPERFORMERS:
${JSON.stringify(low.map((r) => ({ detail: r.Detail, st: r.SellThrough_Pct, avg3mo: r.Avg3Mo_SellThrough_Pct, tr: r.TurnRate, onHand: r.OnHand_EOM })), null, 1)}

Provide exactly:
**Strengths** - top 3-4 categories to keep buying aggressively (cite specific numbers)
**Weaknesses** - top 3-4 dead weight categories (cite specific numbers)
**Buying Plan** - specific actions for next month
**Immediate Action** - one thing the store manager should do THIS WEEK

Use actual category names. Under 400 words.`
        }]
      })
    });

    if (!resp.ok) {
      const e = await resp.json();
      throw new Error(e.error?.message || 'API error');
    }
    const data = await resp.json();
    document.getElementById('insightsText').textContent = data.content[0].text;

    doneAll();
  } catch (err) {
    showError(`Error: ${err.message}`);
    console.error(err);
  }

  document.getElementById('runBtn').disabled = false;
}

function downloadFact() {
  dlCSV(factTableData, 'fact_table_clean.csv');
}

function downloadAI() {
  dlCSV(aiSummaryData, 'ai_summary_table.csv');
}

window.showTab = showTab;
window.saveKey = saveKey;
window.handleFile = handleFile;
window.runPipeline = runPipeline;
window.downloadFact = downloadFact;
window.downloadAI = downloadAI;

initFromSession();
setupDropZone();
