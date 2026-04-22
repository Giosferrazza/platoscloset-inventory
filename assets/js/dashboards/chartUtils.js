export function destroyChart(charts, id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}
