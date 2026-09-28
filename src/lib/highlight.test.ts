import { describe, expect, it } from "vitest";
import { highlightJson, JSON_TOKEN_CLASS as C } from "./highlight";

/** HTML からタグを取り除き、エスケープを戻す（元の JSON と一致するはず） */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("highlightJson", () => {
  const json = JSON.stringify(
    {
      name: "Alice <b>&\"x\"",
      age: -1.5e3,
      ok: true,
      none: null,
      at: { $timestamp: "2026-01-01T00:00:00.000000Z" },
      $$ref: "escaped",
      "a\\\"b": ["true", 0],
    },
    null,
    2,
  );
  const html = highlightJson(json);

  it("round-trips to the original text", () => {
    expect(plain(html)).toBe(json);
  });

  it("escapes HTML in values and keys", () => {
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;&amp;");
  });

  it("classifies tokens", () => {
    expect(html).toContain(`<span class="${C.key}">&quot;name&quot;</span>:`);
    expect(html).toContain(`<span class="${C.number}">-1500</span>`);
    expect(html).toContain(`<span class="${C.boolean}">true</span>`);
    expect(html).toContain(`<span class="${C.null}">null</span>`);
    expect(html).toContain(`<span class="${C.wrapperKey}">&quot;$timestamp&quot;</span>`);
    // エスケープ済みの $$ キーは通常のキー、文字列の "true" は文字列
    expect(html).toContain(`<span class="${C.key}">&quot;$$ref&quot;</span>`);
    expect(html).toContain(`<span class="${C.string}">&quot;true&quot;</span>`);
  });
});
