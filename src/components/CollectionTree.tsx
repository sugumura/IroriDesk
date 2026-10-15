import { useState } from "react";
import { FileText, Folder, FolderOpen, Loader2, RefreshCw, Users, X } from "lucide-react";
import { isCollectionPath, splitPath } from "@/lib/display";
import { cn } from "@/lib/utils";
import { activeConnection, focusedTab, useStore } from "@/store";
import { clearSubcollectionCache, documentTrail, useSubcollections } from "@/lib/subcollections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "./ErrorBox";
import { useT } from "@/i18n";

/** パス入力: コレクションパスなら一覧を開き、ドキュメントパスなら詳細を表示する */
function OpenPathForm() {
  const openCollection = useStore((s) => s.openCollection);
  const select = useStore((s) => s.selectDocument);
  const [value, setValue] = useState("");
  const t = useT();
  return (
    <form
      className="px-2 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        const path = splitPath(value).join("/");
        if (!path) return;
        if (isCollectionPath(path)) openCollection(path, { newTab: true });
        else select(path);
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("tree.openPathPlaceholder")}
        className="h-7 font-mono text-xs"
      />
    </form>
  );
}

/** 道筋の1つのドキュメントと、そのサブコレクション。次のドキュメントがあれば、該当のサブコレクションの下に続ける */
function TrailDoc({ trail, index, depth, activePath }: { trail: string[]; index: number; depth: number; activePath: string | null }) {
  const conn = useStore(activeConnection);
  const select = useStore((s) => s.selectDocument);
  const openCollection = useStore((s) => s.openCollection);
  const selectedDoc = useStore((s) => s.selectedDocPath);
  const t = useT();
  const doc = trail[index];
  const { ids, loading } = useSubcollections(conn, doc);
  const next = trail[index + 1];
  const nextParent = next ? next.split("/").slice(0, -1).join("/") : null;
  const indent = (d: number) => ({ paddingLeft: d * 12 + 8 });
  return (
    <>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left hover:bg-muted",
          selectedDoc === doc && "bg-accent font-medium",
        )}
        style={indent(depth)}
        title={t("browse.showDocument")}
        onClick={() => select(doc)}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs">{doc.split("/").pop()}</span>
      </button>
      {loading && !ids && (
        <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground" style={indent(depth + 1)}>
          <Loader2 className="size-3 animate-spin" /> {t("common.loading")}
        </div>
      )}
      {ids?.map((id) => {
        const path = `${doc}/${id}`;
        const onTrail = activePath === path || activePath?.startsWith(`${path}/`);
        return (
          <div key={id}>
            <button
              type="button"
              title={t("tree.openHint")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left hover:bg-muted",
                activePath === path && "bg-accent font-medium",
              )}
              style={indent(depth + 1)}
              onClick={(e) => openCollection(path, { newTab: e.metaKey || e.ctrlKey })}
            >
              {onTrail ? (
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{id}</span>
            </button>
            {nextParent === path && (
              <TrailDoc trail={trail} index={index + 1} depth={depth + 2} activePath={activePath} />
            )}
          </div>
        );
      })}
    </>
  );
}

export function CollectionTree() {
  const root = useStore((s) => s.rootCollections);
  const reload = useStore((s) => s.loadRootCollections);
  const openCollection = useStore((s) => s.openCollection);
  const setTreeOpen = useStore((s) => s.setTreeOpen);
  const openAuth = useStore((s) => s.openAuth);
  const t = useT();
  const authActive = useStore((s) => focusedTab(s)?.kind === "auth");
  const activePath = useStore((s) => {
    const tab = focusedTab(s);
    return tab?.kind === "browse" ? tab.collectionPath : null;
  });
  const activeRoot = activePath ? splitPath(activePath)[0] : null;
  // 開いているコレクションまでの道筋（途中のドキュメントと、選択中のドキュメント）。サブコレクションをここに並べる
  const selectedDoc = useStore((s) => s.selectedDocPath);
  const trail = documentTrail(activePath, selectedDoc);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Authentication は常に一番上に固定し、区切り線のあとにコレクションを並べる */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">Authentication</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" title={t("tree.closePanel")} onClick={() => setTreeOpen(false)}>
          <X />
        </Button>
      </div>
      <div className="shrink-0 border-b p-1">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted",
            authActive && "bg-accent font-medium",
          )}
          onClick={() => openAuth()}
        >
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          {t("tree.users")}
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <span className="font-medium">{t("tree.collections")}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("tree.reloadCollections")}
          disabled={root.loading}
          onClick={() => {
            clearSubcollectionCache();
            void reload();
          }}
        >
          {root.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      <OpenPathForm />
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        {root.error && <ErrorBox error={root.error} className="m-1 text-xs" />}
        {root.ids?.length === 0 && (
          <div className="px-2 text-muted-foreground">{t("tree.noCollections")}</div>
        )}
        {root.ids?.map((id) => (
          <div key={id}>
            <button
              type="button"
              title={t("tree.openHint")}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted",
                activePath === id && "bg-accent font-medium",
                activeRoot === id && activePath !== id && "font-medium",
              )}
              onClick={(e) => openCollection(id, { newTab: e.metaKey || e.ctrlKey })}
            >
              {activeRoot === id ? (
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{id}</span>
            </button>
            {activeRoot === id && trail.length > 0 && (
              <TrailDoc trail={trail} index={0} depth={1} activePath={activePath} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
