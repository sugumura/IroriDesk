/**
 * JSON テキストをシンタックスハイライトした HTML にする。
 * 大量の行でも軽いよう React 要素ではなく文字列で組み立て、すべての部分を HTML エスケープする
 */

const TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/** 色は Tailwind のクラスで指定する（ライト/ダーク両対応） */
export const JSON_TOKEN_CLASS = {
  key: "text-sky-700 dark:text-sky-300",
  /** $timestamp などの型ラッパーのキー */
  wrapperKey: "text-fuchsia-700 dark:text-fuchsia-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  boolean: "text-violet-700 dark:text-violet-300",
  null: "text-muted-foreground italic",
} as const;

const WRAPPER_KEYS = new Set(['"$int"', '"$double"', '"$timestamp"', '"$bytes"', '"$ref"', '"$geo"']);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const span = (cls: string, text: string) => `<span class="${cls}">${escapeHtml(text)}</span>`;

export function highlightJson(json: string): string {
  let out = "";
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    out += escapeHtml(json.slice(last, index));
    const [whole, str, colon, bool, nul, num] = m;
    if (str !== undefined) {
      if (colon !== undefined) {
        out += span(WRAPPER_KEYS.has(str) ? JSON_TOKEN_CLASS.wrapperKey : JSON_TOKEN_CLASS.key, str);
        out += escapeHtml(colon);
      } else {
        out += span(JSON_TOKEN_CLASS.string, str);
      }
    } else if (bool !== undefined) {
      out += span(JSON_TOKEN_CLASS.boolean, bool);
    } else if (nul !== undefined) {
      out += span(JSON_TOKEN_CLASS.null, nul);
    } else if (num !== undefined) {
      out += span(JSON_TOKEN_CLASS.number, num);
    } else {
      out += escapeHtml(whole);
    }
    last = index + whole.length;
  }
  return out + escapeHtml(json.slice(last));
}
