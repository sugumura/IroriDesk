import { useMemo } from "react";
import type { DisplayDocument } from "@/lib/api";
import { toExportObject } from "@/lib/display";
import { type Tab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "./DocumentTable";

export function ViewToggle({ tab }: { tab: Tab }) {
  const setView = useStore((s) => s.setView);
  return (
    <div className="flex rounded-md border p-0.5">
      {(["table", "json"] as const).map((v) => (
        <Button
          key={v}
          size="xs"
          variant={tab.view === v ? "secondary" : "ghost"}
          onClick={() => setView(tab.id, v)}
        >
          {v === "table" ? "テーブル" : "JSON"}
        </Button>
      ))}
    </div>
  );
}

function JsonList({ docs }: { docs: DisplayDocument[] }) {
  const text = useMemo(() => JSON.stringify(docs.map(toExportObject), null, 2), [docs]);
  return (
    <pre className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed select-text">
      {text}
    </pre>
  );
}

/** 閲覧とクエリで共通の結果表示（テーブル / JSON） */
export function ResultsView({ docs, view }: { docs: DisplayDocument[]; view: Tab["view"] }) {
  const selectedPath = useStore((s) => s.selectedDocPath);
  const select = useStore((s) => s.selectDocument);
  return view === "table" ? (
    <DocumentTable docs={docs} selectedPath={selectedPath} onSelect={(d) => select(d.path)} />
  ) : (
    <JsonList docs={docs} />
  );
}
