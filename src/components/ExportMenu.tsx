import { useState } from "react";
import { CircleCheck, Download, Loader2 } from "lucide-react";
import { type AppError, type DisplayDocument, saveTextFile, toAppError } from "@/lib/api";
import { defaultFileName, EXPORT_FORMATS, type ExportFormat, exportContents } from "@/lib/export";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FORMAT_HINTS: Record<ExportFormat, string> = {
  json: "型情報を保持（表示用JSON）",
  csv: "Excel / スプレッドシート向け",
  tsv: "タブ区切り",
};

/** 表示中の結果（読み込み済みの分）を保存する */
export function ExportMenu({
  docs,
  fields,
  baseName,
}: {
  docs: DisplayDocument[];
  /** CSV/TSV に出す列（テーブルの列設定） */
  fields: string[];
  baseName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: true; path: string } | { ok: false; error: AppError } | null>(null);
  const count = docs.filter((d) => !d.missing).length;

  const run = async (format: ExportFormat) => {
    const f = EXPORT_FORMATS[format];
    setBusy(true);
    setStatus(null);
    try {
      const path = await saveTextFile(
        defaultFileName(baseName, format),
        f.filterName,
        f.extension,
        exportContents(docs, format, fields),
      );
      if (path) {
        setStatus({ ok: true, path });
        setTimeout(() => setStatus(null), 4000);
      }
    } catch (e) {
      setStatus({ ok: false, error: toAppError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      {status?.ok === true && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" title={status.path}>
          <CircleCheck className="size-3.5 shrink-0" />
          <span className="truncate">保存しました</span>
        </span>
      )}
      {status?.ok === false && (
        <span className="truncate text-xs text-destructive" title={status.error.message}>
          {status.error.message}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs" disabled={busy || count === 0} title="読み込み済みの結果を保存">
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            <span className="hidden @md:inline">エクスポート</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            読み込み済みの {count} 件
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
            <DropdownMenuItem key={format} onSelect={() => void run(format)}>
              <span className="w-10 font-medium">{EXPORT_FORMATS[format].label}</span>
              <span className="text-xs text-muted-foreground">{FORMAT_HINTS[format]}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
