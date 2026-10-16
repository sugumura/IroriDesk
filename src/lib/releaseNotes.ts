/**
 * 更新ダイアログに出す変更内容。リリースノート（Markdown）から「## Changes」以降だけを取り出し、
 * 見出し・箇条書き・段落に分ける（HTML は使わず、画面側で要素として組み立てる）
 */
export type NoteBlock =
  | { kind: "heading"; text: string }
  | { kind: "item"; text: string }
  | { kind: "paragraph"; text: string };

export function changesSection(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s+Changes\s*$/i.test(l.trim()));
  return (start >= 0 ? lines.slice(start + 1) : lines).join("\n").trim();
}

export function parseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) blocks.push({ kind: "heading", text: heading[1] });
    else if (item) blocks.push({ kind: "item", text: item[1] });
    else {
      const last = blocks[blocks.length - 1];
      // 箇条書きや段落の続きの行はつなげる
      if (last && last.kind !== "heading" && raw.startsWith(" ")) last.text += ` ${line.trim()}`;
      else blocks.push({ kind: "paragraph", text: line.trim() });
    }
  }
  return blocks;
}

export type Inline = { kind: "text" | "bold" | "code"; text: string } | { kind: "link"; text: string; url: string };

/** **太字**・`コード`・[リンク](URL) を分ける */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "bold", text: m[1] });
    else if (m[2]) out.push({ kind: "code", text: m[2] });
    else out.push({ kind: "link", text: m[3], url: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
