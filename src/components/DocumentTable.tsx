import { useMemo, useRef } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { compareValues } from "@/lib/localView";
import type { TableSort } from "@/store";
import type { DisplayDocument } from "@/lib/api";
import { displayKey } from "@/lib/display";
import { cn } from "@/lib/utils";
import { ValueView } from "./ValueView";
import { useT } from "@/i18n";

const ROW_HEIGHT = 28;

const ID_COLUMN = "__id";

export function DocumentTable({
  docs,
  fields: fieldNames,
  selectedPath,
  onSelect,
  idLabel = "Doc ID",
  sort = null,
  onSortChange,
}: {
  docs: DisplayDocument[];
  /** 固定列の見出し（Authentication では UID） */
  idLabel?: string;
  /** 表示するフィールド（列設定を反映済み）。先頭には常に Doc ID 列を固定表示する */
  fields: string[];
  selectedPath: string | null;
  onSelect: (doc: DisplayDocument) => void;
  /** 手元での並べ替え。column は "__id" かフィールド名 */
  sort?: TableSort | null;
  onSortChange?: (sort: TableSort | null) => void;
}) {
  const t = useT();
  const columns = useMemo<ColumnDef<DisplayDocument>[]>(
    () => [
      {
        id: ID_COLUMN,
        header: idLabel,
        size: 200,
        cell: ({ row }) => (
          <span className={cn("font-mono", row.original.missing && "text-muted-foreground italic")}>
            {row.original.id}
          </span>
        ),
      },
      ...fieldNames.map<ColumnDef<DisplayDocument>>((key) => ({
        id: `f:${key}`,
        header: displayKey(key),
        size: 180,
        cell: ({ row }) =>
          key in row.original.fields ? <ValueView value={row.original.fields[key]} /> : null,
      })),
    ],
    [fieldNames, idLabel],
  );

  // 見出しのクリックで 昇順 → 降順 → 読み込んだ順 に切り替える
  const sortedDocs = useMemo(() => {
    if (!sort) return docs;
    const collator = new Intl.Collator(undefined, { numeric: true });
    return [...docs].sort((a, b) =>
      sort.column === ID_COLUMN
        ? (sort.desc ? -1 : 1) * collator.compare(a.id, b.id)
        : compareValues(a.fields[sort.column], b.fields[sort.column], sort.desc),
    );
  }, [docs, sort]);

  const cycleSort = (column: string) => {
    if (!onSortChange) return;
    if (sort?.column !== column) onSortChange({ column, desc: false });
    else if (!sort.desc) onSortChange({ column, desc: true });
    else onSortChange(null);
  };

  const table = useReactTable({
    data: sortedDocs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (d) => d.path,
    columnResizeMode: "onChange",
    defaultColumn: { minSize: 60, maxSize: 800 },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const totalWidth = table.getTotalSize();

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div className="sticky top-0 z-20 flex border-b bg-muted">
          {table.getHeaderGroups()[0].headers.map((h) => (
            <div
              key={h.id}
              className={cn(
                "relative flex h-7 shrink-0 items-center truncate border-r px-2 text-xs font-medium",
                // Doc ID 列は横スクロールしても左端に固定する
                h.id === ID_COLUMN && "sticky left-0 z-10 bg-muted shadow-[1px_0_0_var(--border)]",
              )}
              style={{ width: h.getSize() }}
              title={t("browse.sortHint", { column: String(h.column.columnDef.header ?? "") })}
              onClick={() => cycleSort(h.id === ID_COLUMN ? ID_COLUMN : h.id.slice(2))}
            >
              <span className={cn("truncate", onSortChange && "cursor-pointer")}>
                {flexRender(h.column.columnDef.header, h.getContext())}
              </span>
              {(() => {
                const column = h.id === ID_COLUMN ? ID_COLUMN : h.id.slice(2);
                if (sort?.column !== column) return null;
                return sort.desc ? (
                  <ArrowDown className="ml-1 size-3 shrink-0 text-primary" />
                ) : (
                  <ArrowUp className="ml-1 size-3 shrink-0 text-primary" />
                );
              })()}
              <div
                // 列幅の変更で並べ替えが動かないようにする
                onClick={(e) => e.stopPropagation()}
                onMouseDown={h.getResizeHandler()}
                onDoubleClick={() => h.column.resetSize()}
                className={cn(
                  "absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40",
                  h.column.getIsResizing() && "bg-primary/60",
                )}
              />
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((vr) => {
            const row = rows[vr.index];
            const selected = row.original.path === selectedPath;
            return (
              <div
                key={row.id}
                className={cn(
                  "group/row absolute left-0 flex w-full cursor-pointer border-b bg-background hover:bg-muted",
                  selected && "bg-accent hover:bg-accent",
                )}
                style={{ top: vr.start, height: ROW_HEIGHT }}
                onClick={() => onSelect(row.original)}
                title={row.original.missing ? t("detail.missingDocument") : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className={cn(
                      "flex shrink-0 items-center truncate border-r px-2 font-mono text-xs",
                      // 固定列は下の列が透けないよう行と同じ不透明な背景にする
                      cell.column.id === ID_COLUMN &&
                        cn(
                          "sticky left-0 z-[1] bg-background shadow-[1px_0_0_var(--border)] group-hover/row:bg-muted",
                          selected && "bg-accent group-hover/row:bg-accent",
                        ),
                    )}
                    style={{ width: cell.column.getSize() }}
                  >
                    <span className="truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
