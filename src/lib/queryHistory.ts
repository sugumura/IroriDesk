import type { QuerySpec, WhereClause } from "./api";

export const MAX_HISTORY = 20;

export interface HistoryEntry {
  spec: QuerySpec;
  /** 最後に実行した日時（ISO） */
  ranAt: string;
}

/** 前後の空白や空の条件行の違いを無視して、同じクエリかどうかを比べるための形 */
function normalize(spec: QuerySpec): QuerySpec {
  return {
    targetKind: spec.targetKind,
    target: spec.target.trim(),
    where: spec.where
      .filter((w) => w.field.trim())
      .map((w) => ({ ...w, field: w.field.trim(), value: w.valueType === "null" ? "" : w.value })),
    orderBy: spec.orderBy.filter((o) => o.field.trim()).map((o) => ({ ...o, field: o.field.trim() })),
    limit: spec.limit,
  };
}

export function sameQuery(a: QuerySpec, b: QuerySpec): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** 先頭に追加する。同じクエリは先頭へ移し、MAX_HISTORY 件を超えた古いものは捨てる */
export function addToHistory(history: HistoryEntry[], spec: QuerySpec, now = new Date()): HistoryEntry[] {
  const entry = { spec: normalize(spec), ranAt: now.toISOString() };
  return [entry, ...history.filter((h) => !sameQuery(h.spec, spec))].slice(0, MAX_HISTORY);
}

export function whereText(w: WhereClause): string {
  if (w.valueType === "null") return `${w.field} ${w.op} null`;
  const value = w.valueType === "string" && !["in", "not-in", "array-contains-any"].includes(w.op) ? `"${w.value}"` : w.value;
  return `${w.field} ${w.op} ${value}`;
}

/**
 * 一覧に表示する1行の要約。例: logs · level == "error" · seq desc · limit 5
 * noTarget は対象が空のときの表示（画面の言語に合わせて呼び出し側で渡す）。
 * このモジュールは store から読まれるため、i18n（store に依存）は import しない
 */
export function summarizeQuery(spec: QuerySpec, noTarget = "(対象なし)"): string {
  const target = spec.targetKind === "collectionGroup" ? `group(${spec.target})` : spec.target;
  return [
    target || noTarget,
    ...spec.where.map(whereText),
    ...spec.orderBy.map((o) => `${o.field} ${o.direction}`),
    ...(spec.limit ? [`limit ${spec.limit}`] : []),
  ].join(" · ");
}
