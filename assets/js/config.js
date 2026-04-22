export const MONTHS_COLS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export const SUBCAT_LABEL = 19;
export const SUBCAT_BOM = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const SUBCAT_SELLS = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];
export const SUBCAT_BUYS = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47];
export const SUBCAT_EOM = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];
export const SUBCAT_ST = [79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91];
export const SUBCAT_TURNRATE = 92;
export const SUBCAT_RETAIL = 48;
export const SUBCAT_AVG_RETAIL = 49;

export const DETAIL_LABEL = 93;
export const DETAIL_BOM = [94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106];
export const DETAIL_SELLS = [124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136];
export const DETAIL_BUYS = [109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121];
export const DETAIL_EOM = [139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151];
export const DETAIL_ST = [153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165];
export const DETAIL_TURNRATE = 166;
export const DETAIL_RETAIL = 122;
export const DETAIL_AVG_RETAIL = 123;

export const chartDefaults = {
  color: '#888',
  borderColor: '#2a2a2a',
  plugins: {
    legend: {
      labels: {
        color: '#888',
        font: { family: 'JetBrains Mono', size: 10 }
      }
    }
  },
  scales: {
    x: {
      ticks: { color: '#888', font: { family: 'JetBrains Mono', size: 9 } },
      grid: { color: '#1a1a1a' },
      border: { color: '#2a2a2a' }
    },
    y: {
      ticks: { color: '#888', font: { family: 'JetBrains Mono', size: 9 } },
      grid: { color: '#1a1a1a' },
      border: { color: '#2a2a2a' }
    }
  }
};
