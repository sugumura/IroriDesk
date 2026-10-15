import { describe, expect, it } from "vitest";
import { documentTrail } from "./subcollections";

describe("documentTrail", () => {
  it("lists the documents on the way to the open collection", () => {
    expect(documentTrail("users", null)).toEqual([]);
    expect(documentTrail("users/alice/orders", null)).toEqual(["users/alice"]);
    expect(documentTrail("a/1/b/2/c", null)).toEqual(["a/1", "a/1/b/2"]);
  });

  it("adds the selected document when it belongs to the open collection", () => {
    expect(documentTrail("users", "users/alice")).toEqual(["users/alice"]);
    expect(documentTrail("users/alice/orders", "users/alice/orders/o1")).toEqual(["users/alice", "users/alice/orders/o1"]);
  });

  it("ignores a selected document from somewhere else", () => {
    expect(documentTrail("users", "products/p1")).toEqual([]);
    expect(documentTrail(null, "users/alice")).toEqual([]);
  });
});
