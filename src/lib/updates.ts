/**
 * 自動アップデート（tauri-plugin-updater）。GitHub Releases の latest.json を見て、
 * 新しい版があれば知らせ、ダウンロード・インストール・再起動まで行う。
 * 公開（Publish）したリリースだけが対象になる（下書きは latest に含まれない）
 */
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { loadAutoCheckUpdates, saveAutoCheckUpdates } from "./settings";

type Phase = "idle" | "checking" | "downloading" | "installing" | "restarting";

interface UpdateState {
  autoCheck: boolean;
  phase: Phase;
  /** 見つかった新しい版（無ければ null） */
  update: Update | null;
  dialogOpen: boolean;
  /** ダウンロードの進み具合（0〜1。サイズ不明なら null） */
  progress: number | null;
  error: string | null;
  loadSettings(): Promise<void>;
  setAutoCheck(on: boolean): void;
  /** 新しい版があれば true。manual でなければ、失敗しても何も表示しない */
  checkNow(): Promise<boolean>;
  setDialogOpen(open: boolean): void;
  install(): Promise<void>;
}

export const useUpdates = create<UpdateState>((set, get) => ({
  autoCheck: true,
  phase: "idle",
  update: null,
  dialogOpen: false,
  progress: null,
  error: null,

  async loadSettings() {
    set({ autoCheck: await loadAutoCheckUpdates().catch(() => true) });
  },

  setAutoCheck(on) {
    set({ autoCheck: on });
    void saveAutoCheckUpdates(on);
  },

  async checkNow() {
    if (get().phase !== "idle") return get().update !== null;
    set({ phase: "checking", error: null });
    try {
      const update = await check();
      set({ update, phase: "idle" });
      return update !== null;
    } catch (e) {
      set({ phase: "idle", error: String(e) });
      throw e;
    }
  },

  setDialogOpen(open) {
    set({ dialogOpen: open });
  },

  async install() {
    const update = get().update;
    if (!update || get().phase !== "idle") return;
    let total: number | null = null;
    let received = 0;
    set({ phase: "downloading", progress: null, error: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          set({ progress: total ? Math.min(received / total, 1) : null });
        } else if (event.event === "Finished") {
          set({ phase: "installing", progress: 1 });
        }
      });
      set({ phase: "restarting" });
      await relaunch();
    } catch (e) {
      set({ phase: "idle", error: String(e) });
    }
  },
}));
