import { delay, dlCSV } from './utils.js';
import { buildBuyBreakdown, buildAging, buildEventReadiness, buildJsonOverview } from './dashboards.js';

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
  document.getElementById('runBtn').disabled = !selectedFile;
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    const num = el.querySelector('.step-num');
    if (i < n) {
      el.classList.add('done');
      if (num) num.textContent = '✓';
    } else if (i === n) {
      el.classList.add('active');
      if (num) num.textContent = String(i).padStart(2, '0');
    } else {
      if (num) num.textContent = String(i).padStart(2, '0');
    }
  }
}

function doneAll() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    if (!el) continue;
    el.classList.remove('active');
    el.classList.add('done');
    const num = el.querySelector('.step-num');
    if (num) num.textContent = '✓';
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
    setStep(1);
    await delay(250);
    const text = await selectedFile.text();

    setStep(2);
    const processResp = await fetch('/api/process-inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ csvText: text })
    });

    const readResponsePayload = async (response) => {
      const responseText = await response.text();
      if (!responseText) return null;
      try {
        return JSON.parse(responseText);
      } catch {
        return { raw: responseText };
      }
    };

    if (!processResp.ok) {
      const e = await readResponsePayload(processResp);
      throw new Error(e?.details || e?.error || e?.raw || 'Failed to process CSV');
    }

    const processed = await readResponsePayload(processResp);
    if (!processed) {
      throw new Error('Empty response from /api/process-inventory');
    }
    const months = processed.months || [];
    const latestMonth = processed.latestMonth || months[months.length - 1] || '';
    const factRecords = processed.factRecords || [];
    const aiSummary = processed.aiSummary || [];

    factTableData = factRecords;
    aiSummaryData = aiSummary;

    setStep(3);
    await delay(250);
    const flags = processed.flags || {
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
    document.getElementById('uploadResults').style.display = 'block';

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
window.handleFile = handleFile;
window.runPipeline = runPipeline;
window.downloadFact = downloadFact;
window.downloadAI = downloadAI;

async function loadJsonData() {
  try {
    const [summaryRes, currentRes, monthlyRes] = await Promise.all([
      fetch('assets/data/dashboard_summary.json'),
      fetch('assets/data/web_inventory_current.json'),
      fetch('assets/data/web_inventory_monthly.json')
    ]);

    const summary = await summaryRes.json();
    console.log('[Dashboard] dashboard_summary.json loaded:', summary);

    const currentData = await currentRes.json();
    console.log(`[Dashboard] web_inventory_current.json loaded: ${currentData.length} records`);

    const monthlyData = await monthlyRes.json();
    console.log(`[Dashboard] web_inventory_monthly.json loaded: ${monthlyData.length} records`);

    buildJsonOverview(summary, currentData, monthlyData, charts);
  } catch (err) {
    console.error('[Dashboard] Failed to load JSON data:', err);
    const el = document.getElementById('ov-loading');
    if (el) el.textContent = 'Failed to load data. Check console for details.';
  }
}

checkRunnable();
setupDropZone();
loadJsonData();
