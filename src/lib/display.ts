import type { ConnectionConfig, DisplayDocument, DisplayValue } from "./api";

export type Wrapper =
  | { kind: "int"; value: string }
  | { kind: "double"; value: number | string }
  | { kind: "timestamp"; value: string }
  | { kind: "bytes"; value: string }
  | { kind: "ref"; value: string }
  | { kind: "geo"; value: { lat: number; lng: number } };

const WRAPPER_KEYS = new Set(["$int", "$double", "$timestamp", "$bytes", "$ref", "$geo"]);

export function isPlainObject(v: DisplayValue): v is { [key: string]: DisplayValue } {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** キーが1つだけの `$` ラッパーなら中身を返す */
export function asWrapper(v: DisplayValue): Wrapper | null {
  if (!isPlainObject(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1 || !WRAPPER_KEYS.has(keys[0])) return null;
  const key = keys[0];
  return { kind: key.slice(1), value: v[key] } as Wrapper;
}

/** `$$x` → `$x`（表示用JSONのキーのエスケープを外して画面に出す） */
export function displayKey(key: string): string {
  return key.startsWith("$$") ? key.slice(1) : key;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** ローカル時刻で `YYYY-MM-DD HH:mm:ss.SSS` */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

export function databaseId(conn: ConnectionConfig): string {
  return conn.databaseId?.trim() || "(default)";
}

/** 同じプロジェクト・DB への参照なら相対パスを返す。別DBなら null */
export function refToLocalPath(ref: string, conn: ConnectionConfig): string | null {
  const m = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/.exec(ref);
  if (!m) return null;
  if (m[1] !== conn.projectId.trim() || m[2] !== databaseId(conn)) return null;
  return m[3];
}

export function base64ByteLength(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** テーブルのセルなど1行で見せるための短い文字列 */
export function compactText(v: DisplayValue, max = 120): string {
  const w = asWrapper(v);
  if (w) {
    switch (w.kind) {
      case "int":
      case "double":
        return String(w.value);
      case "timestamp":
        return formatTimestamp(w.value);
      case "bytes":
        return `bytes(${base64ByteLength(w.value)})`;
      case "ref":
        return w.value.replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\//, "");
      case "geo":
        return `${w.value.lat}, ${w.value.lng}`;
    }
  }
  if (v === null) return "null";
  if (typeof v === "string") return v.length > max ? `${v.slice(0, max)}…` : v;
  if (typeof v !== "object") return String(v);
  const s = JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 取得したドキュメントのトップレベルのフィールド名の和集合（出現順） */
export function unionFieldNames(docs: DisplayDocument[]): string[] {
  const seen = new Set<string>();
  for (const d of docs) for (const k of Object.keys(d.fields)) seen.add(k);
  return [...seen];
}

/** エクスポート／JSON表示用の形式 */
export function toExportObject(d: DisplayDocument): Record<string, DisplayValue> {
  return { __id: d.id, __path: d.path, ...d.fields };
}

export function isCollectionPath(path: string): boolean {
  return splitPath(path).length % 2 === 1;
}

export function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

export function parentCollectionPath(docPath: string): string {
  return splitPath(docPath).slice(0, -1).join("/");
}
