import type { Workbook, Worksheet } from 'exceljs';

/**
 * Flashcard decks as a readable Excel workbook (manager and student export).
 *
 *  - "Overview" sheet: one row per deck, the deck name links to its sheet.
 *  - One sheet per deck: the deck info on top, then a # / Front / Back table
 *    (plus Language / Code columns when a card has code).
 *
 * exceljs is loaded only when an export runs.
 */

export interface XlsxCard {
  frontText: string | null;
  backText: string | null;
  codeLanguage?: string | null;
  codeBody?: string | null;
}

export interface XlsxDeck {
  title: string;
  courseName?: string | null;
  ownerName?: string | null;
  /** Shown as is, e.g. "Public" / "Private". */
  visibility?: string | null;
  /** Shown as is, e.g. "Flashcard" / "Code snippet". */
  mode?: string | null;
  description?: string | null;
  cards: XlsxCard[];
}

const BRAND = 'FF0D7C6C';
const BRAND_LIGHT = 'FFE6F2F0';
const STRIPE = 'FFF7F9F9';
const BORDER = 'FFD5DCDB';
const MUTED = 'FF5F6B6A';

const thin = { style: 'thin' as const, color: { argb: BORDER } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** Excel sheet names: max 31 chars, none of []:*?/\ , unique in the workbook. */
function sheetName(title: string, used: Set<string>) {
  const base = (title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Deck').slice(0, 28);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28 - String(n).length - 1)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

function styleHeader(ws: Worksheet, rowNumber: number, columns: number) {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
    cell.border = box;
  }
}

function styleBody(ws: Worksheet, from: number, to: number, columns: number, monoColumns: number[] = []) {
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= columns; c++) {
      const cell = row.getCell(c);
      cell.border = box;
      cell.alignment = { vertical: 'top', horizontal: c === 1 ? 'center' : 'left', wrapText: true };
      if (monoColumns.includes(c)) cell.font = { name: 'Consolas' };
      if ((r - from) % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
    }
  }
}

function addDeckSheet(wb: Workbook, deck: XlsxDeck, name: string, linkBack: boolean) {
  const hasCode = deck.cards.some(c => c.codeBody?.trim());
  const ws = wb.addWorksheet(name);
  ws.columns = hasCode
    ? [{ width: 6 }, { width: 40 }, { width: 40 }, { width: 12 }, { width: 55 }]
    : [{ width: 6 }, { width: 50 }, { width: 60 }];
  const columns = hasCode ? 5 : 3;

  ws.mergeCells(1, 1, 1, columns);
  const title = ws.getCell(1, 1);
  title.value = deck.title;
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  ws.getRow(1).height = 26;

  const info: [string, string][] = [
    ['Course', deck.courseName || 'Personal'],
    ...(deck.ownerName ? ([['Owner', deck.ownerName]] as [string, string][]) : []),
    ...(deck.mode ? ([['Type', deck.mode]] as [string, string][]) : []),
    ...(deck.visibility ? ([['Visibility', deck.visibility]] as [string, string][]) : []),
    ['Cards', String(deck.cards.length)],
    ...(deck.description?.trim() ? ([['Description', deck.description.trim()]] as [string, string][]) : []),
  ];
  let r = 2;
  for (const [label, value] of info) {
    ws.getCell(r, 1).value = label;
    ws.mergeCells(r, 2, r, columns);
    const labelCell = ws.getCell(r, 1);
    labelCell.font = { bold: true, color: { argb: MUTED } };
    const valueCell = ws.getCell(r, 2);
    valueCell.value = value;
    valueCell.alignment = { wrapText: true, vertical: 'top' };
    r++;
  }
  if (linkBack) {
    const back = ws.getCell(r, 2);
    back.value = { text: '← Back to overview', hyperlink: "#'Overview'!A1" };
    back.font = { color: { argb: BRAND }, underline: true };
    r++;
  }

  const headerRow = r + 1;
  ws.getRow(headerRow).values = hasCode ? ['#', 'Front', 'Back', 'Language', 'Code'] : ['#', 'Front', 'Back'];
  styleHeader(ws, headerRow, columns);
  deck.cards.forEach((c, i) => {
    const values: (string | number)[] = [i + 1, c.frontText ?? '', c.backText ?? ''];
    if (hasCode) values.push(c.codeLanguage ?? '', c.codeBody ?? '');
    ws.getRow(headerRow + 1 + i).values = values;
  });
  styleBody(ws, headerRow + 1, headerRow + deck.cards.length, columns, hasCode ? [5] : []);
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}` };
}

function addOverviewSheet(wb: Workbook, decks: XlsxDeck[], names: string[]) {
  const ws = wb.addWorksheet('Overview');
  ws.columns = [{ width: 6 }, { width: 42 }, { width: 32 }, { width: 10 }, { width: 24 }, { width: 12 }, { width: 50 }];
  ws.mergeCells(1, 1, 1, 7);
  const title = ws.getCell(1, 1);
  title.value = 'Flashcard decks';
  title.font = { bold: true, size: 16, color: { argb: BRAND } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, 7);
  ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString()} · ${decks.length} deck${decks.length === 1 ? '' : 's'}`;
  ws.getCell(2, 1).font = { color: { argb: MUTED } };

  const headerRow = 4;
  ws.getRow(headerRow).values = ['#', 'Deck', 'Course', 'Cards', 'Owner', 'Visibility', 'Description'];
  styleHeader(ws, headerRow, 7);
  decks.forEach((d, i) => {
    const row = ws.getRow(headerRow + 1 + i);
    row.values = [i + 1, d.title, d.courseName || 'Personal', d.cards.length, d.ownerName ?? '', d.visibility ?? '', d.description?.trim() ?? ''];
  });
  styleBody(ws, headerRow + 1, headerRow + decks.length, 7);
  decks.forEach((d, i) => {
    const cell = ws.getCell(headerRow + 1 + i, 2);
    cell.value = { text: d.title, hyperlink: `#'${names[i].replace(/'/g, "''")}'!A1` };
    cell.font = { color: { argb: BRAND }, underline: true };
  });
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + decks.length, column: 7 } };
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  // Total row.
  const total = ws.getRow(headerRow + decks.length + 1);
  total.getCell(3).value = 'Total cards';
  total.getCell(4).value = decks.reduce((n, d) => n + d.cards.length, 0);
  total.getCell(3).font = total.getCell(4).font = { bold: true };
  total.getCell(3).fill = total.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } };
}

/**
 * Builds and downloads the workbook. One deck → just its sheet; several → Overview + one sheet each.
 */
export async function downloadDecksXlsx(decks: XlsxDeck[], fileName: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PrepExam';
  wb.created = new Date();
  const used = new Set<string>(['overview']);
  const names = decks.map(d => sheetName(d.title, used));
  const several = decks.length > 1;
  if (several) addOverviewSheet(wb, decks, names);
  decks.forEach((d, i) => addDeckSheet(wb, d, names[i], several));

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A safe file name part from a deck title. */
export const fileSlug = (s: string) =>
  s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'deck';
