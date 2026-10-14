/**
 * JSON を文字列にして保存した値（例: `{"id":"m8l…","body":"test"}`）の判定と変換。
 * Firestore 上は string なので、表示用に解析するだけで型は変えない
 */
import type { DisplayValue } from "./api";

/** これより長い文字列は、表示が重くならないよう解析しない */
const MAX_LENGTH = 1024 * 1024;
/** 表のツールチップに出す整形済み JSON の長さの上限 */
const MAX_TOOLTIP = 4000;

const cache = new Map<string, DisplayValue | null>();
const CACHE_SIZE = 500;

/**
 * `{…}` か `[…]` の形で、JSON として解析できる文字列なら、表示用 JSON（$ で始まるキーは $$ にする）を返す。
 * それ以外（"123" や "true" のような単純な値も含む）は null
 */
export function parseJsonString(s: string): DisplayValue | null {
  if (s.length < 2 || s.length > MAX_LENGTH) return null;
  const t = s.trim();
  const first = t[0];
  const last = t[t.length - 1];
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) return null;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  let result: DisplayValue | null = null;
  try {
    result = toDisplay(JSON.parse(t));
  } catch {
    result = null;
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(s, result);
  return result;
}

/** 普通の JSON を表示用 JSON にする。`$timestamp` などの型の目印と区別するため、$ で始まるキーは $$ にする */
function toDisplay(v: unknown): DisplayValue {
  if (Array.isArray(v)) return v.map(toDisplay);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k.startsWith("$") ? `$${k}` : k, toDisplay(x)]),
    );
  }
  return v as DisplayValue;
}

/** 表のツールチップ用に整形した JSON（JSON 文字列でなければ undefined） */
export function prettyJsonString(s: string): string | undefined {
  if (parseJsonString(s) === null) return undefined;
  const pretty = JSON.stringify(JSON.parse(s.trim()), null, 2);
  return pretty.length > MAX_TOOLTIP ? `${pretty.slice(0, MAX_TOOLTIP)}\n…` : pretty;
}
