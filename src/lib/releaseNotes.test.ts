import { describe, expect, it } from "vitest";
import { changesSection, parseInline, parseNotes } from "./releaseNotes";

const body = `## Download
- **macOS**: \`IroriDesk_0.7.0_universal.dmg\`

## Changes

### Added

- The collections panel shows the path.
- **Connection status** in the top bar, see [docs](https://example.com/docs).
`;

describe("release notes", () => {
  it("keeps only the Changes section", () => {
    const s = changesSection(body);
    expect(s.startsWith("### Added")).toBe(true);
    expect(s).not.toContain("Download");
    expect(changesSection("- just a list")).toBe("- just a list");
  });

  it("splits headings and list items", () => {
    expect(parseNotes(changesSection(body))).toEqual([
      { kind: "heading", text: "Added" },
      { kind: "item", text: "The collections panel shows the path." },
      { kind: "item", text: "**Connection status** in the top bar, see [docs](https://example.com/docs)." },
    ]);
  });

  it("parses bold, code and links", () => {
    expect(parseInline("**A** and `b` see [c](https://x.dev/y).")).toEqual([
      { kind: "bold", text: "A" },
      { kind: "text", text: " and " },
      { kind: "code", text: "b" },
      { kind: "text", text: " see " },
      { kind: "link", text: "c", url: "https://x.dev/y" },
      { kind: "text", text: "." },
    ]);
  });
});
