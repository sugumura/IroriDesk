import type { DisplayDocument, DisplayValue, QueryValueType } from "./api";
import { asWrapper, displayKey, isPlainObject } from "./display";

export interface FieldInfo {
  /** クエリのフィールド欄にそのまま入れられるパス */
  path: string;
  /** サンプルから推定した値の型。型が混在していれば null */
  valueType: QueryValueType | null;
  /** 表示用の型名 */
  typeLabel: string;
  /** サンプル中で値を持っていたドキュメント数 */
  count: number;
}

const MAX_DEPTH = 4;
const SIMPLE_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Rust の to_field_path と同じ規則で、必要なときだけバッククォートで囲む */
export function joinFieldPath(segments: string[]): string {
  // `.` や ` を含むキーがあるときだけ全体を明示的にクォートする（Rust 側はそのまま使う）
  const needsQuote = segments.some((s) => /[.`\\]/.test(s));
  if (!needsQuote) return segments.join(".");
  return segments
    .map((s) => (SIMPLE_SEGMENT.test(s) ? s : `\`${s.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``))
    .join(".");
}

function inferType(v: DisplayValue): { valueType: QueryValueType | null; label: string } {
  const w = asWrapper(v);
  if (w) {
    switch (w.kind) {
      case "int":
        return { valueType: "integer", label: "integer" };
      case "double":
        return { valueType: "double", label: "double" };
      case "timestamp":
        return { valueType: "timestamp", label: "timestamp" };
      case "ref":
        return { valueType: "reference", label: "reference" };
      case "geo":
        return { valueType: null, label: "geo" };
      case "bytes":
        return { valueType: null, label: "bytes" };
    }
  }
  if (v === null) return { valueType: "null", label: "null" };
  if (typeof v === "boolean") return { valueType: "boolean", label: "boolean" };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { valueType: "integer", label: "integer" }
      : { valueType: "double", label: "double" };
  if (typeof v === "string") return { valueType: "string", label: "string" };
  if (Array.isArray(v)) {
    // array-contains 用に要素の型を推定する
    const inner = v.length > 0 ? inferType(v[0]) : { valueType: null, label: "" };
    return { valueType: inner.valueType, label: "array" };
  }
  return { valueType: null, label: "map" };
}

/** サンプルのドキュメントからフィールドパスの一覧を作る（出現数の多い順） */
export function collectFields(docs: DisplayDocument[]): FieldInfo[] {
  const map = new Map<string, FieldInfo>();

  // 1つのドキュメント内で同じパスは1度しか現れないので、出現回数 = ドキュメント数
  const visit = (value: DisplayValue, segments: string[]) => {
    const path = joinFieldPath(segments);
    const { valueType, label } = inferType(value);
    const prev = map.get(path);
    if (!prev) {
      map.set(path, { path, valueType, typeLabel: label, count: 1 });
    } else {
      prev.count++;
      // null は欠損値として扱い、型の混在とはみなさない
      if (prev.typeLabel === "null") {
        prev.typeLabel = label;
        prev.valueType = valueType;
      } else if (label !== "null" && prev.typeLabel !== label) {
        prev.typeLabel = "mixed";
        prev.valueType = null;
      }
    }
    if (isPlainObject(value) && !asWrapper(value) && segments.length < MAX_DEPTH) {
      for (const [k, v] of Object.entries(value)) visit(v, [...segments, displayKey(k)]);
    }
  };

  for (const d of docs) {
    for (const [k, v] of Object.entries(d.fields)) visit(v, [displayKey(k)]);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

/** 全ドキュメントで使える特殊フィールド */
export const NAME_FIELD: FieldInfo = {
  path: "__name__",
  valueType: "string",
  typeLabel: "ドキュメントID",
  count: 0,
};
