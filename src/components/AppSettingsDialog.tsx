import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, FileText, FolderOpen, Loader2, Monitor, Moon, Sun, XCircle } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import {
  customFontFamily,
  DEFAULT_APPEARANCE,
  type FontPreset,
  type LanguageSetting,
  MONO_PRESETS,
  SANS_PRESETS,
  type ThemeMode,
  ZOOM_OPTIONS,
  DOCUMENT_PAGE_SIZES,
  USER_PAGE_SIZES,
} from "@/lib/appearance";
import { type GcloudStatus, gcloudStatus, openLicenses, pickGcloudPath, toAppError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { REPOSITORY_URL } from "@/lib/support";
import { useStore } from "@/store";
import { type MessageKey, useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM = "__custom__";
const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <Label className="pt-2 text-muted-foreground">{label}</Label>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

const THEMES: { value: ThemeMode; labelKey: MessageKey; icon: React.ReactNode }[] = [
  { value: "system", labelKey: "settings.themeSystem", icon: <Monitor /> },
  { value: "light", labelKey: "settings.themeLight", icon: <Sun /> },
  { value: "dark", labelKey: "settings.themeDark", icon: <Moon /> },
];

/** 言語名は現在の表示言語に関係なく、その言語自身の表記で出す */
const LANGUAGES: { value: LanguageSetting; labelKey?: MessageKey; label?: string }[] = [
  { value: "system", labelKey: "settings.languageSystem" },
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

/** プリセットの選択と、フォント名の直接入力 */
function FontPicker({
  value,
  presets,
  fallback,
  onChange,
  previewClass,
}: {
  value: string;
  presets: FontPreset[];
  fallback: string;
  onChange: (fontFamily: string) => void;
  previewClass: string;
}) {
  const t = useT();
  const preset = presets.find((p) => p.value === value);
  const [custom, setCustom] = useState(preset ? "" : value);
  const [mode, setMode] = useState(preset ? value || "default" : CUSTOM);

  // 外部から値が変わった（リセットなど）ときに表示を合わせる
  useEffect(() => {
    const p = presets.find((x) => x.value === value);
    if (p) setMode(value || "default");
  }, [value, presets]);

  return (
    <>
      <Select
        value={mode}
        onValueChange={(v) => {
          setMode(v);
          if (v !== CUSTOM) onChange(v === "default" ? "" : v);
          else if (custom.trim()) onChange(customFontFamily(custom, fallback));
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.value || "default"} value={p.value || "default"}>
              <span style={{ fontFamily: p.value || undefined }}>{p.labelKey ? t(p.labelKey) : p.label}</span>
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>{t("settings.customFont")}</SelectItem>
        </SelectContent>
      </Select>
      {mode === CUSTOM && (
        <Input
          value={custom}
          placeholder={t("settings.customFontPlaceholder")}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(customFontFamily(e.target.value, fallback));
          }}
        />
      )}
      <div className={`rounded-md border px-3 py-2 ${previewClass}`}>
        {t("settings.fontPreview")} 0123456789 {"{ \"$timestamp\": \"2026-01-01\" }"}
      </div>
    </>
  );
}

/** gcloud CLI の場所。空欄なら Rust 側が自動で探す（PATH・よくある場所・ログインシェル） */
function GcloudPathSetting({ open }: { open: boolean }) {
  const t = useT();
  const saved = useStore((s) => s.gcloudPath);
  const setGcloudPath = useStore((s) => s.setGcloudPath);
  const [draft, setDraft] = useState(saved ?? "");
  const [status, setStatus] = useState<GcloudStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await gcloudStatus());
    } finally {
      setChecking(false);
    }
  };
  const apply = async (path: string | null) => {
    try {
      await setGcloudPath(path);
      setDraft(path ?? "");
      await check();
    } catch (e) {
      notifyError(toAppError(e));
    }
  };

  useEffect(() => {
    if (!open) return;
    setDraft(saved ?? "");
    void check();
    // 開いたときだけ確認する（saved の変更では確認し直さない）
  }, [open]);

  const dirty = draft.trim() !== (saved ?? "");
  return (
    <>
      <div className="flex gap-2">
        <Input
          className="min-w-0 flex-1 font-mono text-xs"
          value={draft}
          placeholder={t("settings.gcloudPlaceholder")}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) void apply(draft);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const picked = await pickGcloudPath().catch(() => null);
            if (picked) await apply(picked);
          }}
        >
          <FolderOpen /> {t("settings.gcloudBrowse")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <Button size="sm" onClick={() => void apply(draft)}>
            {t("settings.gcloudApply")}
          </Button>
        )}
        {saved && (
          <Button variant="ghost" size="sm" onClick={() => void apply(null)}>
            {t("settings.gcloudAuto")}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={checking} onClick={() => void check()}>
          {t("settings.gcloudCheck")}
        </Button>
      </div>
      <div className="text-xs">
        {checking ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t("settings.gcloudChecking")}
          </span>
        ) : status?.path && !status.error ? (
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <div>
                {status.version ?? "gcloud"}
                <span className="text-muted-foreground">
                  {" · "}
                  {status.custom ? t("settings.gcloudFoundCustom") : t("settings.gcloudFoundAuto")}
                </span>
              </div>
              <div className="break-all font-mono text-muted-foreground">{status.path}</div>
            </div>
          </div>
        ) : status ? (
          <div className="flex items-start gap-1.5 text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-all">{status.error}</span>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.gcloudHint", { command: isWindows ? "where gcloud" : "which gcloud" })}
      </p>
    </>
  );
}

