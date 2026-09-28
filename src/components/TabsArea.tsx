import { useEffect, useRef } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Columns2,
  Plus,
  Rows2,
  Search,
  SquareSplitHorizontal,
  Table2,
  Users,
  X,
} from "lucide-react";
import { layoutStorage } from "@/lib/layoutStorage";
import { cn } from "@/lib/utils";
import { type GroupIndex, type SplitMode, tabTitle, tabTooltip, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { BrowseView } from "./BrowseView";
import { AuthView } from "./AuthView";
import { QueryView } from "./QueryView";
import { useT } from "@/i18n";

function SplitMenu() {
  const split = useStore((s) => s.split);
  const setSplit = useStore((s) => s.setSplit);
  const t = useT();
  const items: { mode: SplitMode; label: string; icon: React.ReactNode }[] = [
    { mode: "horizontal", label: t("tabs.splitRight"), icon: <Columns2 /> },
    { mode: "vertical", label: t("tabs.splitDown"), icon: <Rows2 /> },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={split === "none" ? "ghost" : "secondary"} size="icon-xs" className="mb-1 shrink-0" title={t("tabs.splitView")}>
          <SquareSplitHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((i) => (
          <DropdownMenuItem key={i.mode} disabled={split === i.mode} onSelect={() => setSplit(i.mode)}>
            {i.icon} {i.label}
          </DropdownMenuItem>
        ))}
        {split !== "none" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSplit("none")}>
              <X /> {t("tabs.unsplit")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 1つのタブグループ（タブ列 + 選択中のタブの内容） */
function TabGroup({ group, showSplitMenu }: { group: GroupIndex; showSplitMenu: boolean }) {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeTabIds[group]);
  const split = useStore((s) => s.split);
  const focused = useStore((s) => s.focusedGroup === group);
  const setActive = useStore((s) => s.setActiveTab);
  const close = useStore((s) => s.closeTab);
  const openQuery = useStore((s) => s.openQuery);
  const focusGroup = useStore((s) => s.focusGroup);
  const moveTab = useStore((s) => s.moveTabToOtherGroup);
  const tr = useT();

  const stripRef = useRef<HTMLDivElement>(null);
  const groupTabs = tabs.filter((t) => t.group === group);
  const active = groupTabs.find((t) => t.id === activeId);
  const moveLabel =
    split === "vertical"
      ? group === 0
        ? tr("tabs.moveDown")
        : tr("tabs.moveUp")
      : split === "horizontal" && group === 1
        ? tr("tabs.moveLeft")
        : tr("tabs.moveRightSplit");

  // 選択したタブ（新しく開いたタブを含む）が見えるようにスクロールする
  useEffect(() => {
    if (!activeId) return;
    stripRef.current
      ?.querySelector(`[data-tab-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, groupTabs.length]);

  // 縦のホイールで横にスクロールする（スクロールバーは表示しない）
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    // どこかを操作したグループをフォーカス中にする（新しいタブはそこに開く）
    <div className="flex h-full min-h-0 flex-col" data-group={group} onMouseDownCapture={() => focusGroup(group)}>
      <div
        className={cn(
          "flex h-9 shrink-0 items-end border-b bg-muted/40 px-1",
          split !== "none" && focused && "bg-muted",
        )}
      >
        {/* タブが多いときはこの部分だけ横にスクロールする。スクロールバーが高さを奪わないよう非表示 */}
        <div ref={stripRef} className="flex min-w-0 shrink items-end gap-0.5 overflow-x-auto scrollbar-none">
          {groupTabs.map((t) => (
            <div
              key={t.id}
              data-tab-id={t.id}
              className={cn(
                "group flex h-8 max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2 text-xs",
                t.id === activeId ? "bg-background" : "border-transparent text-muted-foreground hover:bg-muted",
                // 分割中は、フォーカス中のグループの選択タブに色の線を付ける
                t.id === activeId && split !== "none" && focused && "shadow-[inset_0_2px_0_var(--primary)]",
              )}
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => e.button === 1 && close(t.id)}
              title={tabTooltip(t, tr)}
            >
              {t.kind === "browse" ? (
                <Table2 className="size-3.5 shrink-0" />
              ) : t.kind === "auth" ? (
                <Users className="size-3.5 shrink-0" />
              ) : (
                <Search className="size-3.5 shrink-0" />
              )}
              <span className="truncate font-mono">{tabTitle(t, tr)}</span>
              <button
                type="button"
                className="rounded p-0.5 opacity-0 group-hover:opacity-60 hover:bg-accent hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  moveTab(t.id);
                }}
                title={moveLabel}
                aria-label={moveLabel}
              >
                {split === "vertical" ? <ArrowUpDown className="size-3" /> : <ArrowLeftRight className="size-3" />}
              </button>
              <button
                type="button"
                className="rounded p-0.5 opacity-50 hover:bg-accent hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  close(t.id);
                }}
                title={tr("tabs.closeTab")}
                aria-label={tr("tabs.closeTab")}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="mb-1 ml-1 shrink-0"
          title={tr("tabs.newQueryTab")}
          onClick={() => {
            focusGroup(group);
            openQuery();
          }}
        >
          <Plus /> {tr("tabs.query")}
        </Button>
        <div className="flex-1" />
        {showSplitMenu && <SplitMenu />}
      </div>
      <div className="min-h-0 flex-1">
        {active?.kind === "browse" ? (
          <BrowseView tab={active} />
        ) : active?.kind === "query" ? (
          <QueryView key={active.id} tab={active} />
        ) : active?.kind === "auth" ? (
          <AuthView key={active.id} tab={active} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">
            {tr("tabs.emptyHint")}
          </div>
        )}
      </div>
    </div>
  );
}

function SplitPanes({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `split-${orientation}`,
    storage: layoutStorage,
  });
  return (
    <ResizablePanelGroup
      key={orientation}
      id={`split-${orientation}`}
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="group-0" minSize={orientation === "horizontal" ? 280 : 160}>
        <TabGroup group={0} showSplitMenu={false} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="group-1" minSize={orientation === "horizontal" ? 280 : 160}>
        <TabGroup group={1} showSplitMenu />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export function TabsArea() {
  const split = useStore((s) => s.split);
  return split === "none" ? <TabGroup group={0} showSplitMenu /> : <SplitPanes orientation={split} />;
}
