import { Fragment, useMemo, useState } from "react";
import { filterDocs } from "@/lib/localView";
import { FilterInput } from "./FilterInput";
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
import { useT } from "@/i18n";

function Breadcrumb({ path }: { path: string }) {
  const openCollection = useStore((s) => s.openCollection);
  const select = useStore((s) => s.selectDocument);
  const t = useT();
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
              title={isCollection ? t("browse.openCollection") : t("browse.showDocument")}
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
  const t = useT();
  const [indexesOpen, setIndexesOpen] = useState(false);
  const segments = splitPath(tab.collectionPath);
  const collectionId = segments[segments.length - 1] ?? tab.collectionPath;
  const setTabFilter = useStore((s) => s.setTabFilter);
  const setTabSort = useStore((s) => s.setTabSort);
  // 読み込み済みの結果を手元で絞り込む（Firestore にはクエリを送らない）
  const shown = useMemo(() => filterDocs(tab.docs, tab.filter), [tab.docs, tab.filter]);
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
          title={t("browse.queryThisCollection")}
          onClick={() => openQuery(emptyQuerySpec(tab.collectionPath))}
        >
          <Search /> <span className="hidden @lg:inline">{t("browse.query")}</span>
        </Button>
        <Button
          variant="outline"
          size="xs"
          title={t("browse.showIndexes", { id: collectionId })}
          onClick={() => setIndexesOpen(true)}
        >
          <ListTree /> <span className="hidden @lg:inline">{t("browse.indexes")}</span>
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
          title={t("common.reload")}
          disabled={tab.loading}
          onClick={() => loadPage(tab.id, true)}
        >
          <RefreshCw />
        </Button>
      </div>

      {tab.error && <ErrorBox error={tab.error} className="m-3" />}

      <div className="min-h-0 flex-1">
        {tab.docs.length === 0 && !tab.loading && !tab.error ? (
          <div className="p-4 text-muted-foreground">{t("browse.noDocuments")}</div>
        ) : (
          <ResultsView
            docs={shown}
            fields={layout.visible}
            view={tab.view}
            sort={tab.sort}
            onSortChange={(sort) => setTabSort(tab.id, sort)}
          />
        )}
      </div>

      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {t("common.count", { count: tab.docs.length })}
          <span className="hidden @md:inline">{t("browse.loadedSuffix")}</span>
          {missingCount > 0 && <span className="hidden @xl:inline">{t("browse.missingSuffix", { count: missingCount })}</span>}
          {tab.totalCount !== null && <span>{t("browse.totalSuffix", { count: tab.totalCount })}</span>}
        </span>
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        {tab.filter && (
          <span className="shrink-0 text-primary">{t("browse.filtered", { shown: shown.length, total: tab.docs.length })}</span>
        )}
        <FilterInput className="w-44" value={tab.filter} onChange={(v) => setTabFilter(tab.id, v)} />
        <ExportMenu docs={tab.docs} fields={layout.visible} baseName={tab.collectionPath} />
        {tab.nextPageToken && (
          <Button size="xs" variant="outline" disabled={tab.loading} onClick={() => loadPage(tab.id, false)}>
            <span className="@md:hidden">{t("browse.more")}</span>
            <span className="hidden @md:inline">{t("browse.loadMore")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
