import { useState } from "react";
import { FolderOpen, Keyboard, Search, Table2, Users } from "lucide-react";
import { useT } from "@/i18n";
import { isCollectionPath, splitPath } from "@/lib/display";
import { type ActionId, runAction, SHORTCUTS, shortcutLabel } from "@/lib/shortcuts";
import { tabTitle, useStore } from "@/store";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

const PALETTE_ACTIONS = (Object.keys(SHORTCUTS) as ActionId[]).filter((id) => id !== "palette");

/** ⌘K（Ctrl+K）で開く。コレクション・パス・タブへの移動と、各操作の実行 */
export function CommandPalette() {
  const t = useT();
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const tabs = useStore((s) => s.tabs);
  const rootIds = useStore((s) => s.rootCollections.ids);
  const hasConnection = useStore((s) => s.activeConnectionId !== null);
  const [query, setQuery] = useState("");

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const run = (fn: () => void) => {
    close();
    // ダイアログが閉じてから実行する（フォーカスの移動を妨げないため）
    setTimeout(fn, 0);
  };

  // "/" を含む入力はパスとして開ける
  const path = splitPath(query.trim()).join("/");
  const showPath = hasConnection && query.includes("/") && path.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title={t("shortcuts.actions.palette")}
      description={t("shortcuts.placeholder")}
    >
      <Command>
        <CommandInput value={query} onValueChange={setQuery} placeholder={t("shortcuts.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("shortcuts.empty")}</CommandEmpty>

          {showPath && (
            <CommandGroup heading={t("shortcuts.groups.navigate")} forceMount>
              <CommandItem
                value={`path ${path}`}
                forceMount
                onSelect={() =>
                  run(() => {
                    const s = useStore.getState();
                    if (isCollectionPath(path)) s.openCollection(path, { newTab: true });
                    else s.selectDocument(path);
                  })
                }
              >
                <FolderOpen />
                <span className="font-mono">{t("shortcuts.openPath", { path })}</span>
              </CommandItem>
            </CommandGroup>
          )}

          {tabs.length > 0 && (
            <CommandGroup heading={t("shortcuts.groups.tabs")}>
              {tabs.map((tab) => (
                <CommandItem
                  key={tab.id}
                  value={`tab ${tab.id} ${tabTitle(tab, t)}`}
                  onSelect={() => run(() => useStore.getState().setActiveTab(tab.id))}
                >
                  {tab.kind === "browse" ? <Table2 /> : tab.kind === "auth" ? <Users /> : <Search />}
                  <span className="truncate font-mono">{tabTitle(tab, t)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {hasConnection && (
            <CommandGroup heading={t("shortcuts.groups.collections")}>
              <CommandItem value="authentication users" onSelect={() => run(() => useStore.getState().openAuth())}>
                <Users />
                {t("shortcuts.openAuth")}
              </CommandItem>
              {(rootIds ?? []).map((id) => (
                <CommandItem
                  key={id}
                  value={`collection ${id}`}
                  onSelect={() => run(() => useStore.getState().openCollection(id, { newTab: true }))}
                >
                  <FolderOpen />
                  <span className="font-mono">{id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading={t("shortcuts.groups.actions")}>
            {PALETTE_ACTIONS.map((id) => (
              <CommandItem key={id} value={`action ${t(`shortcuts.actions.${id}`)}`} onSelect={() => run(() => runAction(id))}>
                <Keyboard />
                {t(`shortcuts.actions.${id}`)}
                <CommandShortcut>{shortcutLabel(id)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
