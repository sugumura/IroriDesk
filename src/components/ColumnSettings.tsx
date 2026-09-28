import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Pin } from "lucide-react";
import { moveField, orderedFields, setFieldHidden } from "@/lib/columns";
import { displayKey } from "@/lib/display";
import type { ColumnLayout } from "@/lib/useColumnLayout";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** テーブルに表示する列の選択と並べ替え（接続×コレクションごとに保存） */
export function ColumnSettings({ layout }: { layout: ColumnLayout }) {
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
        <Button variant="ghost" size="xs" title="表示する列の設定">
          <Columns3 />
          列{hiddenCount > 0 && <span className="text-muted-foreground">（{hiddenCount} 件非表示）</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-2 border-b p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="フィールドを絞り込み"
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button variant="outline" size="xs" onClick={() => save({ ...config, hidden: [] })}>
              すべて表示
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => save({ ...config, hidden: [...new Set([...config.hidden, ...fieldNames])] })}
            >
              すべて非表示
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="xs" onClick={() => setColumnConfig(key, null)} title="並び順と表示を既定に戻す">
              リセット
            </Button>
          </div>
        </div>

        <div className="max-h-80 overflow-auto p-1">
          <div className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground" title="Doc ID 列は常に先頭に表示されます">
            <Pin className="size-3.5" /> Doc ID（固定）
          </div>
          {shown.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">該当するフィールドはありません</div>}
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
                  title="上へ"
                  onClick={() => save(moveField(fieldNames, config, k, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={!!q || index === ordered.length - 1}
                  className="opacity-0 group-hover:opacity-100"
                  title="下へ"
                  onClick={() => save(moveField(fieldNames, config, k, 1))}
                >
                  <ArrowDown />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          設定はこの接続・コレクションごとに保存され、CSV/TSV エクスポートの列にも使われます
        </div>
      </PopoverContent>
    </Popover>
  );
}
