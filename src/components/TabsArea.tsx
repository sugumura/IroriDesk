import { Plus, Search, Table2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tabTitle, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { BrowseView } from "./BrowseView";
import { QueryView } from "./QueryView";

export function TabsArea() {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeTabId);
  const setActive = useStore((s) => s.setActiveTab);
  const close = useStore((s) => s.closeTab);
  const openQuery = useStore((s) => s.openQuery);
  const active = tabs.find((t) => t.id === activeId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b bg-muted/40 px-1">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex h-8 max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs",
              t.id === activeId ? "bg-background" : "border-transparent text-muted-foreground hover:bg-muted",
            )}
            onClick={() => setActive(t.id)}
            onAuxClick={(e) => e.button === 1 && close(t.id)}
            title={tabTitle(t)}
          >
            {t.kind === "browse" ? (
              <Table2 className="size-3.5 shrink-0" />
            ) : (
              <Search className="size-3.5 shrink-0" />
            )}
            <span className="truncate font-mono">{tabTitle(t)}</span>
            <button
              type="button"
              className="rounded p-0.5 opacity-50 hover:bg-accent hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                close(t.id);
              }}
              aria-label="タブを閉じる"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="xs"
          className="mb-1 ml-1 shrink-0"
          title="新しいクエリタブ"
          onClick={() => openQuery()}
        >
          <Plus /> クエリ
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {active?.kind === "browse" ? (
          <BrowseView tab={active} />
        ) : active?.kind === "query" ? (
          <QueryView key={active.id} tab={active} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            左のコレクションを選択するか、「+ クエリ」でクエリタブを開いてください
          </div>
        )}
      </div>
    </div>
  );
}
