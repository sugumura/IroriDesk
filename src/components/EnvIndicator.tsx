import { Lock } from "lucide-react";
import type { ConnectionKind } from "@/lib/api";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** 接続の種類ごとの色。本番は注意を引く赤系、Emulator は落ち着いた青緑系 */
export const ENV_COLOR: Record<ConnectionKind, { bar: string; dot: string; badge: string }> = {
  production: {
    bar: "bg-rose-500 dark:bg-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  emulator: {
    bar: "bg-teal-500 dark:bg-teal-400",
    dot: "bg-teal-500 dark:bg-teal-400",
    badge: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
};

export function EnvDot({ kind, className }: { kind: ConnectionKind; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", ENV_COLOR[kind].dot, className)} />;
}

/** 接続の種類と読み取り専用を1つにまとめたバッジ */
export function EnvBadge({ kind }: { kind: ConnectionKind }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs font-medium",
        ENV_COLOR[kind].badge,
      )}
      title={t("topbar.readOnlyHint")}
    >
      <Lock className="size-3" />
      {kind === "emulator" ? "Emulator" : t("topbar.production")}
    </span>
  );
}
