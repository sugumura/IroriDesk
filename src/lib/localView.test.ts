import { describe, expect, it } from "vitest";
import type { DisplayDocument, DisplayValue } from "./api";
import { compareValues, filterDocs } from "./localView";

const sortAsc = (values: (DisplayValue | undefined)[], desc = false) =>
  [...values].sort((a, b) => compareValues(a, b, desc));

describe("compareValues", () => {
  it("sorts numbers numerically, including $int and $double", () => {
    expect(sortAsc([10, 2, { $int: "9007199254740993" }, { $double: 1 }, 2.5])).toEqual([
      { $double: 1 },
      2,
      2.5,
      10,
      { $int: "9007199254740993" },
    ]);
  });

  it("sorts timestamps chronologically and strings naturally", () => {
    expect(
      sortAsc([{ $timestamp: "2026-03-01T00:00:00.000000Z" }, { $timestamp: "2026-01-01T00:00:00.000000Z" }]),
    ).toEqual([{ $timestamp: "2026-01-01T00:00:00.000000Z" }, { $timestamp: "2026-03-01T00:00:00.000000Z" }]);
    expect(sortAsc(["item10", "item2", "Item1"])).toEqual(["Item1", "item2", "item10"]);
  });

  it("keeps null and missing values last in both directions", () => {
    expect(sortAsc([null, 3, undefined, 1])).toEqual([1, 3, null, undefined]);
    expect(sortAsc([null, 3, undefined, 1], true)).toEqual([3, 1, null, undefined]);
  });

  it("orders different types consistently (bool < number < time < text)", () => {
    expect(sortAsc(["a", 1, true, { $timestamp: "2026-01-01T00:00:00.000000Z" }])).toEqual([
      true,
      1,
      { $timestamp: "2026-01-01T00:00:00.000000Z" },
      "a",
    ]);
  });
});

describe("filterDocs", () => {
  const doc = (id: string, fields: DisplayDocument["fields"]): DisplayDocument => ({
    id,
    path: `users/${id}`,
    name: `projects/p/databases/(default)/documents/users/${id}`,
    fields,
    createTime: null,
    updateTime: null,
    missing: false,
  });
  const docs = [
    doc("alice", { name: "Alice", tags: ["admin"], profile: { city: "Tokyo" } }),
    doc("bob", { name: "Bob", age: 25 }),
  ];

  it("matches id, path, and nested values case-insensitively", () => {
    expect(filterDocs(docs, "ALI").map((d) => d.id)).toEqual(["alice"]);
    expect(filterDocs(docs, "tokyo").map((d) => d.id)).toEqual(["alice"]);
    expect(filterDocs(docs, "25").map((d) => d.id)).toEqual(["bob"]);
    expect(filterDocs(docs, "users/").map((d) => d.id)).toEqual(["alice", "bob"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterDocs(docs, "  ")).toBe(docs);
  });
});
