import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type FieldInfo, NAME_FIELD } from "@/lib/fields";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const MAX_ITEMS = 100;

/** フィールド名の入力欄。サンプルから得たフィールドパスを候補として出す */
export function FieldInput({
  value,
  onChange,
  onPick,
  suggestions,
  loading,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 候補を選んだとき。指定した場合は onChange の代わりに呼ばれ、フィールド名の反映も担う */
  onPick?: (field: FieldInfo) => void;
  suggestions: FieldInfo[];
  loading?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const items = q ? suggestions.filter((s) => s.path.toLowerCase().includes(q)) : suggestions;
    // 前方一致を優先する
    return [...items]
      .sort((a, b) => Number(!a.path.toLowerCase().startsWith(q)) - Number(!b.path.toLowerCase().startsWith(q)))
      .slice(0, MAX_ITEMS);
  }, [value, suggestions]);

  const show = open && (filtered.length > 0 || loading);

  // フォームはスクロール領域の中にあるため、候補は body 直下に fixed で出す
  useLayoutEffect(() => {
    if (!show) return;
    const update = () => setRect(inputRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [show]);

  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (f: FieldInfo) => {
    if (onPick) onPick(f);
    else onChange(f.path);
    setOpen(false);
  };

  return (
    <>
      <Input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!show) {
            if (e.key === "ArrowDown") setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && !(e.metaKey || e.ctrlKey) && filtered[active]) {
            // 候補の確定でフォームを送信しない（⌘/Ctrl+Enter は実行のまま）
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      {show &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            className="fixed z-50 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ top: rect.bottom + 2, left: rect.left, minWidth: Math.max(rect.width, 260) }}
            // フォーカスを入力欄に残したまま選択する
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && filtered.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">{t("query.fieldsLoading")}</div>
            )}
            {filtered.map((f, i) => (
              <div
                key={f.path}
                data-index={i}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded px-2 py-1 font-mono text-xs",
                  i === active && "bg-accent text-accent-foreground",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(f)}
              >
                <span className="min-w-0 flex-1 truncate">{f.path}</span>
                <span className="shrink-0 font-sans text-[10px] text-muted-foreground">
                  {f === NAME_FIELD ? t("query.documentId") : f.typeLabel}
                  {f.count > 0 && ` · ${t("query.fieldCount", { count: f.count })}`}
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
