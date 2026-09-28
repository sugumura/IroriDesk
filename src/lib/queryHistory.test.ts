import { describe, expect, it } from "vitest";
import type { QuerySpec } from "./api";
import { addToHistory, MAX_HISTORY, sameQuery, summarizeQuery } from "./queryHistory";

const base: QuerySpec = {
  targetKind: "collection",
  target: "logs",
  where: [{ field: "level", op: "==", valueType: "string", value: "error" }],
  orderBy: [{ field: "seq", direction: "desc" }],
  limit: 5,
};

describe("sameQuery", () => {
  it("ignores surrounding spaces and empty rows", () => {
    const messy: QuerySpec = {
      ...base,
      target: " logs ",
      where: [...base.where, { field: " ", op: "==", valueType: "string", value: "" }],
      orderBy: [{ field: " seq", direction: "desc" }, { field: "", direction: "asc" }],
    };
    expect(sameQuery(base, messy)).toBe(true);
    expect(sameQuery(base, { ...base, limit: 6 })).toBe(false);
  });
});

describe("addToHistory", () => {
  it("adds to the front, moves duplicates up, and caps the size", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
    let h = addToHistory([], base, t(0));
    h = addToHistory(h, { ...base, limit: 10 }, t(1));
    h = addToHistory(h, { ...base, target: " logs " }, t(2));
    expect(h).toHaveLength(2);
    expect(h[0].spec.limit).toBe(5);
    expect(h[0].ranAt).toBe(t(2).toISOString());
    expect(h[0].spec.target).toBe("logs");

    for (let i = 0; i < MAX_HISTORY + 5; i++) h = addToHistory(h, { ...base, limit: 100 + i });
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[0].spec.limit).toBe(100 + MAX_HISTORY + 4);
  });
});

describe("summarizeQuery", () => {
  it("renders a compact one-line summary", () => {
    expect(summarizeQuery(base)).toBe('logs · level == "error" · seq desc · limit 5');
    expect(
      summarizeQuery({
        targetKind: "collectionGroup",
        target: "orders",
        where: [
          { field: "tags", op: "array-contains-any", valueType: "string", value: "a,b" },
          { field: "nickname", op: "!=", valueType: "null", value: "" },
        ],
        orderBy: [],
        limit: null,
      }),
    ).toBe("group(orders) · tags array-contains-any a,b · nickname != null");
  });
});
