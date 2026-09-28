import { useMemo } from "react";
import type { DisplayDocument } from "@/lib/api";
import { toExportObject } from "@/lib/display";
import { type Tab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "./DocumentTable";
import { JsonCode } from "./JsonCode";
import { useT } from "@/i18n";

export function ViewToggle({ tab }: { tab: Tab }) {
  const setView = useStore((s) => s.setView);
  const t = useT();
  return (
    <div className="flex rounded-md border p-0.5">
      {(["table", "json"] as const).map((v) => (
        <Button
          key={v}
          size="xs"
          variant={tab.view === v ? "secondary" : "ghost"}
          onClick={() => setView(tab.id, v)}
        >
          {v === "table" ? t("common.table") : t("common.json")}
        </Button>
      ))}
    </div>
  );
}

function JsonList({ docs }: { docs: DisplayDocument[] }) {
  const text = useMemo(() => JSON.stringify(docs.map(toExportObject), null, 2), [docs]);
  return <JsonCode text={text} className="h-full overflow-auto p-3" />;
}

/**
 * 閲覧・クエリ・Authentication で共通の結果表示（テーブル / JSON）。fields はテーブルに出す列。
 * 行の選択は既定でドキュメントを詳細ペインに表示する
 */
export function ResultsView({
  docs,
  fields,
  view,
  selectedPath: selectedOverride,
  onSelect,
  idLabel,
}: {
  docs: DisplayDocument[];
  fields: string[];
  view: Tab["view"];
  selectedPath?: string | null;
  onSelect?: (doc: DisplayDocument) => void;
  idLabel?: string;
}) {
  const selectedDoc = useStore((s) => s.selectedDocPath);
  const select = useStore((s) => s.selectDocument);
  return view === "table" ? (
    <DocumentTable
      docs={docs}
      fields={fields}
      selectedPath={selectedOverride !== undefined ? selectedOverride : selectedDoc}
      onSelect={onSelect ?? ((d) => select(d.path))}
      idLabel={idLabel}
    />
  ) : (
    <JsonList docs={docs} />
  );
}
