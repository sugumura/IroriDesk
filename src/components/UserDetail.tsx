import { X } from "lucide-react";
import type { DisplayUser } from "@/lib/api";
import { formatTimestamp } from "@/lib/display";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton, CopyTextButton } from "./CopyButton";
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
  const t = useT();
  const selectUser = useStore((s) => s.selectUser);
  const setDetailOpen = useStore((s) => s.setDetailOpen);
  const claims = user.customClaims == null ? null : JSON.stringify(user.customClaims, null, 2);
  const raw = JSON.stringify(user.raw, null, 2);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-medium">{t("auth.user")}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => setDetailOpen(false)} title={t("common.close")}>
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
              {user.disabled && <Badge variant="destructive">{t("auth.disabled")}</Badge>}
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
          label={t("auth.email")}
          value={
            user.email && (
              <>
                {user.email}
                <span className="ml-2 text-xs text-muted-foreground">{user.emailVerified ? t("auth.verified") : t("auth.unverified")}</span>
              </>
            )
          }
          copy={user.email ?? undefined}
        />
        <Row label={t("auth.displayName")} value={user.displayName} />
        <Row label={t("auth.phone")} value={user.phoneNumber} mono copy={user.phoneNumber ?? undefined} />
        <Row label={t("auth.createdAt")} value={user.createdAt && <Time iso={user.createdAt} />} />
        <Row label={t("auth.lastLoginAt")} value={user.lastLoginAt && <Time iso={user.lastLoginAt} />} />
        <Row label={t("auth.lastRefreshAt")} value={user.lastRefreshAt && <Time iso={user.lastRefreshAt} />} />
        {user.tenantId && <Row label={t("auth.tenant")} value={user.tenantId} mono />}

        <div className="mt-3 px-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {t("auth.customClaims")}
            {claims && <CopyButton text={claims} />}
          </div>
          {claims ? (
            <JsonCode text={claims} className="overflow-auto rounded-md border bg-muted/40 p-2" />
          ) : (
            <div className="text-xs text-muted-foreground">{t("common.none")}</div>
          )}
        </div>

        <details className="mt-3 px-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {t("auth.rawResponse")}
          </summary>
          <div className="relative mt-1">
            <CopyButton text={raw} className="absolute top-1 right-1" />
            <JsonCode text={raw} className="overflow-auto rounded-md border bg-muted/40 p-2" />
          </div>
        </details>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t px-3">
        <CopyTextButton text={raw}>{t("common.copyJson")}</CopyTextButton>
        <Button variant="ghost" size="xs" onClick={() => selectUser(null)}>
          {t("common.clearSelection")}
        </Button>
      </div>
    </div>
  );
}
