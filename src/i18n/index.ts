/**
 * 画面の文言の日本語・英語の切り替え。
 * 辞書は messages/ 以下に機能ごとに置き、英語の辞書は日本語と同じ形でなければ型エラーになる。
 *
 * 使い方:
 *   const t = useT();                 // コンポーネント内（言語の変更で再描画される）
 *   t("browse.loaded", { count: 3 }); // "{count} 件読み込み済み" の {count} を置き換える
 *   translate("common.close");        // コンポーネント外（その時点の言語）
 */
import { useStore } from "@/store";
import type { LanguageSetting } from "@/lib/appearance";
import { messages } from "./messages";

export type Lang = "ja" | "en";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** "browse.loaded" のようなキー */
export type MessageKey = Leaves<(typeof messages)["ja"]>;
export type Params = Record<string, string | number>;

/** OS（WebView）の言語が日本語なら ja、それ以外は en */
export function systemLang(): Lang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => l?.toLowerCase().startsWith("ja")) ? "ja" : "en";
}

export function resolveLang(setting: LanguageSetting): Lang {
  return setting === "system" ? systemLang() : setting;
}

function lookup(lang: Lang, key: string): string | undefined {
  let node: unknown = messages[lang];
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function format(lang: Lang, key: MessageKey, params?: Params): string {
  const text = lookup(lang, key) ?? lookup("ja", key) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

export type TFunction = (key: MessageKey, params?: Params) => string;

/** 現在の言語で翻訳する関数。言語が変わるとコンポーネントが再描画される */
export function useT(): TFunction {
  const lang = useStore((s) => resolveLang(s.appearance.language));
  return (key, params) => format(lang, key, params);
}

export function useLang(): Lang {
  return useStore((s) => resolveLang(s.appearance.language));
}

/** コンポーネント外で使う（その時点の言語） */
export function translate(key: MessageKey, params?: Params): string {
  return format(resolveLang(useStore.getState().appearance.language), key, params);
}
