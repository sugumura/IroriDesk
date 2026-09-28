import { useState } from "react";
import { History, Play, Trash2, X } from "lucide-react";
import { formatTimestamp } from "@/lib/display";
import { summarizeQuery } from "@/lib/queryHistory";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { type QueryTab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EMPTY: never[] = [];

/** 接続ごとのクエリ履歴。選ぶとこのタブに読み込んで実行する */
export function HistoryList({ tab, onRun, className }: { tab: QueryTab; onRun?: () => void; className?: string }) {
  const history = useStore((s) => (s.activeConnectionId && s.queryHistory[s.activeConnectionId]) || EMPTY);
  const run = useStore((s) => s.runHistoryEntry);
  const remove = useStore((s) => s.removeHistoryEntry);
  const clear = useStore((s) => s.clearHistory);
  const [confirmClear, setConfirmClear] = useState(false);
  const t = useT();

  if (history.length === 0) {
    return <div className={cn("p-3 text-xs text-muted-foreground", className)}>{t("query.history.empty")}</div>;
  }
  return (
    <div className={className}>
      {history.map((h) => (
        <div
          key={h.ranAt}
          className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
          title={t("query.history.runTitle")}
          onClick={() => {
            run(tab.id, h);
            onRun?.();
          }}
        >
          <Play className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{summarizeQuery(h.spec, t("query.history.noTarget"))}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{formatTimestamp(h.ranAt).slice(5, 16)}</span>
          <button
            type="button"
            className="rounded p-0.5 opacity-0 group-hover:opacity-60 hover:bg-accent hover:opacity-100"
            title={t("query.history.remove")}
            onClick={(e) => {
              e.stopPropagation();
              remove(h.ranAt);
            }}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <div className="flex justify-end px-2 pt-1">
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            clear();
            setConfirmClear(false);
          }}
        >
          <Trash2 /> {confirmClear ? t("query.history.clearConfirm") : t("query.history.clearAll")}
        </Button>
      </div>
    </div>
  );
}

export function HistoryButton({ tab }: { tab: QueryTab }) {
  const count = useStore((s) => (s.activeConnectionId ? (s.queryHistory[s.activeConnectionId]?.length ?? 0) : 0));
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title={t("query.history.buttonTitle")}>
          <History /> <span className="hidden @lg:inline">{t("query.history.button")}</span>
          {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-[32rem] overflow-auto p-1">
        <HistoryList tab={tab} onRun={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
