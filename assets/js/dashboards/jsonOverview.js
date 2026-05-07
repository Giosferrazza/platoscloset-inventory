import { chartDefaults } from '../config.js';
import { destroyChart } from './chartUtils.js';

const { Chart } = /** @type {{ Chart: any }} */ (window);

function formatMonth(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatCurrency(val) {
  if (val == null) return '--';
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(val) {
  if (val == null || !isFinite(val)) return 'N/A';
  return (val * 100).toFixed(1) + '%';
}


function renderCatTable(tbodyId, rows) {
  const body = document.getElementById(tbodyId);
  if (!body) return;
  body.innerHTML = '';
  rows.forEach((c) => {
    const parts = c.category_name.split(': ');
    const detail = parts[1] || c.category_name;
    const turn = (c.avg_turn != null && c.avg_turn > 0) ? c.avg_turn.toFixed(2) : '<span style="color:var(--gray)">N/A</span>';
    const imu = c.avg_imu != null ? fmtPct(c.avg_imu) : '<span style="color:var(--gray)">N/A</span>';
    body.innerHTML += `<tr>
      <td style="font-size:11px">${detail}</td>
      <td style="color:var(--white)">${c.current_units.toLocaleString()}</td>
      <td>${turn}</td>
      <td>${imu}</td>
    </tr>`;
  });
}

export function buildJsonOverview(summary, currentData, monthlyData, charts) {
  document.getElementById('ov-loading').style.display = 'none';
  document.getElementById('ov-content').style.display = 'block';

  // KPI cards
  document.getElementById('ov-totalUnits').textContent = summary.total_current_units.toLocaleString();
  document.getElementById('ov-retailVal').textContent = formatCurrency(summary.total_retail_value);
  document.getElementById('ov-costVal').textContent = formatCurrency(summary.total_cost_value);
  document.getElementById('ov-avgTurn').textContent = summary.avg_turn_rate != null ? summary.avg_turn_rate.toFixed(2) : 'N/A';

  // --- Monthly aggregation ---
  const monthMap = new Map();
  for (const rec of monthlyData) {
    const key = rec.month;
    if (!monthMap.has(key)) {
      monthMap.set(key, { buy: 0, sales: 0, bom: 0, eom: 0, stSum: 0, stCount: 0 });
    }
    const m = monthMap.get(key);
    m.buy += rec.buy_units || 0;
    m.sales += rec.sales_units || 0;
    m.bom += rec.bom_units || 0;
    m.eom += rec.eom_units || 0;
    if (rec.sell_through != null) {
      m.stSum += rec.sell_through;
      m.stCount++;
    }
  }

  const sortedMonths = [...monthMap.keys()].sort();
  const monthLabels = sortedMonths.map(formatMonth);
  const buyData = sortedMonths.map((k) => Math.round(monthMap.get(k).buy));
  const salesData = sortedMonths.map((k) => Math.round(monthMap.get(k).sales));
  const bomData = sortedMonths.map((k) => Math.round(monthMap.get(k).bom));
  const eomData = sortedMonths.map((k) => Math.round(monthMap.get(k).eom));
  const stData = sortedMonths.map((k) => {
    const m = monthMap.get(k);
    return m.stCount > 0 ? +((m.stSum / m.stCount) * 100).toFixed(2) : null;
  });

  destroyChart(charts, 'ov-salesBuys');
  charts['ov-salesBuys'] = new Chart(document.getElementById('ov-salesBuysChart'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'Buys', data: buyData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, fill: true },
        { label: 'Sales', data: salesData, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });

  destroyChart(charts, 'ov-stTrend');
  charts['ov-stTrend'] = new Chart(document.getElementById('ov-stTrendChart'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'Avg Sell-Through %', data: stData, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });

  destroyChart(charts, 'ov-bom');
  charts['ov-bom'] = new Chart(document.getElementById('ov-bomChart'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'BOM Units', data: bomData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });

  destroyChart(charts, 'ov-eom');
  charts['ov-eom'] = new Chart(document.getElementById('ov-eomChart'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'EOM Units', data: eomData, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });

  // --- Current inventory aggregation by category ---
  const catMap = new Map();
  for (const rec of currentData) {
    const key = rec.category_id;
    if (!catMap.has(key)) {
      catMap.set(key, {
        category_name: rec.category_name,
        category_code: rec.category_code,
        current_units: 0,
        turn_sum: 0,
        turn_count: 0,
        imu_sum: 0,
        imu_count: 0,
        retail: 0,
        cost: 0
      });
    }
    const c = catMap.get(key);
    c.current_units += rec.current_units || 0;
    c.retail += rec.retail || 0;
    c.cost += rec.cost || 0;
    if (rec.has_turn_rate && rec.turn_rate != null) {
      c.turn_sum += rec.turn_rate;
      c.turn_count++;
    }
    if (rec.has_imu && rec.imu_percent != null) {
      c.imu_sum += rec.imu_percent;
      c.imu_count++;
    }
  }

  const categories = [...catMap.values()].map((c) => ({
    ...c,
    avg_turn: c.turn_count > 0 ? c.turn_sum / c.turn_count : null,
    avg_imu: c.imu_count > 0 ? c.imu_sum / c.imu_count : null
  }));

  // Top current units
  const topUnits = [...categories].sort((a, b) => b.current_units - a.current_units).slice(0, 15);
  renderCatTable('ov-topTableBody', topUnits);

  // Fast movers: highest avg turn rate with at least 5 units on hand
  const fastMovers = [...categories]
    .filter((c) => c.avg_turn != null && c.current_units >= 5)
    .sort((a, b) => b.avg_turn - a.avg_turn)
    .slice(0, 15);
  renderCatTable('ov-fastTableBody', fastMovers);

  // Slow movers: lowest avg turn rate with at least 5 units on hand
  const slowMovers = [...categories]
    .filter((c) => c.avg_turn != null && c.current_units >= 5)
    .sort((a, b) => a.avg_turn - b.avg_turn)
    .slice(0, 15);
  renderCatTable('ov-slowTableBody', slowMovers);

  // Full inventory table
  const allSorted = [...categories].sort((a, b) => b.current_units - a.current_units);
  const allBody = document.getElementById('ov-invTableBody');
  if (allBody) {
    allBody.innerHTML = '';
    allSorted.forEach((c) => {
      const parts = c.category_name.split(': ');
      const subcat = parts[0] || '';
      const detail = parts[1] || c.category_name;
      const turn = c.avg_turn != null ? c.avg_turn.toFixed(2) : '<span style="color:var(--gray)">N/A</span>';
      const imu = c.avg_imu != null ? fmtPct(c.avg_imu) : '<span style="color:var(--gray)">N/A</span>';
      allBody.innerHTML += `<tr>
        <td style="color:var(--gray);font-size:11px">${subcat}</td>
        <td>${detail}</td>
        <td style="color:var(--gray);font-size:11px">${c.category_code}</td>
        <td style="color:var(--white)">${c.current_units.toLocaleString()}</td>
        <td style="color:var(--blue)">${formatCurrency(c.retail)}</td>
        <td style="color:var(--gray)">${formatCurrency(c.cost)}</td>
        <td>${turn}</td>
        <td>${imu}</td>
      </tr>`;
    });
  }
}
