import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { translate, useT } from "@/i18n";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useUpdates } from "@/lib/updates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** 手動の確認（メニュー・コマンドパレット・設定から）。結果を必ず表示する */
export async function checkForUpdatesManually() {
  const s = useUpdates.getState();
  try {
    if (await s.checkNow()) {
      s.setDialogOpen(true);
    } else {
      notifySuccess(translate("updates.upToDate", { version: await getVersion() }));
    }
  } catch (e) {
    notifyError({ code: "INTERNAL", message: translate("updates.checkFailed"), detail: String(e) });
  }
}

/** 起動時の確認。新しい版があれば通知だけ出し、失敗しても何も表示しない */
export function useAutoUpdateCheck(ready: boolean) {
  useEffect(() => {
    if (!ready || import.meta.env.DEV) return;
    const timer = setTimeout(async () => {
      const s = useUpdates.getState();
      await s.loadSettings();
      if (!useUpdates.getState().autoCheck) return;
      const found = await s.checkNow().catch(() => false);
      const update = useUpdates.getState().update;
      if (found && update) {
        toast.info(translate("updates.available", { version: update.version }), {
          duration: Infinity,
          closeButton: true,
          action: { label: translate("updates.details"), onClick: () => s.setDialogOpen(true) },
        });
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [ready]);
}

export function UpdateDialog() {
  const t = useT();
  const { update, dialogOpen, phase, progress, error, setDialogOpen, install } = useUpdates();
  const [current, setCurrent] = useState("");
  useEffect(() => {
    getVersion().then(setCurrent, () => {});
  }, []);
  useEffect(() => {
    if (error && phase === "idle" && dialogOpen) {
      notifyError({ code: "INTERNAL", message: t("updates.installFailed"), detail: error });
    }
    // エラーが変わったときだけ通知する
  }, [error]);

  const busy = phase === "downloading" || phase === "installing" || phase === "restarting";
  const status =
    phase === "downloading"
      ? `${t("updates.downloading")}${progress !== null ? ` ${Math.round(progress * 100)}%` : ""}`
      : phase === "installing"
        ? t("updates.installing")
        : phase === "restarting"
          ? t("updates.restarting")
          : null;

  return (
    <Dialog open={dialogOpen && update !== null} onOpenChange={(o) => !busy && setDialogOpen(o)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{update ? t("updates.available", { version: update.version }) : t("updates.title")}</DialogTitle>
          <DialogDescription>
            {t("updates.current", { version: current })}
            {update?.date && ` · ${update.date.slice(0, 10)}`}
          </DialogDescription>
        </DialogHeader>
        {update?.body && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">{t("updates.releaseNotes")}</div>
            <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-sans text-xs whitespace-pre-wrap">
              {update.body}
            </pre>
          </div>
        )}
        {status ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> {status}
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("updates.restartNote")}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setDialogOpen(false)}>
            {t("updates.later")}
          </Button>
          <Button disabled={busy} onClick={() => void install()}>
            <Download /> {t("updates.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
