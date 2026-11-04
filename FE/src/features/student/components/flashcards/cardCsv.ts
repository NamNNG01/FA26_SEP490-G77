/** Columns of the card import file, fixed by the BE (FC-07). */
export const CARD_CSV_HEADER = ['front', 'back', 'code_language', 'code_body'];

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Saves rows as a CSV file (with a BOM so Excel opens Vietnamese text as UTF-8). */
export function downloadCsv(rows: string[][], fileName: string) {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
