import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Heart, Monitor, Moon, Sun } from "lucide-react";
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
import { SUPPORT_LINKS } from "@/lib/support";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
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

          <Row label={t("settings.support")}>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_LINKS.map((l) => (
                <Button key={l.id} variant="outline" size="sm" onClick={() => void openUrl(l.url)}>
                  <Heart /> {l.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.supportHint")}</p>
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
