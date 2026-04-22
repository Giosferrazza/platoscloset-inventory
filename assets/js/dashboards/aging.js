import { chartDefaults } from '../config.js';
import { destroyChart } from './chartUtils.js';

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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { family: 'JetBrains Mono', size: 10 }, padding: 12 } } }
    }
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
