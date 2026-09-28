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
