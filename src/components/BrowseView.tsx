import { Fragment, useState } from "react";
import { ChevronRight, ListTree, Loader2, RefreshCw, Search } from "lucide-react";
import { splitPath } from "@/lib/display";
import { activeConnection, type BrowseTab, emptyQuerySpec, useStore } from "@/store";
import { IndexesDialog } from "./IndexesDialog";
import { Button } from "@/components/ui/button";
import { ErrorBox } from "./ErrorBox";
import { columnScope } from "@/lib/columns";
import { useColumnLayout } from "@/lib/useColumnLayout";
import { ColumnSettings } from "./ColumnSettings";
import { ExportMenu } from "./ExportMenu";
import { ResultsView, ViewToggle } from "./ResultsView";

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

export function BrowseView({ tab }: { tab: BrowseTab }) {
  const loadPage = useStore((s) => s.loadPage);
  const openQuery = useStore((s) => s.openQuery);
  const conn = useStore(activeConnection);
  const [indexesOpen, setIndexesOpen] = useState(false);
  const segments = splitPath(tab.collectionPath);
  const collectionId = segments[segments.length - 1] ?? tab.collectionPath;
  const layout = useColumnLayout(
    tab.docs,
    columnScope({ kind: "collection", path: tab.collectionPath }),
  );
  const missingCount = tab.docs.filter((d) => d.missing).length;

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Breadcrumb path={tab.collectionPath} />
        <div className="flex-1" />
        <Button
          variant="outline"
          size="xs"
          title="このコレクションを対象にクエリタブを開く"
          onClick={() => openQuery(emptyQuerySpec(tab.collectionPath))}
        >
          <Search /> <span className="hidden @lg:inline">クエリ</span>
        </Button>
        <Button
          variant="outline"
          size="xs"
          title={`コレクション ${collectionId} のインデックスを表示`}
          onClick={() => setIndexesOpen(true)}
        >
          <ListTree /> <span className="hidden @lg:inline">インデックス</span>
        </Button>
        {conn && (
          <IndexesDialog
            open={indexesOpen}
            onOpenChange={setIndexesOpen}
            connection={conn}
            collectionId={collectionId}
          />
        )}
        {tab.view === "table" && <ColumnSettings layout={layout} />}
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
        ) : (
          <ResultsView docs={tab.docs} fields={layout.visible} view={tab.view} />
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {tab.docs.length} 件<span className="hidden @md:inline">読み込み済み</span>
          {missingCount > 0 && <span className="hidden @xl:inline">（うち実体なし {missingCount} 件）</span>}
        </span>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        <ExportMenu docs={tab.docs} fields={layout.visible} baseName={tab.collectionPath} />
        {tab.nextPageToken && (
          <Button size="xs" variant="outline" disabled={tab.loading} onClick={() => loadPage(tab.id, false)}>
            <span className="@md:hidden">続き</span>
            <span className="hidden @md:inline">さらに読み込む</span>
          </Button>
        )}
      </div>
    </div>
  );
}
