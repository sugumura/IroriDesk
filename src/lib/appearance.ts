import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemeMode = "system" | "light" | "dark";

export interface Appearance {
  theme: ThemeMode;
  /** CSS の font-family。空なら既定 */
  fontSans: string;
  fontMono: string;
  /** WebView の拡大率（1 = 100%） */
  zoom: number;
}

const JP_FALLBACK = "'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif";
const MONO_FALLBACK = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export const DEFAULT_FONT_SANS = `'Geist Variable', -apple-system, BlinkMacSystemFont, ${JP_FALLBACK}`;
export const DEFAULT_FONT_MONO = MONO_FALLBACK;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  fontSans: "",
  fontMono: "",
  zoom: 1,
};

export interface FontPreset {
  label: string;
  /** 空文字は既定 */
  value: string;
}

/** OS にインストールされていないフォントは代替フォントで表示される */
export const SANS_PRESETS: FontPreset[] = [
  { label: "既定（Geist + システム）", value: "" },
  { label: "システム", value: `-apple-system, BlinkMacSystemFont, 'Segoe UI', ${JP_FALLBACK}` },
  { label: "ヒラギノ角ゴシック", value: `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', ${JP_FALLBACK}` },
  { label: "游ゴシック", value: `'Yu Gothic UI', 'YuGothic', 'Yu Gothic', ${JP_FALLBACK}` },
  { label: "Noto Sans JP", value: `'Noto Sans JP', ${JP_FALLBACK}` },
  { label: "BIZ UDPゴシック", value: `'BIZ UDPGothic', ${JP_FALLBACK}` },
  { label: "メイリオ", value: `'Meiryo', ${JP_FALLBACK}` },
];

export const MONO_PRESETS: FontPreset[] = [
  { label: "既定（システムの等幅）", value: "" },
  { label: "SF Mono", value: `'SF Mono', ${MONO_FALLBACK}` },
  { label: "Menlo", value: `Menlo, ${MONO_FALLBACK}` },
  { label: "Consolas", value: `Consolas, ${MONO_FALLBACK}` },
  { label: "JetBrains Mono", value: `'JetBrains Mono', ${MONO_FALLBACK}` },
  { label: "Source Code Pro", value: `'Source Code Pro', ${MONO_FALLBACK}` },
  { label: "Osaka−等幅", value: `'Osaka-Mono', 'Osaka', ${MONO_FALLBACK}` },
];

export const ZOOM_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5];

/** 入力されたフォント名を font-family にする。カンマを含めばそのまま、単一の名前なら引用して代替を付ける */
export function customFontFamily(input: string, fallback: string): string {
  const t = input.trim();
  if (!t) return "";
  if (t.includes(",")) return t;
  const quoted = /^['"].*['"]$/.test(t) ? t : `'${t.replace(/'/g, "\\'")}'`;
  return `${quoted}, ${fallback}`;
}

export function normalizeAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const theme = a?.theme === "light" || a?.theme === "dark" ? a.theme : "system";
  const zoom = typeof a?.zoom === "number" && a.zoom >= 0.5 && a.zoom <= 2 ? a.zoom : 1;
  return {
    theme,
    fontSans: typeof a?.fontSans === "string" ? a.fontSans : "",
    fontMono: typeof a?.fontMono === "string" ? a.fontMono : "",
    zoom,
  };
}

const media = window.matchMedia("(prefers-color-scheme: dark)");
let currentTheme: ThemeMode = "system";

function applyThemeClass() {
  const dark = currentTheme === "dark" || (currentTheme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
}
media.addEventListener("change", applyThemeClass);

/** 画面に反映する。ネイティブ側（タイトルバーのテーマ、拡大率）の失敗は無視する */
export function applyAppearance(a: Appearance) {
  currentTheme = a.theme;
  applyThemeClass();

  const root = document.documentElement.style;
  root.setProperty("--app-font-sans", a.fontSans || DEFAULT_FONT_SANS);
  root.setProperty("--app-font-mono", a.fontMono || DEFAULT_FONT_MONO);

  void getCurrentWindow()
    .setTheme(a.theme === "system" ? null : a.theme)
    .catch(() => undefined);
  void getCurrentWebview()
    .setZoom(a.zoom)
    .catch(() => undefined);
}

/** 起動直後（設定の読み込み前）は OS の設定に追従させる */
export function applyInitialTheme() {
  applyThemeClass();
}
