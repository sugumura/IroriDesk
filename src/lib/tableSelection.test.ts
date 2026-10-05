import { describe, expect, it } from "vitest";
import type { DisplayDocument } from "./api";
import {
  bounds,
  clampRange,
  contains,
  moveTo,
  rangeToJson,
  rangeToTsv,
  selectAll,
  single,
} from "./tableSelection";

function doc(path: string, fields: DisplayDocument["fields"]): DisplayDocument {
  return {
    id: path.split("/").pop()!,
    path,
    name: `projects/p/databases/(default)/documents/${path}`,
    fields,
    createTime: "2026-01-01T00:00:00Z",
    updateTime: "2026-01-01T00:00:00Z",
    missing: false,
  };
}

const docs = [
  doc("users/alice", { name: "Alice", age: 30, tags: ["a", "b"], note: "x\ty" }),
  doc("users/bob", { name: "Bob", createdAt: { $timestamp: "2026-01-01T09:00:00Z" } }),
  doc("users/carol", { name: "Carol", age: 25 }),
];
// Doc ID 列 + name, age, tags, createdAt
const columns = [null, "name", "age", "tags", "createdAt"];

describe("range", () => {
  it("normalizes anchor and focus in any direction", () => {
    const b = bounds({ anchor: { row: 2, col: 3 }, focus: { row: 0, col: 1 } });
    expect(b).toEqual({ r0: 0, r1: 2, c0: 1, c1: 3 });
    expect(contains(b, 1, 2)).toBe(true);
    expect(contains(b, 1, 0)).toBe(false);
  });

  it("moves the focus, and keeps the anchor when extending", () => {
    const r = single(1, 1);
    expect(moveTo(r, { row: 2, col: 1 }, false, 3, 5)).toEqual(single(2, 1));
    expect(moveTo(r, { row: 2, col: 3 }, true, 3, 5)).toEqual({
      anchor: { row: 1, col: 1 },
      focus: { row: 2, col: 3 },
    });
  });

  it("stays inside the table", () => {
    expect(moveTo(single(0, 0), { row: -1, col: 9 }, false, 3, 5)).toEqual(single(0, 4));
    expect(clampRange({ anchor: { row: 5, col: 0 }, focus: { row: 8, col: 7 } }, 3, 5)).toEqual({
      anchor: { row: 2, col: 0 },
      focus: { row: 2, col: 4 },
    });
    expect(clampRange(single(0, 0), 0, 5)).toBeNull();
  });

  it("selects every cell", () => {
    expect(selectAll(3, 5)).toEqual({ anchor: { row: 0, col: 0 }, focus: { row: 2, col: 4 } });
    expect(selectAll(0, 5)).toBeNull();
  });
});

describe("rangeToTsv", () => {
  it("copies a single cell as its value only", () => {
    expect(rangeToTsv(docs, columns, bounds(single(0, 1)), "Doc ID")).toBe("Alice");
    expect(rangeToTsv(docs, columns, bounds(single(1, 4)), "Doc ID")).toBe("2026-01-01T09:00:00Z");
    expect(rangeToTsv(docs, columns, bounds(single(0, 0)), "Doc ID")).toBe("alice");
  });

  it("adds a header row for several cells, with JSON for arrays and blanks for missing fields", () => {
    const b = bounds({ anchor: { row: 0, col: 0 }, focus: { row: 1, col: 3 } });
    // JSON は引用符を含むため、エクスポートの TSV と同じく引用する（表計算ソフトは貼り付け時に元に戻す）
    expect(rangeToTsv(docs, columns, b, "Doc ID")).toBe(
      ["Doc ID\tname\tage\ttags", 'alice\tAlice\t30\t"[""a"",""b""]"', "bob\tBob\t\t"].join("\n"),
    );
  });

  it("quotes values that contain tabs", () => {
    const b = bounds({ anchor: { row: 0, col: 1 }, focus: { row: 0, col: 2 } });
    expect(rangeToTsv([docs[0]], [null, "note", "name"], b, "Doc ID")).toBe('note\tname\n"x\ty"\tAlice');
  });
});

describe("rangeToJson", () => {
  it("copies a single cell as its JSON value", () => {
    expect(rangeToJson(docs, columns, bounds(single(1, 4)))).toBe(
      JSON.stringify({ $timestamp: "2026-01-01T09:00:00Z" }, null, 2),
    );
  });

  it("copies rows with __id, __path and only the selected fields that exist", () => {
    const b = bounds({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } });
    expect(JSON.parse(rangeToJson(docs, columns, b))).toEqual([
      { __id: "bob", __path: "users/bob", name: "Bob" },
      { __id: "carol", __path: "users/carol", name: "Carol", age: 25 },
    ]);
  });
});
