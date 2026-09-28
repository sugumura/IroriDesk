import { useEffect, useState } from "react";
import { FolderOpen, Loader2, X } from "lucide-react";
import {
  type AppError,
  type DisplayDocument,
  getDocument,
  listCollectionIds,
  toAppError,
} from "@/lib/api";
import { formatTimestamp, toExportObject } from "@/lib/display";
import { activeConnection, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { ErrorBox } from "./ErrorBox";
import { JsonTree } from "./JsonTree";

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

function isNotFound(e: AppError) {
  return e.code === "API" && (e.detail?.includes("404") ?? false);
}

export function DocumentDetail() {
  const conn = useStore(activeConnection);
  const path = useStore((s) => s.selectedDocPath);
  const select = useStore((s) => s.selectDocument);
  const setDetailOpen = useStore((s) => s.setDetailOpen);
  const openCollection = useStore((s) => s.openCollection);
  const [state, setState] = useState<DetailState>(initial);

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
    const subP = listCollectionIds(conn, path).then(
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
        <span className="font-medium">ドキュメント</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => setDetailOpen(false)} title="閉じる">
          <X />
        </Button>
      </div>

      {!path ? (
        <div className="p-4 text-muted-foreground">一覧からドキュメントを選択してください</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-1 border-b p-3">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 font-mono text-xs break-all">{path}</span>
              <CopyButton text={path} label="パスをコピー" />
            </div>
            {state.doc && (
              <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                {state.doc.createTime && (
                  <span title={state.doc.createTime}>作成: {formatTimestamp(state.doc.createTime)}</span>
                )}
                {state.doc.updateTime && (
                  <span title={state.doc.updateTime}>更新: {formatTimestamp(state.doc.updateTime)}</span>
                )}
                <CopyButton
                  text={() => JSON.stringify(toExportObject(state.doc!), null, 2)}
                  label="ドキュメントをJSONでコピー"
                  className="ml-auto"
                />
              </div>
            )}
          </div>

          {state.loading && (
            <div className="flex items-center gap-2 p-3 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 読み込み中…
            </div>
          )}
          {state.error && <ErrorBox error={state.error} className="m-3" />}
          {state.notFound && (
            <div className="p-3 text-muted-foreground">
              このドキュメントは存在しません（サブコレクションのみを持つ場合があります）
            </div>
          )}

          {state.subcollections && state.subcollections.length > 0 && (
            <div className="border-b p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">サブコレクション</div>
              <div className="flex flex-wrap gap-1">
                {state.subcollections.map((id) => (
                  <Button
                    key={id}
                    variant="outline"
                    size="xs"
                    title="クリックで開く（⌘/Ctrl+クリックで新しいタブ）"
                    onClick={(e) =>
                      openCollection(`${path}/${id}`, { newTab: e.metaKey || e.ctrlKey })
                    }
                  >
                    <FolderOpen /> {id}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {state.subError && <ErrorBox error={state.subError} className="m-3" />}

          {state.doc && (
            <div className="p-2">
              <JsonTree fields={state.doc.fields} />
            </div>
          )}
        </div>
      )}
      {path && (
        <div className="shrink-0 border-t px-3 py-1 text-right">
          <Button variant="ghost" size="xs" onClick={() => select(null)}>
            選択解除
          </Button>
        </div>
      )}
    </div>
  );
}
