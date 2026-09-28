import type { LayoutStorage } from "react-resizable-panels";

/** ペインのサイズ（見た目の好み）だけを保存する。使えない環境では保存しない */
export const layoutStorage: LayoutStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // 保存できなくても既定のレイアウトで動く
    }
  },
};

/**
 * 同じ種類のパネル群を複数同時に表示するとき（分割中のクエリタブなど）、
 * パネル ID はインスタンスごとに一意にしつつ、保存するサイズは共通にする。
 * roles はパネルの役割名 → インスタンス固有のパネル ID
 */
export function sharedLayout(storageKey: string, roles: Record<string, string>) {
  const key = `layout:${storageKey}`;
  let defaultLayout: Record<string, number> | undefined;
  try {
    const saved = JSON.parse(layoutStorage.getItem(key) ?? "null") as Record<string, number> | null;
    if (saved && Object.keys(roles).every((r) => typeof saved[r] === "number")) {
      defaultLayout = Object.fromEntries(Object.entries(roles).map(([r, id]) => [id, saved[r]]));
    }
  } catch {
    defaultLayout = undefined;
  }
  const onLayoutChanged = (layout: Record<string, number>) => {
    const byRole = Object.fromEntries(Object.entries(roles).map(([r, id]) => [r, layout[id]]));
    layoutStorage.setItem(key, JSON.stringify(byRole));
  };
  return { defaultLayout, onLayoutChanged };
}
