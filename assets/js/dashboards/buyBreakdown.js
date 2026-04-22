import { chartDefaults } from '../config.js';
import { destroyChart } from './chartUtils.js';

export function buildBuyBreakdown(aiSummary, factRecords, months, latestMonth, charts) {
  document.getElementById('bb-empty').style.display = 'none';
  document.getElementById('bb-content').style.display = 'block';

  const totalBuys = aiSummary.reduce((s, r) => s + (r.Buys_LatestMo || 0), 0);
  const totalSells = aiSummary.reduce((s, r) => s + (r.Sells_LatestMo || 0), 0);
  const stVals = aiSummary.filter((r) => r.SellThrough_Pct !== null).map((r) => r.SellThrough_Pct);
  const avgST = stVals.length ? (stVals.reduce((a, b) => a + b, 0) / stVals.length).toFixed(1) : '--';
  const topCat = aiSummary.sort((a, b) => (b.Sells_LatestMo || 0) - (a.Sells_LatestMo || 0))[0]?.Subcategory || '--';

  document.getElementById('bb-totalBuys').textContent = totalBuys;
  document.getElementById('bb-totalSells').textContent = totalSells;
  document.getElementById('bb-avgST').textContent = `${avgST}%`;
  document.getElementById('bb-topCat').textContent = topCat.replace('Accessories ', '').replace('Womens ', 'W. ').replace('Mens ', 'M. ');

  const bySub = {};
  aiSummary.forEach((r) => {
    if (!bySub[r.Subcategory]) bySub[r.Subcategory] = { buys: 0, sells: 0, st: [], tr: [] };
    bySub[r.Subcategory].buys += r.Buys_LatestMo || 0;
    bySub[r.Subcategory].sells += r.Sells_LatestMo || 0;
    if (r.SellThrough_Pct !== null) bySub[r.Subcategory].st.push(r.SellThrough_Pct);
    if (r.TurnRate !== null) bySub[r.Subcategory].tr.push(r.TurnRate);
  });

  const subs = Object.keys(bySub)
    .sort((a, b) => bySub[b].sells - bySub[a].sells)
    .slice(0, 12);
  const shortLabels = subs.map((s) => s.replace('Accessories ', '').replace('Womens ', 'W.').replace('Mens ', 'M.').substring(0, 14));

  destroyChart(charts, 'buySell');
  charts.buySell = new Chart(document.getElementById('buySellChart'), {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [
        { label: 'Buys', data: subs.map((s) => bySub[s].buys), backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3b82f6', borderWidth: 1 },
        { label: 'Sells', data: subs.map((s) => bySub[s].sells), backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1 }
      ]
    },
    options: {
      ...chartDefaults,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#888', font: { family: 'JetBrains Mono', size: 10 } } } }
    }
  });

  const stData = subs.map((s) => (bySub[s].st.length ? (bySub[s].st.reduce((a, b) => a + b) / bySub[s].st.length).toFixed(1) : 0));
  const stColors = stData.map((v) => (v >= 10 ? 'rgba(34,197,94,0.7)' : v < 3 ? 'rgba(204,31,31,0.7)' : 'rgba(249,115,22,0.7)'));

  destroyChart(charts, 'stChart');
  charts.stChart = new Chart(document.getElementById('stChart'), {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [{ label: 'Sell-Through %', data: stData, backgroundColor: stColors, borderWidth: 0 }]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  const monthlyBuys = months.map((m) => {
    const recs = factRecords.filter((r) => r.Month === m);
    return recs.reduce((s, r) => s + (r.Detail_Buys || 0), 0);
  });
  const monthlySells = months.map((m) => {
    const recs = factRecords.filter((r) => r.Month === m);
    return recs.reduce((s, r) => s + (r.Detail_Sells || 0), 0);
  });

  destroyChart(charts, 'trend');
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Total Buys', data: monthlyBuys, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, fill: true },
        { label: 'Total Sells', data: monthlySells, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });

  const tbody = document.getElementById('bbTableBody');
  tbody.innerHTML = '';
  aiSummary
    .sort((a, b) => (b.Sells_LatestMo || 0) - (a.Sells_LatestMo || 0))
    .forEach((r) => {
      const flagClass = {
        'Strong Turner': 'strong',
        'High Sell-Through': 'high',
        'Low Sell-Through': 'low',
        Normal: 'normal',
        'No Data': 'nodata'
      }[r.Flag] || 'normal';

      tbody.innerHTML += `<tr>
      <td style="color:var(--gray);font-size:11px">${r.Subcategory}</td>
      <td>${r.Detail}</td>
      <td style="color:var(--blue)">${r.Buys_LatestMo ?? '--'}</td>
      <td style="color:var(--green)">${r.Sells_LatestMo ?? '--'}</td>
      <td>${r.OnHand_EOM ?? '--'}</td>
      <td>${r.SellThrough_Pct != null ? `${r.SellThrough_Pct}%` : '--'}</td>
      <td>${r.TurnRate ?? '--'}</td>
      <td><span class="flag ${flagClass}">${r.Flag}</span></td>
    </tr>`;
    });
}
