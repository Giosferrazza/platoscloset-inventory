export function cn(v) {
  if (v === undefined || v === null) return null;
  const s = v.toString().trim().replace(/,/g, '').replace(/\$/g, '').replace(/%/g, '');
  if (['-', 'nan', ''].includes(s)) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

export function parseCSV(text) {
  const rows = [];
  let cur = '';
  let inQ = false;
  let row = [];

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === ',' && !inQ) {
      row.push(cur);
      cur = '';
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (cur || row.length) {
        row.push(cur);
        rows.push(row);
        cur = '';
        row = [];
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      cur += c;
    }
  }

  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function dlCSV(data, fname) {
  if (!data?.length) return;

  const h = Object.keys(data[0]).join(',');
  const rows = data.map((r) =>
    Object.values(r)
      .map((v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') ? `"${s}"` : s;
      })
      .join(',')
  );

  const blob = new Blob([[h, ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
}
