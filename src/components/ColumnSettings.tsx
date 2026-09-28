import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Pin } from "lucide-react";
import { moveField, orderedFields, setFieldHidden } from "@/lib/columns";
import { displayKey } from "@/lib/display";
import type { ColumnLayout } from "@/lib/useColumnLayout";
import { useT } from "@/i18n";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** テーブルに表示する列の選択と並べ替え（接続×コレクションごとに保存） */
export function ColumnSettings({ layout, idLabel = "Doc ID" }: { layout: ColumnLayout; idLabel?: string }) {
  const t = useT();
  const setColumnConfig = useStore((s) => s.setColumnConfig);
  const [filter, setFilter] = useState("");
  const { fieldNames, config, key } = layout;

  const ordered = useMemo(() => orderedFields(fieldNames, config), [fieldNames, config]);
  const hidden = new Set(config.hidden);
  const q = filter.trim().toLowerCase();
  const shown = q ? ordered.filter((k) => displayKey(k).toLowerCase().includes(q)) : ordered;
  const hiddenCount = fieldNames.filter((k) => hidden.has(k)).length;

  if (!key) return null;
  const save = (c: typeof config) => setColumnConfig(key, c);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" title={t("columns.title")}>
          <Columns3 />
          <span className="hidden @lg:inline">{t("columns.button")}</span>
          {hiddenCount > 0 && <span className="text-muted-foreground">（{hiddenCount}<span className="hidden @lg:inline">{t("columns.hiddenCount")}</span>）</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-2 border-b p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("columns.filterPlaceholder")}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button variant="outline" size="xs" onClick={() => save({ ...config, hidden: [] })}>
              {t("columns.showAll")}
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => save({ ...config, hidden: [...new Set([...config.hidden, ...fieldNames])] })}
            >
              {t("columns.hideAll")}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="xs" onClick={() => setColumnConfig(key, null)} title={t("columns.resetTitle")}>
              {t("columns.reset")}
            </Button>
          </div>
        </div>

        <div className="max-h-80 overflow-auto p-1">
          <div className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground" title={t("columns.pinnedTitle", { label: idLabel })}>
            <Pin className="size-3.5" /> {t("columns.pinned", { label: idLabel })}
          </div>
          {shown.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">{t("columns.noMatch")}</div>}
          {shown.map((k) => {
            const index = ordered.indexOf(k);
            return (
              <div key={k} className="group flex h-7 items-center gap-2 rounded px-2 hover:bg-muted">
                <Checkbox
                  id={`col-${k}`}
                  checked={!hidden.has(k)}
                  onCheckedChange={(v) => save(setFieldHidden(config, k, v !== true))}
                />
                <label htmlFor={`col-${k}`} className="min-w-0 flex-1 cursor-pointer truncate font-mono text-xs">
                  {displayKey(k)}
                </label>
                {/* 絞り込み中は隣が見えないため並べ替えを無効にする */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={!!q || index === 0}
                  className="opacity-0 group-hover:opacity-100"
                  title={t("columns.moveUp")}
                  onClick={() => save(moveField(fieldNames, config, k, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={!!q || index === ordered.length - 1}
                  className="opacity-0 group-hover:opacity-100"
                  title={t("columns.moveDown")}
                  onClick={() => save(moveField(fieldNames, config, k, 1))}
                >
                  <ArrowDown />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          {t("columns.footer")}
        </div>
      </PopoverContent>
    </Popover>
  );
}
