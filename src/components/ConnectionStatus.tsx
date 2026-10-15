import { useEffect, useState } from "react";
import { Loader2, LogIn, RefreshCw } from "lucide-react";
import { translate, useT } from "@/i18n";
import { adcLogin, gcloudLogin, type TokenStatus, tokenStatus, toAppError } from "@/lib/api";
import { useConnectionStatus } from "@/lib/connectionStatus";
import { formatTimestamp } from "@/lib/display";
import { notifyError, notifySuccess } from "@/lib/notify";
import { loadLastLogins, recordLogin } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { activeConnection, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

let reauthRunning = false;

/**
 * 今の接続でログインし直す（gcloud のアカウントなら gcloud auth login、ADC なら application-default login）。
 * 成功したら、開いている一覧を読み込み直す。エラー表示の「再ログイン」からも使う
 */
export async function reauthenticate(): Promise<boolean> {
  const s = useStore.getState();
  const conn = activeConnection(s);
  if (!conn || conn.kind === "emulator" || reauthRunning) return false;
  reauthRunning = true;
  try {
    if (conn.account) await gcloudLogin(conn.account);
    else await adcLogin();
    await recordLogin(conn.account ?? "adc");
    useConnectionStatus.setState({ authError: null });
    notifySuccess(translate("status.reloginDone"));
    void s.loadRootCollections();
    s.reloadActiveTab();
    return true;
  } catch (e) {
    notifyError(toAppError(e));
    return false;
  } finally {
    reauthRunning = false;
  }
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return translate("status.justNow");
  if (mins < 60) return translate("status.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 48) return translate("status.hoursAgo", { n: hours });
  return translate("status.daysAgo", { n: Math.floor(hours / 24) });
}

/** トップバーの「接続の状態」。本番接続のときだけ出す */
export function ConnectionStatus() {
  const t = useT();
  const conn = useStore(activeConnection);
  const { lastOk, authError, reset } = useConnectionStatus();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<TokenStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [relogging, setRelogging] = useState(false);

  // 接続を切り替えたら状態を捨てる
  useEffect(() => {
    reset();
    setToken(null);
  }, [conn?.id, reset]);

  const check = async () => {
    if (!conn) return;
    setChecking(true);
    try {
      setToken(await tokenStatus(conn));
      useConnectionStatus.setState({ lastOk: Date.now(), authError: null });
    } catch (e) {
      const err = toAppError(e);
      setToken(null);
      if (err.code === "AUTH") useConnectionStatus.setState({ authError: { at: Date.now(), error: err } });
      else notifyError(err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!open || !conn) return;
    void check();
    loadLastLogins().then((all) => setLastLogin(all[conn.account ?? "adc"] ?? null), () => {});
    // 開いたときだけ確認する
  }, [open]);

  if (!conn || conn.kind === "emulator") return null;
  const state = authError ? "error" : lastOk ? "ok" : "unknown";
  const relogin = async () => {
    setRelogging(true);
    const ok = await reauthenticate();
    setRelogging(false);
    if (ok) {
      void check();
      setLastLogin(new Date().toISOString());
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title={t("status.title")}>
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              state === "ok" && "bg-emerald-500",
              state === "error" && "bg-red-500",
              state === "unknown" && "bg-muted-foreground/40",
            )}
          />
          <span className={cn(state === "error" && "text-red-600 dark:text-red-400")}>{t(`status.${state}`)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3 text-sm" align="start">
        <div className="font-medium">{t("status.title")}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">{t("status.method")}</dt>
          <dd className="break-all">
            {conn.account
              ? t("status.methodGcloud", { account: conn.account })
              : token?.account
                ? t("status.methodAdcAccount", { account: token.account })
                : t("status.methodAdc")}
          </dd>
          <dt className="text-muted-foreground">{t("status.token")}</dt>
          <dd>
            {checking
              ? t("status.tokenChecking")
              : token?.expiresInSecs != null
                ? t("status.tokenRemaining", { minutes: Math.max(0, Math.floor(token.expiresInSecs / 60)) })
                : "—"}
          </dd>
          <dt className="text-muted-foreground">{t("status.lastLogin")}</dt>
          <dd>{lastLogin ? t("status.lastLoginAgo", { ago: ago(lastLogin) }) : t("status.lastLoginUnknown")}</dd>
          <dt className="text-muted-foreground">{t("status.lastOk")}</dt>
          <dd>{lastOk ? formatTimestamp(new Date(lastOk).toISOString()).slice(0, 19) : t("status.never")}</dd>
        </dl>
        {authError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <div className="font-medium">
              {t("status.errorAt", { time: formatTimestamp(new Date(authError.at).toISOString()).slice(11, 19) })}
            </div>
            <div className="mt-0.5 break-words">{authError.error.message}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={authError ? "default" : "outline"} disabled={relogging} onClick={() => void relogin()}>
            {relogging ? <Loader2 className="animate-spin" /> : <LogIn />}
            {relogging ? t("status.reloggingIn") : conn.account ? t("status.relogin") : t("status.reloginAdc")}
          </Button>
          <Button size="sm" variant="ghost" disabled={checking} onClick={() => void check()}>
            <RefreshCw /> {t("status.recheck")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("status.sessionNote")}</p>
      </PopoverContent>
    </Popover>
  );
}
