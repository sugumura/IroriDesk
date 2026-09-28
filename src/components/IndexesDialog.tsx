import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDown, ArrowUp, Brackets, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  type AppError,
  type CollectionIndexes,
  type ConnectionConfig,
  type IndexField,
  listIndexes,
  toAppError,
} from "@/lib/api";
import { databaseId } from "@/lib/display";
import { type MessageKey, useT } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBox } from "./ErrorBox";

const MODE_ICON: Record<IndexField["mode"], React.ReactNode> = {
  asc: <ArrowUp className="size-3" />,
  desc: <ArrowDown className="size-3" />,
  "array-contains": <Brackets className="size-3" />,
  vector: <Sparkles className="size-3" />,
};

const MODE_LABEL: Record<IndexField["mode"], MessageKey> = {
  asc: "indexes.mode.asc",
  desc: "indexes.mode.desc",
  "array-contains": "indexes.mode.arrayContains",
  vector: "indexes.mode.vector",
};

const SCOPE_LABEL: Record<string, MessageKey> = {
  COLLECTION: "indexes.scope.collection",
  COLLECTION_GROUP: "indexes.scope.collectionGroup",
};

function StateBadge({ state }: { state: string }) {
  const t = useT();
  if (state === "READY") return <Badge variant="secondary">{t("indexes.state.ready")}</Badge>;
  if (state === "CREATING") return <Badge variant="outline">{t("indexes.state.creating")}</Badge>;
  if (state === "NEEDS_REPAIR") return <Badge variant="destructive">{t("indexes.state.needsRepair")}</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

function FieldChip({ field }: { field: IndexField }) {
  const t = useT();
  return (
    <span
      className="inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-xs"
      title={t(MODE_LABEL[field.mode])}
    >
      {field.fieldPath}
      {MODE_ICON[field.mode]}
    </span>
  );
}

/** Firebase コンソールのインデックス画面 */
function consoleUrl(conn: ConnectionConfig): string {
  const db = databaseId(conn) === "(default)" ? "-default-" : databaseId(conn);
  return `https://console.firebase.google.com/project/${encodeURIComponent(conn.projectId.trim())}/firestore/databases/${encodeURIComponent(db)}/indexes`;
}

/** コレクションのインデックス一覧（読み取りのみ） */
export function IndexesDialog({
  open,
  onOpenChange,
  connection,
  collectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ConnectionConfig;
  collectionId: string;
}) {
  const t = useT();
  const scopeLabel = (scope: string) => (SCOPE_LABEL[scope] ? t(SCOPE_LABEL[scope]) : scope);
  const [data, setData] = useState<CollectionIndexes | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listIndexes(connection, collectionId));
    } catch (e) {
      setData(null);
      setError(toAppError(e));
    } finally {
      setLoading(false);
    }
  }, [connection, collectionId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("indexes.title")}<span className="font-mono">{collectionId}</span>
          </DialogTitle>
          <DialogDescription>
            {t("indexes.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-auto">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          {error && <ErrorBox error={error} />}

          {data && (
            <>
              <section className="space-y-2">
                <h3 className="font-medium">{t("indexes.composite", { count: data.composite.length })}</h3>
                {data.composite.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("indexes.noComposite")}
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {data.composite.map((idx) => (
                      <div key={idx.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                          {idx.fields.map((f, i) => (
                            <FieldChip key={i} field={f} />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{scopeLabel(idx.queryScope)}</span>
                        <StateBadge state={idx.state} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">{t("indexes.fieldOverrides", { count: data.fieldOverrides.length })}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("indexes.fieldOverridesHelp")}
                </p>
                {data.fieldOverrides.length > 0 && (
                  <div className="divide-y rounded-md border">
                    {data.fieldOverrides.map((o) => (
                      <div key={o.fieldPath} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1 font-mono text-xs">{o.fieldPath}</span>
                        {o.indexes.length === 0 ? (
                          <Badge variant="outline">{t("indexes.autoIndexDisabled")}</Badge>
                        ) : (
                          o.indexes.map((i, n) => (
                            <span key={n} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              {MODE_ICON[i.mode]}
                              {t("indexes.modeScope", { mode: t(MODE_LABEL[i.mode]), scope: scopeLabel(i.queryScope) })}
                            </span>
                          ))
                        )}
                        {o.ttl && <Badge variant="secondary">TTL</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => void openUrl(consoleUrl(connection))}>
            <ExternalLink /> {t("indexes.openConsole")}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={loading} onClick={() => void load()}>
              <RefreshCw /> {t("common.reload")}
            </Button>
            <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
