import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { type ActionId, isMac, matchShortcut, runAction } from "./shortcuts";
import { checkForUpdatesManually } from "@/components/UpdateDialog";

/** アプリメニュー（macOS）と Ctrl キー（Windows / Linux）からの操作を受け取る */
export function useShortcuts() {
  useEffect(() => {
    const unlisten = listen<string>("menu-action", (e) => {
      // アプリメニューの「アップデートを確認…」（ショートカットは無い）
      if (e.payload === "checkUpdates") void checkForUpdatesManually();
      else runAction(e.payload as ActionId);
    });
    // macOS はメニューがキーを処理するため、ここで拾うと二重になる
    const onKeyDown = (e: KeyboardEvent) => {
      if (isMac) return;
      const id = matchShortcut(e);
      if (!id) return;
      e.preventDefault();
      runAction(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      void unlisten.then((f) => f()).catch(() => undefined);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
