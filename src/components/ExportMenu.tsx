import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { type DisplayDocument, saveTextFile, toAppError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { defaultFileName, EXPORT_FORMATS, type ExportFormat, exportContents } from "@/lib/export";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const count = docs.filter((d) => !d.missing).length;

  const run = async (format: ExportFormat) => {
    const f = EXPORT_FORMATS[format];
    setBusy(true);
    try {
      const path = await saveTextFile(
        defaultFileName(baseName, format),
        t(`export.filterName.${format}`),
        f.extension,
        exportContents(docs, format, fields),
      );
      if (path) notifySuccess(t("export.saved"), path);
    } catch (e) {
      notifyError(toAppError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs" disabled={busy || count === 0} title={t("export.buttonTitle")}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            <span className="hidden @md:inline">{t("export.button")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("export.loadedCount", { count })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
            <DropdownMenuItem key={format} onSelect={() => void run(format)}>
              <span className="w-10 font-medium">{EXPORT_FORMATS[format].label}</span>
              <span className="text-xs text-muted-foreground">{t(`export.hint.${format}`)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
