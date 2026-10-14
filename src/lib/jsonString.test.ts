import { describe, expect, it } from "vitest";
import { parseJsonString, prettyJsonString } from "./jsonString";

describe("parseJsonString", () => {
  it("parses objects and arrays stored as strings", () => {
    expect(parseJsonString('{"id":"m8l","body":"test","rate":4}')).toEqual({ id: "m8l", body: "test", rate: 4 });
    expect(parseJsonString(' [1, {"a": null}] ')).toEqual([1, { a: null }]);
  });

  it("leaves plain values and broken JSON alone", () => {
    for (const s of ["123", "true", '"text"', "hello", "{not json}", "[1, 2", "{}x", ""]) {
      expect(parseJsonString(s)).toBeNull();
    }
  });

  it("escapes keys that start with $ so they are not read as type markers", () => {
    expect(parseJsonString('{"$ref":"x","a":{"$timestamp":1}}')).toEqual({ $$ref: "x", a: { $$timestamp: 1 } });
  });

  it("pretty-prints for tooltips", () => {
    expect(prettyJsonString('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJsonString("plain")).toBeUndefined();
  });
});
