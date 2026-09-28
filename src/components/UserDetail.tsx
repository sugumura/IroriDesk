import { X } from "lucide-react";
import type { DisplayUser } from "@/lib/api";
import { formatTimestamp } from "@/lib/display";
import { useStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";
import { JsonCode } from "./JsonCode";

function Row({ label, value, mono, copy }: { label: string; value: React.ReactNode; mono?: boolean; copy?: string }) {
  return (
    <div className="group grid grid-cols-[110px_1fr_auto] items-start gap-2 px-3 py-1 hover:bg-muted/60">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs break-all" : "break-all"}>{value ?? <span className="text-muted-foreground">—</span>}</span>
      {copy ? <CopyButton text={copy} className="opacity-0 group-hover:opacity-100" /> : <span className="size-5" />}
    </div>
  );
}

function Time({ iso }: { iso: string | null }) {
  return iso ? <span title={iso}>{formatTimestamp(iso)}</span> : null;
}

/** Authentication ユーザーの詳細（読み取りのみ） */
export function UserDetail({ user }: { user: DisplayUser }) {
  const selectUser = useStore((s) => s.selectUser);
  const setDetailOpen = useStore((s) => s.setDetailOpen);
  const claims = user.customClaims == null ? null : JSON.stringify(user.customClaims, null, 2);
  const raw = JSON.stringify(user.raw, null, 2);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">ユーザー</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => setDetailOpen(false)} title="閉じる">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-2">
        <div className="flex items-center gap-3 px-3 pb-2">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="" className="size-10 rounded-full border object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
              {(user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium">{user.displayName ?? user.email ?? user.uid}</div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {user.disabled && <Badge variant="destructive">無効</Badge>}
              {user.providers.map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <Row label="UID" value={user.uid} mono copy={user.uid} />
        <Row
          label="メール"
          value={
            user.email && (
              <>
                {user.email}
                <span className="ml-2 text-xs text-muted-foreground">{user.emailVerified ? "（確認済み）" : "（未確認）"}</span>
              </>
            )
          }
          copy={user.email ?? undefined}
        />
        <Row label="表示名" value={user.displayName} />
        <Row label="電話番号" value={user.phoneNumber} mono copy={user.phoneNumber ?? undefined} />
        <Row label="作成日時" value={user.createdAt && <Time iso={user.createdAt} />} />
        <Row label="最終ログイン" value={user.lastLoginAt && <Time iso={user.lastLoginAt} />} />
        <Row label="最終更新" value={user.lastRefreshAt && <Time iso={user.lastRefreshAt} />} />
        {user.tenantId && <Row label="テナント" value={user.tenantId} mono />}

        <div className="mt-3 px-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            カスタムクレーム
            {claims && <CopyButton text={claims} />}
          </div>
          {claims ? (
            <JsonCode text={claims} className="overflow-auto rounded-md border bg-muted/40 p-2" />
          ) : (
            <div className="text-xs text-muted-foreground">なし</div>
          )}
        </div>

        <details className="mt-3 px-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            API の応答（パスワードのハッシュ等は除外）
          </summary>
          <div className="relative mt-1">
            <CopyButton text={raw} className="absolute top-1 right-1" />
            <JsonCode text={raw} className="overflow-auto rounded-md border bg-muted/40 p-2" />
          </div>
        </details>
      </div>
      <div className="shrink-0 border-t px-3 py-1 text-right">
        <Button variant="ghost" size="xs" onClick={() => selectUser(null)}>
          選択解除
        </Button>
      </div>
    </div>
  );
}
