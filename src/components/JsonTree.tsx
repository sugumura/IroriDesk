import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DisplayValue } from "@/lib/api";
import { asWrapper, displayKey, isPlainObject } from "@/lib/display";
import { parseJsonString } from "@/lib/jsonString";
import { CopyButton } from "./CopyButton";
import { ValueView, typeLabel } from "./ValueView";
import { useT } from "@/i18n";

function isContainer(v: DisplayValue): v is DisplayValue[] | { [k: string]: DisplayValue } {
  return (Array.isArray(v) || isPlainObject(v)) && asWrapper(v) === null;
}

/** フィールド値のコピー内容。文字列はそのまま、それ以外は表示用JSON */
export function copyText(v: DisplayValue): string {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function Node({
  name,
  value,
  depth,
  defaultOpenDepth,
}: {
  name: string;
  value: DisplayValue;
  depth: number;
  defaultOpenDepth: number;
}) {
  const t = useT();
  const container = isContainer(value);
  // JSON を文字列にして保存した値は、文字列のまま見せつつ中身をツリーで開けるようにする（最初は閉じる）
  const nested = useMemo(() => {
    if (typeof value !== "string") return null;
    const parsed = parseJsonString(value);
    return parsed !== null && isContainer(parsed) ? parsed : null;
  }, [value]);
  const expandable = container || nested !== null;
  const [open, setOpen] = useState(container && depth < defaultOpenDepth);
  const source = container ? value : nested;
  const entries: [string, DisplayValue][] = source
    ? Array.isArray(source)
      ? source.map((v, i) => [String(i), v])
      : Object.entries(source).map(([k, v]) => [displayKey(k), v])
    : [];

  return (
    <div>
      <div
        className="group flex min-h-6 items-center gap-1 rounded px-1 hover:bg-muted"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        {expandable ? (
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => setOpen((o) => !o)}
            title={open ? t("detail.collapse") : t("detail.expand")}
            aria-label={open ? t("detail.collapse") : t("detail.expand")}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span
          className="shrink-0 cursor-default font-medium"
          onClick={() => expandable && setOpen((o) => !o)}
        >
          {name}
        </span>
        <span className="shrink-0 text-muted-foreground">:</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {container ? (
            <span className="text-muted-foreground">{typeLabel(value)}</span>
          ) : (
            <ValueView value={value} />
          )}
        </span>
        {nested !== null && (
          <span
            className="shrink-0 rounded border px-1 text-[10px] leading-4 text-muted-foreground"
            title={t("detail.jsonStringHint")}
          >
            JSON
          </span>
        )}
        {container || <span className="shrink-0 text-[10px] text-muted-foreground">{typeLabel(value)}</span>}
        <CopyButton
          text={() => copyText(value)}
          className="opacity-0 group-hover:opacity-100"
          label={t("detail.copyValue")}
        />
      </div>
      {expandable && open && (
        <div>
          {entries.length === 0 && (
            <div className="text-xs text-muted-foreground" style={{ paddingLeft: (depth + 1) * 14 + 24 }}>
              {t("detail.empty")}
            </div>
          )}
          {entries.map(([k, v]) => (
            <Node key={k} name={k} value={v} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ fields }: { fields: Record<string, DisplayValue> }) {
  const t = useT();
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return <div className="px-2 text-muted-foreground">{t("detail.noFields")}</div>;
  }
  return (
    <div className="text-sm">
      {entries.map(([k, v]) => (
        <Node key={k} name={displayKey(k)} value={v} depth={0} defaultOpenDepth={1} />
      ))}
    </div>
  );
}