export function AppSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const appearance = useStore((s) => s.appearance);
  const setAppearance = useStore((s) => s.setAppearance);
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Row label={t("settings.language")}>
            <div className="flex rounded-md border p-0.5">
              {LANGUAGES.map((l) => (
                <Button
                  key={l.value}
                  size="sm"
                  className="flex-1"
                  variant={appearance.language === l.value ? "secondary" : "ghost"}
                  onClick={() => setAppearance({ language: l.value })}
                >
                  {l.labelKey ? t(l.labelKey) : l.label}
                </Button>
              ))}
            </div>
          </Row>

          <Row label={t("settings.theme")}>
            <div className="flex rounded-md border p-0.5">
              {THEMES.map((th) => (
                <Button
                  key={th.value}
                  size="sm"
                  className="flex-1"
                  variant={appearance.theme === th.value ? "secondary" : "ghost"}
                  onClick={() => setAppearance({ theme: th.value })}
                >
                  {th.icon} {t(th.labelKey)}
                </Button>
              ))}
            </div>
          </Row>

          <Row label={t("settings.fontSans")}>
            <FontPicker
              value={appearance.fontSans}
              presets={SANS_PRESETS}
              fallback="sans-serif"
              onChange={(fontSans) => setAppearance({ fontSans })}
              previewClass="font-sans"
            />
          </Row>

          <Row label={t("settings.fontMono")}>
            <FontPicker
              value={appearance.fontMono}
              presets={MONO_PRESETS}
              fallback="monospace"
              onChange={(fontMono) => setAppearance({ fontMono })}
              previewClass="font-mono text-xs"
            />
          </Row>

          <Row label={t("settings.zoom")}>
            <Select
              value={String(appearance.zoom)}
              onValueChange={(v) => setAppearance({ zoom: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZOOM_OPTIONS.map((z) => (
                  <SelectItem key={z} value={String(z)}>
                    {Math.round(z * 100)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label={t("settings.documentPageSize")}>
            <Select
              value={String(appearance.documentPageSize)}
              onValueChange={(v) => setAppearance({ documentPageSize: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t("common.count", { count: n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.pageSizeHint")}</p>
          </Row>

          <Row label={t("settings.userPageSize")}>
            <Select
              value={String(appearance.userPageSize)}
              onValueChange={(v) => setAppearance({ userPageSize: Number(v) })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t("common.count", { count: n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label={t("settings.gcloud")}>
            <GcloudPathSetting open={open} />
          </Row>

          <Row label={t("settings.about")}>
            <p className="pt-2 text-sm">
              Irori Desk {version} ·{" "}
              <button className="underline underline-offset-2" onClick={() => void openUrl(REPOSITORY_URL)}>
                GitHub
              </button>
            </p>
            <p className="text-xs text-muted-foreground">{t("settings.license")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openLicenses().catch((e) => notifyError(toAppError(e)))}
            >
              <FileText /> {t("settings.thirdPartyLicenses")}
            </Button>
          </Row>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
            {t("settings.reset")}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
