import { useEffect, useState } from "react";
import { FolderOpen, Layers, Loader2, X } from "lucide-react";
import {
  type AppError,
  type DisplayDocument,
  getDocument,
  toAppError,
} from "@/lib/api";
import { fetchSubcollections } from "@/lib/subcollections";
import { FilterInput } from "./FilterInput";
import { formatTimestamp } from "@/lib/display";
import { activeConnection, emptyQuerySpec, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { CopyButton, CopyTextButton } from "./CopyButton";
import { ErrorBox } from "./ErrorBox";
import { JsonCode } from "./JsonCode";
import { JsonTree } from "./JsonTree";
import { useT } from "@/i18n";

interface DetailState {
  loading: boolean;
  doc: DisplayDocument | null;
  /** 404（実体なし）。サブコレクションだけ持つ場合がある */
  notFound: boolean;
  error: AppError | null;
  subcollections: string[] | null;
  subError: AppError | null;
}

const initial: DetailState = {
  loading: false,
  doc: null,
  notFound: false,
  error: null,
  subcollections: null,
  subError: null,
};

/** これより多いときは絞り込みの欄を出す */
const FILTER_THRESHOLD = 8;

/** サブコレクションの縦の一覧。名前のクリックで開き、右のボタンで同じ名前のコレクションを横断して検索する */
function SubcollectionList({ path, ids }: { path: string; ids: string[] }) {
  const t = useT();
  const openCollection = useStore((s) => s.openCollection);
  const openQuery = useStore((s) => s.openQuery);
  const [filter, setFilter] = useState("");
  useEffect(() => setFilter(""), [path]);
  const q = filter.trim().toLowerCase();
  const shown = q ? ids.filter((id) => id.toLowerCase().includes(q)) : ids;
  return (
    <div className="border-b p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("detail.subcollections")} ({ids.length})
        </span>
        <div className="flex-1" />
        {ids.length > FILTER_THRESHOLD && (
          <FilterInput
            className="w-36"
            value={filter}
            onChange={setFilter}
            placeholder={t("detail.filterSubcollections")}
          />
        )}
      </div>
      <div className="max-h-64 overflow-auto">
        {shown.map((id) => (
          <div key={id} className="group flex items-center gap-1 rounded hover:bg-muted">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left"
              title={t("tree.openHint")}
              onClick={(e) => openCollection(`${path}/${id}`, { newTab: e.metaKey || e.ctrlKey })}
            >
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs">{id}</span>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100"
              title={t("detail.collectionGroupQuery", { id })}
              aria-label={t("detail.collectionGroupQuery", { id })}
              onClick={() => openQuery({ ...emptyQuerySpec(id), targetKind: "collectionGroup" })}
            >
              <Layers />
            </Button>
          </div>
        ))}
        {shown.length === 0 && <div className="px-1.5 py-1 text-xs text-muted-foreground">{t("detail.noMatch")}</div>}
      </div>
    </div>
  );
}

function isNotFound(e: AppError) {
  return e.code === "API" && (e.detail?.includes("404") ?? false);
}

export function DocumentDetail() {
  const conn = useStore(activeConnection);
  const path = useStore((s) => s.selectedDocPath);
  const select = useStore((s) => s.selectDocument);
  const setDetailOpen = useStore((s) => s.setDetailOpen);
  const view = useStore((s) => s.detailView);
  const setView = useStore((s) => s.setDetailView);
  const [state, setState] = useState<DetailState>(initial);
  const t = useT();

  useEffect(() => {
    if (!conn || !path) {
      setState(initial);
      return;
    }
    let cancelled = false;
    setState({ ...initial, loading: true });
    const docP = getDocument(conn, path).then(
      (doc) => ({ doc, error: null, notFound: false }),
      (e) => {
        const err = toAppError(e);
        return isNotFound(err)
          ? { doc: null, error: null, notFound: true }
          : { doc: null, error: err, notFound: false };
      },
    );
    const subP = fetchSubcollections(conn, path).then(
      (ids) => ({ subcollections: ids, subError: null }),
      (e) => ({ subcollections: null, subError: toAppError(e) }),
    );
    void Promise.all([docP, subP]).then(([d, s]) => {
      if (!cancelled) setState({ loading: false, ...d, ...s });
    });
    return () => {
      cancelled = true;
    };
  }, [conn, path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">{t("detail.title")}</span>
        <div className="flex-1" />
        <div className="flex rounded-md border p-0.5">
          {(["tree", "json"] as const).map((v) => (
            <Button key={v} size="xs" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)}>
              {v === "tree" ? t("detail.tree") : t("common.json")}
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setDetailOpen(false)} title={t("common.close")}>
          <X />
        </Button>
      </div>

      {!path ? (
        <div className="p-4 text-muted-foreground">{t("detail.selectPrompt")}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-1 border-b p-3">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 font-mono text-xs break-all">{path}</span>
              <CopyButton text={path} label={t("detail.copyPath")} />
            </div>
            {state.doc && (
              <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                {state.doc.createTime && (
                  <span title={state.doc.createTime}>{t("detail.created", { time: formatTimestamp(state.doc.createTime) })}</span>
                )}
                {state.doc.updateTime && (
                  <span title={state.doc.updateTime}>{t("detail.updated", { time: formatTimestamp(state.doc.updateTime) })}</span>
                )}
              </div>
            )}
          </div>

          {state.loading && (
            <div className="flex items-center gap-2 p-3 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {state.error && <ErrorBox error={state.error} className="m-3" />}
          {state.notFound && (
            <div className="p-3 text-muted-foreground">
              {t("detail.notFound")}
            </div>
          )}

          {state.subcollections && state.subcollections.length > 0 && (
            <SubcollectionList path={path} ids={state.subcollections} />
          )}
          {state.subError && <ErrorBox error={state.subError} className="m-3" />}

          {state.doc &&
            (view === "tree" ? (
              <div className="p-2">
                <JsonTree fields={state.doc.fields} />
              </div>
            ) : (
              <div className="p-2">
                <JsonCode text={JSON.stringify(state.doc.fields, null, 2)} className="overflow-auto px-1" />
              </div>
            ))}
        </div>
      )}
      {path && (
        // 一覧のフッターと同じ高さに揃える
        <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t px-3">
          {state.doc && (
            <CopyTextButton text={() => JSON.stringify(state.doc!.fields, null, 2)}>{t("common.copyJson")}</CopyTextButton>
          )}
          <Button variant="ghost" size="xs" onClick={() => select(null)}>
            {t("common.clearSelection")}
          </Button>
        </div>
      )}
    </div>
  );
}
