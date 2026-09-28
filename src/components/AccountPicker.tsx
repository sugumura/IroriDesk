import { useEffect, useState } from "react";
import { Loader2, LogIn, RefreshCw, RotateCcw, UserPlus } from "lucide-react";
import {
  type AppError,
  type GcloudAccount,
  gcloudLogin,
  listGcloudAccounts,
  reloadCredentials,
  toAppError,
} from "@/lib/api";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifySuccess } from "@/lib/notify";
import { ErrorBox } from "./ErrorBox";

const ADC = "__adc__";

/**
 * 本番接続で使うアカウントの選択。ADC か、gcloud CLI に登録されたアカウント。
 * 「アカウントを追加」「再ログイン」はブラウザで Google ログインを行う
 */
export function AccountPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (account: string | undefined) => void;
}) {
  const t = useT();
  const [accounts, setAccounts] = useState<GcloudAccount[] | null>(null);
  const [busy, setBusy] = useState<"list" | "login" | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = async () => {
    setBusy("list");
    setError(null);
    try {
      setAccounts(await listGcloudAccounts());
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const login = async (account?: string) => {
    setBusy("login");
    setError(null);
    const before = new Set((accounts ?? []).map((a) => a.account));
    try {
      const list = await gcloudLogin(account);
      setAccounts(list);
      // 新しく追加されたアカウントがあれば、それを選ぶ
      const added = list.find((a) => !before.has(a.account));
      if (added) onChange(added.account);
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setBusy(null);
    }
  };

  // 保存済みの値が gcloud から消えていても選択肢に残す
  const options = [...(accounts ?? [])];
  if (value && !options.some((a) => a.account === value)) options.push({ account: value, active: false });

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Select value={value ?? ADC} onValueChange={(v) => onChange(v === ADC ? undefined : v)}>
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ADC}>{t("connection.accountPicker.adc")}</SelectItem>
            {options.map((a) => (
              <SelectItem key={a.account} value={a.account}>
                {a.account}
                {a.active && <span className="text-xs text-muted-foreground">{t("connection.accountPicker.gcloudActive")}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" title={t("connection.accountPicker.refresh")} disabled={busy !== null} onClick={refresh}>
          {busy === "list" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => login()}>
          <UserPlus /> {t("connection.accountPicker.addAccount")}
        </Button>
        {value ? (
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => login(value)}>
            <LogIn /> {t("connection.accountPicker.relogin")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            title={t("connection.accountPicker.reloadAdcHint")}
            onClick={async () => {
              await reloadCredentials();
              notifySuccess(t("connection.accountPicker.reloadedAdc"));
            }}
          >
            <RotateCcw /> {t("connection.accountPicker.reloadAdc")}
          </Button>
        )}
        {busy === "login" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t("connection.accountPicker.loggingIn")}
          </span>
        )}
      </div>
      {error && <ErrorBox error={error} className="text-xs" />}
    </div>
  );
}
