import { useState } from "react";
import { Folder, Loader2, RefreshCw } from "lucide-react";
import { isCollectionPath, splitPath } from "@/lib/display";
import { cn } from "@/lib/utils";
import { focusedTab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "./ErrorBox";

/** パス入力: コレクションパスなら一覧を開き、ドキュメントパスなら詳細を表示する */
function OpenPathForm() {
  const openCollection = useStore((s) => s.openCollection);
  const select = useStore((s) => s.selectDocument);
  const [value, setValue] = useState("");
  return (
    <form
      className="p-2"
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
        placeholder="パスを開く（users/alice/orders）"
        className="h-7 font-mono text-xs"
      />
    </form>
  );
}

export function CollectionTree() {
  const root = useStore((s) => s.rootCollections);
  const reload = useStore((s) => s.loadRootCollections);
  const openCollection = useStore((s) => s.openCollection);
  const activePath = useStore((s) => {
    const tab = focusedTab(s);
    return tab?.kind === "browse" ? tab.collectionPath : null;
  });
  const activeRoot = activePath ? splitPath(activePath)[0] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">コレクション</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" title="再読み込み" disabled={root.loading} onClick={() => reload()}>
          {root.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      <OpenPathForm />
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        {root.error && <ErrorBox error={root.error} className="m-1 text-xs" />}
        {root.ids?.length === 0 && (
          <div className="px-2 text-muted-foreground">コレクションはありません</div>
        )}
        {root.ids?.map((id) => (
          <button
            key={id}
            type="button"
            title="クリックで開く（⌘/Ctrl+クリックで新しいタブ）"
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-muted",
              activeRoot === id && "bg-accent font-medium",
            )}
            onClick={(e) => openCollection(id, { newTab: e.metaKey || e.ctrlKey })}
          >
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
