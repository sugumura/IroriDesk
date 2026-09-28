/**
 * 読み込み済みの結果に対する、手元だけの絞り込みと並べ替え（Firestore にはクエリを送らない）
 */
import type { DisplayDocument, DisplayValue } from "./api";
import { asWrapper, compactText } from "./display";

type SortKey =
  | { kind: "number"; value: number }
  | { kind: "time"; value: string }
  | { kind: "bool"; value: number }
  | { kind: "text"; value: string };

/** 型ごとに比べやすい形にする。null / 値なしは undefined（常に末尾） */
function sortKey(v: DisplayValue | undefined): SortKey | undefined {
  if (v === undefined || v === null) return undefined;
  const w = asWrapper(v);
  if (w) {
    if (w.kind === "int") return { kind: "number", value: Number(w.value) };
    if (w.kind === "double") {
      const n = typeof w.value === "number" ? w.value : Number(w.value);
      return Number.isNaN(n) ? undefined : { kind: "number", value: n };
    }
    if (w.kind === "timestamp") return { kind: "time", value: w.value };
    return { kind: "text", value: compactText(v) };
  }
  if (typeof v === "number") return { kind: "number", value: v };
  if (typeof v === "boolean") return { kind: "bool", value: v ? 1 : 0 };
  if (typeof v === "string") return { kind: "text", value: v };
  return { kind: "text", value: compactText(v) };
}

const KIND_ORDER: Record<SortKey["kind"], number> = { bool: 0, number: 1, time: 2, text: 3 };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** 昇順の比較。値のないものは並び順に関係なく末尾にする */
export function compareValues(a: DisplayValue | undefined, b: DisplayValue | undefined, desc = false): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (!ka && !kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  let r: number;
  if (ka.kind !== kb.kind) r = KIND_ORDER[ka.kind] - KIND_ORDER[kb.kind];
  else if (ka.kind === "text" || ka.kind === "time") r = collator.compare(ka.value as string, kb.value as string);
  else r = (ka.value as number) - (kb.value as number);
  return desc ? -r : r;
}

/** ID・パス・フィールドの値に query を含む行だけを残す（大文字小文字は区別しない） */
export function filterDocs(docs: DisplayDocument[], query: string): DisplayDocument[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter(
    (d) =>
      d.id.toLowerCase().includes(q) ||
      d.path.toLowerCase().includes(q) ||
      Object.values(d.fields).some((v) => compactText(v, 10_000).toLowerCase().includes(q)),
  );
}
