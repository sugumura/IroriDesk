/**
 * 接続の認証の状態。Firestore / Authentication への問い合わせの結果から、
 * 最後に成功した時刻と、認証エラー（AUTH）になった時刻を覚えておく（トップバーの「接続の状態」用）
 */
import { create } from "zustand";
import type { AppError } from "./api";

interface ConnectionStatusState {
  /** 最後に問い合わせが成功した時刻（ms） */
  lastOk: number | null;
  /** 認証エラーになった時刻と内容（成功したら消える） */
  authError: { at: number; error: AppError } | null;
  reset(): void;
}

export const useConnectionStatus = create<ConnectionStatusState>((set) => ({
  lastOk: null,
  authError: null,
  reset: () => set({ lastOk: null, authError: null }),
}));

function isAppError(e: unknown): e is AppError {
  return !!e && typeof e === "object" && "code" in e && "message" in e;
}

/** 問い合わせの結果を状態に反映する（結果はそのまま返す） */
export function track<T>(p: Promise<T>): Promise<T> {
  return p.then(
    (v) => {
      useConnectionStatus.setState({ lastOk: Date.now(), authError: null });
      return v;
    },
    (e: unknown) => {
      if (isAppError(e) && e.code === "AUTH") {
        useConnectionStatus.setState({ authError: { at: Date.now(), error: e } });
      }
      throw e;
    },
  );
}
