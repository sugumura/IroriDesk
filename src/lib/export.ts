import type { DisplayDocument, DisplayValue } from "./api";
import { asWrapper, displayKey, toExportObject, unionFieldNames } from "./display";

export type ExportFormat = "json" | "csv" | "tsv";

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; extension: string; filterName: string }
> = {
  json: { label: "JSON", extension: "json", filterName: "JSON" },
  csv: { label: "CSV", extension: "csv", filterName: "CSV (カンマ区切り)" },
  tsv: { label: "TSV", extension: "tsv", filterName: "TSV (タブ区切り)" },
};

/** Excel で日本語が文字化けしないよう、CSV/TSV の先頭に付ける */
const BOM = "﻿";
const EOL = "\r\n";

/** 実体のないドキュメント（サブコレクションのみ）はエクスポートしない */
function exportable(docs: DisplayDocument[]): DisplayDocument[] {
  return docs.filter((d) => !d.missing);
}

/** 表示用JSON形式の配列（__id と __path 付き）。型情報を失わない */
export function toJson(docs: DisplayDocument[]): string {
  return JSON.stringify(exportable(docs).map(toExportObject), null, 2) + "\n";
}

/**
 * 表のセルの文字列。スカラー相当の型は値そのもの、map / array / GeoPoint は JSON 文字列。
 * null とフィールドなしはどちらも空欄になる（区別が必要なら JSON を使う）
 */
export function cellText(v: DisplayValue | undefined): string {
  if (v === undefined || v === null) return "";
  const w = asWrapper(v);
  if (w) {
    switch (w.kind) {
      case "int":
      case "double":
        return String(w.value);
      case "timestamp":
      case "ref":
      case "bytes":
        return w.value;
      case "geo":
        return JSON.stringify(w.value);
    }
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** RFC 4180 と同じ規則で、区切り文字・引用符・改行を含むときだけ引用する */
function quote(text: string, delimiter: string): string {
  if (text.includes(delimiter) || /["\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * CSV / TSV。列はテーブル表示と同じ（__id、__path、トップレベルのフィールド名の和集合）
 */
export function toDelimited(docs: DisplayDocument[], delimiter: "," | "\t"): string {
  const rows = exportable(docs);
  const fields = unionFieldNames(rows);
  const header = ["__id", "__path", ...fields.map(displayKey)];
  const lines = [header, ...rows.map((d) => [d.id, d.path, ...fields.map((f) => cellText(d.fields[f]))])];
  return BOM + lines.map((cols) => cols.map((c) => quote(c, delimiter)).join(delimiter)).join(EOL) + EOL;
}

export function exportContents(docs: DisplayDocument[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return toJson(docs);
    case "csv":
      return toDelimited(docs, ",");
    case "tsv":
      return toDelimited(docs, "\t");
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 例: users_alice_orders_20260928-153000.csv */
export function defaultFileName(base: string, format: ExportFormat, now = new Date()): string {
  const safe = base.replace(/[/\\:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "export";
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${safe}_${ts}.${EXPORT_FORMATS[format].extension}`;
}
