import { chartDefaults } from './config.js';

function destroyChart(charts, id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

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
    return recs.reduce((s, r) => s + (r.Detail_Sells || 0), 0);
  });
  const monthlySells = months.map((m) => {
    const recs = factRecords.filter((r) => r.Month === m);
    return recs.reduce((s, r) => s + (r.Detail_Buys || 0), 0);
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

export function buildAging(aiSummary, factRecords, months, charts) {
  document.getElementById('ag-empty').style.display = 'none';
  document.getElementById('ag-content').style.display = 'block';

  const fresh = aiSummary.filter((r) => r.TurnRate !== null && r.TurnRate >= 2).length;
  const aging = aiSummary.filter((r) => r.TurnRate !== null && r.TurnRate >= 1 && r.TurnRate < 2).length;
  const old = aiSummary.filter((r) => r.TurnRate !== null && r.TurnRate >= 0.5 && r.TurnRate < 1).length;
  const dead = aiSummary.filter((r) => r.TurnRate !== null && r.TurnRate < 0.5).length;
  const total = aiSummary.filter((r) => r.TurnRate !== null).length || 1;

  document.getElementById('ag-fresh').textContent = `${Math.round((fresh / total) * 100)}%`;
  document.getElementById('ag-aging').textContent = `${Math.round((aging / total) * 100)}%`;
  document.getElementById('ag-old').textContent = `${Math.round((old / total) * 100)}%`;
  document.getElementById('ag-dead').textContent = `${Math.round((dead / total) * 100)}%`;

  destroyChart(charts, 'agingDonut');
  charts.agingDonut = new Chart(document.getElementById('agingDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Fresh (Turn >=2)', 'Normal (1-2)', 'Aging (0.5-1)', 'Dead (<0.5)'],
      datasets: [{ data: [fresh, aging, old, dead], backgroundColor: ['#22c55e', '#3b82f6', '#f97316', '#cc1f1f'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { family: 'JetBrains Mono', size: 10 }, padding: 12 } } } }
  });

  const ghosts = aiSummary
    .filter((r) => (r.SellThrough_Pct !== null && r.SellThrough_Pct < 3) && (r.OnHand_EOM !== null && r.OnHand_EOM > 50))
    .sort((a, b) => b.OnHand_EOM - a.OnHand_EOM);

  const ghostPct = Math.round((ghosts.length / aiSummary.length) * 100);
  document.getElementById('ag-ghostPct').textContent = `${ghostPct}%`;
  document.getElementById('ag-ghostCount').textContent = `${ghosts.length} categories`;

  const ghostList = document.getElementById('ghostList');
  ghostList.innerHTML = '';
  ghosts.slice(0, 8).forEach((r) => {
    ghostList.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;flex:1">${r.Detail}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--red);margin-left:12px">${r.OnHand_EOM} on hand</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--gray);margin-left:12px">${r.SellThrough_Pct}% ST</span>
    </div>`;
  });

  const topSubs = [...new Set(aiSummary.sort((a, b) => (b.OnHand_EOM || 0) - (a.OnHand_EOM || 0)).map((r) => r.Subcategory))].slice(0, 6);
  const colors = ['#cc1f1f', '#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#8b5cf6'];

  const datasets = topSubs.map((sub, i) => {
    const data = months.map((m) => {
      const rec = factRecords.find((r) => r.Subcategory === sub && r.Month === m);
      return rec ? rec.SubCat_EOM : null;
    });

    return {
      label: sub.replace('Accessories ', '').replace('Womens ', 'W. ').replace('Mens ', 'M. '),
      data,
      borderColor: colors[i],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 2
    };
  });

  destroyChart(charts, 'invTrend');
  charts.invTrend = new Chart(document.getElementById('invTrendChart'), {
    type: 'line',
    data: { labels: months, datasets },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false }
  });
}

export function buildEventReadiness(aiSummary, charts) {
  document.getElementById('ev-empty').style.display = 'none';
  document.getElementById('ev-content').style.display = 'block';

  const scored = aiSummary
    .map((r) => {
      const tr = r.TurnRate || 0;
      const st = r.SellThrough_Pct || 0;
      const onHand = r.OnHand_EOM || 0;
      const score = Math.min(100, Math.round((tr * 30) + (st * 3) + (onHand > 50 ? 20 : onHand > 20 ? 10 : 0)));
      let status = 'Not Ready';
      if (score >= 60) status = 'Ready';
      else if (score >= 35) status = 'Caution';
      return { ...r, readinessScore: score, status };
    })
    .sort((a, b) => b.readinessScore - a.readinessScore);

  const ready = scored.filter((r) => r.status === 'Ready').length;
  const caution = scored.filter((r) => r.status === 'Caution').length;
  const notReady = scored.filter((r) => r.status === 'Not Ready').length;

  document.getElementById('ev-ready').textContent = ready;
  document.getElementById('ev-caution').textContent = caution;
  document.getElementById('ev-notready').textContent = notReady;

  const list = document.getElementById('readinessList');
  list.innerHTML = '';
  scored.slice(0, 20).forEach((r) => {
    const color = r.status === 'Ready' ? 'var(--green)' : r.status === 'Caution' ? 'var(--yellow)' : 'var(--red)';
    list.innerHTML += `<div class="readiness-row">
      <div class="readiness-name" title="${r.Detail}">${r.Detail}</div>
      <div class="readiness-bar-wrap">
        <div class="readiness-bar" style="width:${r.readinessScore}%;background:${color}">
          <span class="readiness-bar-val">${r.readinessScore}</span>
        </div>
      </div>
      <div class="readiness-status" style="color:${color}">${r.status}</div>
    </div>`;
  });

  const top10 = scored.filter((r) => r.status === 'Ready').slice(0, 10);
  destroyChart(charts, 'evReady');
  charts.evReady = new Chart(document.getElementById('evReadyChart'), {
    type: 'bar',
    data: {
      labels: top10.map((r) => r.Detail.substring(0, 16)),
      datasets: [{ label: 'Readiness Score', data: top10.map((r) => r.readinessScore), backgroundColor: 'rgba(34,197,94,0.7)', borderColor: '#22c55e', borderWidth: 1 }]
    },
    options: { ...chartDefaults, responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  const tbody = document.getElementById('evBuyBody');
  tbody.innerHTML = '';
  scored.slice(0, 15).forEach((r) => {
    let rec = 'Hold';
    if (r.status === 'Ready' && (r.TurnRate || 0) >= 1) rec = 'Buy More';
    else if (r.status === 'Caution') rec = 'Monitor';
    else if (r.status === 'Not Ready') rec = 'Stop Buying';

    const recColor = rec === 'Buy More' ? 'var(--green)' : rec === 'Stop Buying' ? 'var(--red)' : rec === 'Monitor' ? 'var(--yellow)' : 'var(--gray)';
    tbody.innerHTML += `<tr>
      <td style="font-size:11px">${r.Detail}</td>
      <td>${r.OnHand_EOM ?? '--'}</td>
      <td>${r.TurnRate ?? '--'}</td>
      <td style="color:var(--green)">${r.Total3Mo_Sells ?? '--'}</td>
      <td style="color:${recColor};font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600">${rec}</td>
    </tr>`;
  });
}
