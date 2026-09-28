import { toast } from "sonner";
import type { AppError } from "./api";

/** 画面の隅に一時的に出す通知。結果の表示方法をアプリ全体でそろえる */
export function notifySuccess(message: string, description?: string) {
  toast.success(message, { description });
}

/** エラーは自動では閉じず、詳細（HTTP ステータスなど）も表示する */
export function notifyError(error: AppError) {
  toast.error(error.message, { description: error.detail ?? undefined, duration: Infinity, closeButton: true });
}
