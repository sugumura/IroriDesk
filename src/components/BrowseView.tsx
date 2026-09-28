import { Fragment, useMemo } from "react";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { splitPath, toExportObject } from "@/lib/display";
import { type BrowseTab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "./DocumentTable";
import { ErrorBox } from "./ErrorBox";

function Breadcrumb({ path }: { path: string }) {
  const openCollection = useStore((s) => s.openCollection);
  const select = useStore((s) => s.selectDocument);
  const segments = splitPath(path);
  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto font-mono text-xs whitespace-nowrap">
      {segments.map((seg, i) => {
        const sub = segments.slice(0, i + 1).join("/");
        const isCollection = i % 2 === 0;
        const isLast = i === segments.length - 1;
        return (
          <Fragment key={sub}>
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
            <button
              type="button"
              disabled={isLast}
              className={
                isLast
                  ? "font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:underline"
              }
              title={isCollection ? "コレクションを開く" : "ドキュメントを表示"}
              onClick={(e) =>
                isCollection
                  ? openCollection(sub, { newTab: e.metaKey || e.ctrlKey })
                  : select(sub)
              }
            >
              {seg}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

function ViewToggle({ tab }: { tab: BrowseTab }) {
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

function JsonList({ tab }: { tab: BrowseTab }) {
  const text = useMemo(
    () => JSON.stringify(tab.docs.map(toExportObject), null, 2),
    [tab.docs],
  );
  return (
    <pre className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed select-text">
      {text}
    </pre>
  );
}

export function BrowseView({ tab }: { tab: BrowseTab }) {
  const loadPage = useStore((s) => s.loadPage);
  const selectedPath = useStore((s) => s.selectedDocPath);
  const select = useStore((s) => s.selectDocument);
  const missingCount = tab.docs.filter((d) => d.missing).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Breadcrumb path={tab.collectionPath} />
        <div className="flex-1" />
        <ViewToggle tab={tab} />
        <Button
          variant="ghost"
          size="icon-sm"
          title="再読み込み"
          disabled={tab.loading}
          onClick={() => loadPage(tab.id, true)}
        >
          <RefreshCw />
        </Button>
      </div>

      {tab.error && <ErrorBox error={tab.error} className="m-3" />}

      <div className="min-h-0 flex-1">
        {tab.docs.length === 0 && !tab.loading && !tab.error ? (
          <div className="p-4 text-muted-foreground">ドキュメントはありません</div>
        ) : tab.view === "table" ? (
          <DocumentTable docs={tab.docs} selectedPath={selectedPath} onSelect={(d) => select(d.path)} />
        ) : (
          <JsonList tab={tab} />
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        <span>
          {tab.docs.length} 件読み込み済み
          {missingCount > 0 && `（うち実体なし ${missingCount} 件）`}
        </span>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        {tab.nextPageToken && (
          <Button size="xs" variant="outline" disabled={tab.loading} onClick={() => loadPage(tab.id, false)}>
            さらに読み込む
          </Button>
        )}
      </div>
    </div>
  );
}
