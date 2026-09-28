import { Search, X } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** 読み込み済みの結果を手元で絞り込む入力欄（フッター用） */
export function FilterInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <label
      className={cn(
        "flex h-6 min-w-0 items-center gap-1 rounded-md border bg-background px-1.5 text-xs focus-within:ring-2 focus-within:ring-ring/40",
        value && "border-primary/50",
        className,
      )}
    >
      <Search className="size-3 shrink-0 text-muted-foreground" />
      <input
        data-local-filter
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={t("browse.filterPlaceholder")}
        className="w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
        spellCheck={false}
      />
      {value && (
        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onChange("")}>
          <X className="size-3" />
        </button>
      )}
    </label>
  );
}
