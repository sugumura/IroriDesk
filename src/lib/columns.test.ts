import { describe, expect, it } from "vitest";
import {
  columnScope,
  EMPTY_COLUMN_CONFIG,
  moveField,
  orderedFields,
  setFieldHidden,
  visibleFields,
} from "./columns";

const fields = ["name", "age", "email", "createdAt"];

describe("columnScope", () => {
  it("replaces document ids with * so sibling subcollections share settings", () => {
    expect(columnScope({ kind: "collection", path: "users" })).toBe("users");
    expect(columnScope({ kind: "collection", path: "users/alice/orders" })).toBe("users/*/orders");
    expect(columnScope({ kind: "collection", path: "/a/b/c/d/e/" })).toBe("a/*/c/*/e");
    expect(columnScope({ kind: "collectionGroup", id: "orders" })).toBe("group:orders");
  });
});

describe("orderedFields / visibleFields", () => {
  it("keeps data order without settings", () => {
    expect(visibleFields(fields, EMPTY_COLUMN_CONFIG)).toEqual(fields);
  });

  it("puts configured order first, unknown fields last, and drops absent ones", () => {
    const config = { order: ["email", "gone", "name"], hidden: [] };
    expect(orderedFields(fields, config)).toEqual(["email", "name", "age", "createdAt"]);
  });

  it("hides hidden fields", () => {
    const config = { order: ["email"], hidden: ["age", "gone"] };
    expect(visibleFields(fields, config)).toEqual(["email", "name", "createdAt"]);
  });
});

describe("moveField", () => {
  it("swaps with the neighbour and keeps remembered order for absent fields", () => {
    const config = { order: ["gone"], hidden: [] };
    const moved = moveField(fields, config, "email", -1);
    expect(orderedFields(fields, moved)).toEqual(["name", "email", "age", "createdAt"]);
    expect(moved.order).toContain("gone");
  });

  it("ignores moves past the edges", () => {
    expect(moveField(fields, EMPTY_COLUMN_CONFIG, "name", -1)).toBe(EMPTY_COLUMN_CONFIG);
    expect(moveField(fields, EMPTY_COLUMN_CONFIG, "createdAt", 1)).toBe(EMPTY_COLUMN_CONFIG);
  });
});

describe("setFieldHidden", () => {
  it("adds and removes without duplicates", () => {
    const a = setFieldHidden(EMPTY_COLUMN_CONFIG, "age", true);
    const b = setFieldHidden(a, "age", true);
    expect(b.hidden).toEqual(["age"]);
    expect(setFieldHidden(b, "age", false).hidden).toEqual([]);
  });
});
