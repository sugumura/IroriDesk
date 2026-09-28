import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  customFontFamily,
  DEFAULT_APPEARANCE,
  type FontPreset,
  MONO_PRESETS,
  SANS_PRESETS,
  type ThemeMode,
  ZOOM_OPTIONS,
} from "@/lib/appearance";
import { useStore } from "@/store";
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

const THEMES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "システム", icon: <Monitor /> },
  { value: "light", label: "ライト", icon: <Sun /> },
  { value: "dark", label: "ダーク", icon: <Moon /> },
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
            <SelectItem key={p.label} value={p.value || "default"}>
              <span style={{ fontFamily: p.value || undefined }}>{p.label}</span>
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>フォント名を入力…</SelectItem>
        </SelectContent>
      </Select>
      {mode === CUSTOM && (
        <Input
          value={custom}
          placeholder="例: Inter / 'Fira Code', monospace"
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(customFontFamily(e.target.value, fallback));
          }}
        />
      )}
      <div className={`rounded-md border px-3 py-2 ${previewClass}`}>
        Firestore ビューア 0123456789 {"{ \"$timestamp\": \"2026-01-01\" }"}
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
  const appearance = useStore((s) => s.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>変更はすぐに反映され、自動で保存されます。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Row label="テーマ">
            <div className="flex rounded-md border p-0.5">
              {THEMES.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  className="flex-1"
                  variant={appearance.theme === t.value ? "secondary" : "ghost"}
                  onClick={() => setAppearance({ theme: t.value })}
                >
                  {t.icon} {t.label}
                </Button>
              ))}
            </div>
          </Row>

          <Row label="UI フォント">
            <FontPicker
              value={appearance.fontSans}
              presets={SANS_PRESETS}
              fallback="sans-serif"
              onChange={(fontSans) => setAppearance({ fontSans })}
              previewClass="font-sans"
            />
          </Row>

          <Row label="等幅フォント">
            <FontPicker
              value={appearance.fontMono}
              presets={MONO_PRESETS}
              fallback="monospace"
              onChange={(fontMono) => setAppearance({ fontMono })}
              previewClass="font-mono text-xs"
            />
          </Row>

          <Row label="表示サイズ">
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
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setAppearance(DEFAULT_APPEARANCE)}>
            既定に戻す
          </Button>
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
