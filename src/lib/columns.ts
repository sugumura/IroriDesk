import { splitPath } from "./display";

/**
 * テーブルに表示する列の設定。キーは表示用JSONのフィールド名（トップレベル）。
 * Doc ID 列は常に先頭に固定表示するため含まない
 */
export interface ColumnConfig {
  /** ユーザーが決めた並び順。ここにないフィールドは末尾にデータ上の順で並ぶ */
  order: string[];
  hidden: string[];
}

export const EMPTY_COLUMN_CONFIG: ColumnConfig = { order: [], hidden: [] };

/**
 * 列設定を保存する単位。ドキュメントIDは * に置き換え、
 * users/alice/orders と users/bob/orders で同じ設定を使う
 */
export function columnScope(
  target: { kind: "collection"; path: string } | { kind: "collectionGroup"; id: string },
): string {
  if (target.kind === "collectionGroup") return `group:${target.id}`;
  return splitPath(target.path)
    .map((seg, i) => (i % 2 === 1 ? "*" : seg))
    .join("/");
}

export function columnConfigKey(connectionId: string, scope: string): string {
  return `${connectionId}|${scope}`;
}

/** 設定の並び順を優先し、残りのフィールドをデータ上の順で後ろに付ける */
export function orderedFields(fieldNames: string[], config: ColumnConfig): string[] {
  const present = new Set(fieldNames);
  const head = config.order.filter((k) => present.has(k));
  const inHead = new Set(head);
  return [...head, ...fieldNames.filter((k) => !inHead.has(k))];
}

/** 表示する列（Doc ID を除く）を順に返す */
export function visibleFields(fieldNames: string[], config: ColumnConfig): string[] {
  const hidden = new Set(config.hidden);
  return orderedFields(fieldNames, config).filter((k) => !hidden.has(k));
}

/** 現在の並び（fieldNames 全体の順）の中で key を delta だけ動かした設定を返す */
export function moveField(
  fieldNames: string[],
  config: ColumnConfig,
  key: string,
  delta: -1 | 1,
): ColumnConfig {
  const order = orderedFields(fieldNames, config);
  const i = order.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return config;
  [order[i], order[j]] = [order[j], order[i]];
  // 今回のデータにない過去の並び順も失わないよう、末尾に残す
  const rest = config.order.filter((k) => !order.includes(k));
  return { ...config, order: [...order, ...rest] };
}

export function setFieldHidden(config: ColumnConfig, key: string, hidden: boolean): ColumnConfig {
  const set = new Set(config.hidden);
  if (hidden) set.add(key);
  else set.delete(key);
  return { ...config, hidden: [...set] };
}
