import { describe, expect, it } from "vitest";
import type { DisplayDocument } from "./api";
import { cellText, defaultFileName, toDelimited, toJson } from "./export";

function doc(path: string, fields: DisplayDocument["fields"], missing = false): DisplayDocument {
  return {
    id: path.split("/").pop()!,
    path,
    name: `projects/p/databases/(default)/documents/${path}`,
    fields,
    createTime: missing ? null : "2026-01-01T00:00:00Z",
    updateTime: missing ? null : "2026-01-01T00:00:00Z",
    missing,
  };
}

const docs = [
  doc("users/alice", {
    name: "Alice, \"A\"",
    age: 30,
    bio: "line1\nline2",
    tabbed: "a\tb",
    createdAt: { $timestamp: "2026-01-01T09:00:00.123456Z" },
    bestFriend: { $ref: "projects/p/databases/(default)/documents/users/bob" },
    big: { $int: "9007199254740993" },
    ratio: { $double: 1 },
    home: { $geo: { lat: 35.5, lng: 139.7 } },
    tags: ["a", "b"],
    profile: { city: "Tokyo" },
    nickname: null,
    $$ref: "escaped",
  }),
  doc("users/bob", { name: "Bob", extra: true }),
  doc("users/ghost", {}, true),
];

describe("cellText", () => {
  it("wrappers become plain values, containers become JSON", () => {
    expect(cellText({ $timestamp: "2026-01-01T00:00:00.000000Z" })).toBe("2026-01-01T00:00:00.000000Z");
    expect(cellText({ $int: "9007199254740993" })).toBe("9007199254740993");
    expect(cellText({ $double: "NaN" })).toBe("NaN");
    expect(cellText({ $bytes: "AAE=" })).toBe("AAE=");
    expect(cellText({ $geo: { lat: 1, lng: 2 } })).toBe('{"lat":1,"lng":2}');
    expect(cellText([1, { a: 2 }])).toBe('[1,{"a":2}]');
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText(false)).toBe("false");
  });
});

describe("toDelimited", () => {
  it("builds CSV with BOM, CRLF, union columns and RFC 4180 quoting", () => {
    const csv = toDelimited(docs, ",");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "__id,__path,name,age,bio,tabbed,createdAt,bestFriend,big,ratio,home,tags,profile,nickname,$ref,extra",
    );
    expect(lines[1]).toBe(
      'alice,users/alice,"Alice, ""A""",30,"line1\nline2",a\tb,2026-01-01T09:00:00.123456Z,' +
        "projects/p/databases/(default)/documents/users/bob,9007199254740993,1," +
        '"{""lat"":35.5,""lng"":139.7}","[""a"",""b""]","{""city"":""Tokyo""}",,escaped,',
    );
    expect(lines[2]).toBe("bob,users/bob,Bob,,,,,,,,,,,,,true");
    // 実体のないドキュメントは出力しない
    expect(csv).not.toContain("ghost");
    expect(lines[3]).toBe("");
  });

  it("builds TSV quoting tabs, quotes and newlines but not commas", () => {
    const tsv = toDelimited(docs, "\t").slice(1);
    const [header, alice, bob] = tsv.split("\r\n");
    expect(header.split("\t").slice(0, 3)).toEqual(["__id", "__path", "name"]);
    expect(alice.startsWith('alice\tusers/alice\t"Alice, ""A"""\t30\t"line1\nline2"\t"a\tb"\t')).toBe(true);
    expect(bob.startsWith("bob\tusers/bob\tBob\t")).toBe(true);
  });

  it("handles an empty result", () => {
    expect(toDelimited([], ",")).toBe("\uFEFF__id,__path\r\n");
  });
});

describe("toJson", () => {
  it("keeps display JSON with __id and __path and skips missing docs", () => {
    const parsed = JSON.parse(toJson(docs));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].__id).toBe("alice");
    expect(parsed[0].__path).toBe("users/alice");
    expect(parsed[0].createdAt).toEqual({ $timestamp: "2026-01-01T09:00:00.123456Z" });
    expect(parsed[0].$$ref).toBe("escaped");
  });
});

describe("defaultFileName", () => {
  it("sanitizes the base and appends a timestamp", () => {
    const now = new Date(2026, 8, 28, 15, 30, 5);
    expect(defaultFileName("users/alice/orders", "csv", now)).toBe("users_alice_orders_20260928-153005.csv");
    expect(defaultFileName("", "json", now)).toBe("export_20260928-153005.json");
    expect(defaultFileName("a:b *c", "tsv", now)).toBe("a_b_c_20260928-153005.tsv");
  });
});
