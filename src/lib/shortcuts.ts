/**
 * キーボード操作。macOS ではアプリメニューに登録したショートカットから "menu-action" が届き、
 * Windows / Linux では Ctrl キーの組み合わせをここで拾う（src-tauri/src/menu.rs と対応）
 */
import { useStore } from "@/store";

export type ActionId =
  | "newQuery"
  | "closeTab"
  | "palette"
  | "reload"
  | "filter"
  | "toggleTree"
  | "toggleDetail"
  | "prevTab"
  | "nextTab"
  | "settings";

interface Shortcut {
  /** KeyboardEvent.code */
  code: string;
  /** 表示用のキー */
  key: string;
  shift?: boolean;
  alt?: boolean;
}

export const SHORTCUTS: Record<ActionId, Shortcut> = {
  newQuery: { code: "KeyT", key: "T" },
  closeTab: { code: "KeyW", key: "W" },
  palette: { code: "KeyK", key: "K" },
  reload: { code: "KeyR", key: "R" },
  filter: { code: "KeyF", key: "F" },
  toggleTree: { code: "KeyB", key: "B" },
  toggleDetail: { code: "KeyB", key: "B", alt: true },
  prevTab: { code: "BracketLeft", key: "[", shift: true },
  nextTab: { code: "BracketRight", key: "]", shift: true },
  settings: { code: "Comma", key: "," },
};

export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** 表示用の文字列（⌘⇧] / Ctrl+Shift+]） */
export function shortcutLabel(id: ActionId): string {
  const s = SHORTCUTS[id];
  if (isMac) return `${s.alt ? "⌥" : ""}${s.shift ? "⇧" : ""}⌘${s.key}`;
  return ["Ctrl", s.alt && "Alt", s.shift && "Shift", s.key].filter(Boolean).join("+");
}

/** Ctrl キーの組み合わせから操作を探す（Windows / Linux 用） */
export function matchShortcut(e: KeyboardEvent): ActionId | null {
  if (!e.ctrlKey || e.metaKey) return null;
  for (const [id, s] of Object.entries(SHORTCUTS) as [ActionId, Shortcut][]) {
    if (e.code === s.code && !!s.shift === e.shiftKey && !!s.alt === e.altKey) return id;
  }
  return null;
}

export function runAction(id: ActionId) {
  const s = useStore.getState();
  switch (id) {
    case "newQuery":
      s.openQuery();
      break;
    case "closeTab":
      s.closeActiveTab();
      break;
    case "palette":
      s.setPaletteOpen(!s.paletteOpen);
      break;
    case "reload":
      s.reloadActiveTab();
      break;
    case "filter": {
      // フォーカス中のグループの絞り込み欄
      const input = document.querySelector<HTMLInputElement>(
        `[data-group="${s.focusedGroup}"] input[data-local-filter]`,
      );
      input?.focus();
      input?.select();
      break;
    }
    case "toggleTree":
      s.setTreeOpen(!s.treeOpen);
      break;
    case "toggleDetail":
      s.setDetailOpen(!s.detailOpen);
      break;
    case "prevTab":
      s.cycleTab(-1);
      break;
    case "nextTab":
      s.cycleTab(1);
      break;
    case "settings":
      s.setSettingsOpen(true);
      break;
  }
}
