import { chartDefaults } from '../config.js';
import { destroyChart } from './chartUtils.js';

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
