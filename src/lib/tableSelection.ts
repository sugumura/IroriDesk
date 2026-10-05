/**
 * 表のセル範囲の選択と、選択範囲のコピー（TSV / JSON）。
 * 行・列は表示中の並び（並べ替え後の行、Doc ID 列を先頭にした列）の位置で持つ
 */
import type { DisplayDocument, DisplayValue } from "./api";
import { displayKey } from "./display";
import { cellText, quote } from "./export";

export interface Cell {
  row: number;
  col: number;
}

/** anchor は範囲の起点（Shift で広げても動かない）、focus は現在のセル */
export interface CellRange {
  anchor: Cell;
  focus: Cell;
}

export interface Bounds {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** 列の指定。null は Doc ID（UID）の列、文字列はフィールド名 */
export type ColumnKey = string | null;

export function single(row: number, col: number): CellRange {
  return { anchor: { row, col }, focus: { row, col } };
}

export function bounds(range: CellRange): Bounds {
  return {
    r0: Math.min(range.anchor.row, range.focus.row),
    r1: Math.max(range.anchor.row, range.focus.row),
    c0: Math.min(range.anchor.col, range.focus.col),
    c1: Math.max(range.anchor.col, range.focus.col),
  };
}

export function contains(b: Bounds, row: number, col: number): boolean {
  return row >= b.r0 && row <= b.r1 && col >= b.c0 && col <= b.c1;
}

export function selectAll(rows: number, cols: number): CellRange | null {
  if (rows === 0 || cols === 0) return null;
  return { anchor: { row: 0, col: 0 }, focus: { row: rows - 1, col: cols - 1 } };
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

/** focus を target に動かす。extend なら anchor はそのまま（Shift で範囲を広げる） */
export function moveTo(range: CellRange, target: Cell, extend: boolean, rows: number, cols: number): CellRange {
  const focus = { row: clamp(target.row, rows - 1), col: clamp(target.col, cols - 1) };
  return { anchor: extend ? range.anchor : focus, focus };
}

/** 行や列が減ったときに、範囲を表の内側に収める */
export function clampRange(range: CellRange, rows: number, cols: number): CellRange | null {
  if (rows === 0 || cols === 0) return null;
  const fit = (c: Cell) => ({ row: clamp(c.row, rows - 1), col: clamp(c.col, cols - 1) });
  return { anchor: fit(range.anchor), focus: fit(range.focus) };
}

function valueAt(doc: DisplayDocument, key: ColumnKey): DisplayValue | undefined {
  return key === null ? doc.id : doc.fields[key];
}

/**
 * TSV（表計算ソフトにそのまま貼り付けられる形）。
 * 1セルなら値だけ、複数セルなら見出し行を付ける。map / array などは JSON 文字列
 */
export function rangeToTsv(docs: DisplayDocument[], columns: ColumnKey[], b: Bounds, idLabel: string): string {
  const keys = columns.slice(b.c0, b.c1 + 1);
  const rows = docs.slice(b.r0, b.r1 + 1);
  if (rows.length === 1 && keys.length === 1) return cellText(valueAt(rows[0], keys[0]));
  const header = keys.map((k) => (k === null ? idLabel : displayKey(k)));
  const lines = [header, ...rows.map((d) => keys.map((k) => cellText(valueAt(d, k))))];
  return lines.map((cols) => cols.map((c) => quote(c, "\t")).join("\t")).join("\n");
}

/**
 * JSON（エクスポートと同じ表示用JSON。型情報を保つ）。
 * 1セルなら値だけ、それ以外は行ごとのオブジェクトの配列（__id と __path は常に含める）
 */
export function rangeToJson(docs: DisplayDocument[], columns: ColumnKey[], b: Bounds): string {
  const keys = columns.slice(b.c0, b.c1 + 1);
  const rows = docs.slice(b.r0, b.r1 + 1);
  if (rows.length === 1 && keys.length === 1) {
    return JSON.stringify(valueAt(rows[0], keys[0]) ?? null, null, 2);
  }
  const fieldKeys = keys.filter((k): k is string => k !== null);
  return JSON.stringify(
    rows.map((d) => ({
      __id: d.id,
      __path: d.path,
      ...Object.fromEntries(fieldKeys.filter((k) => k in d.fields).map((k) => [k, d.fields[k]])),
    })),
    null,
    2,
  );
}
