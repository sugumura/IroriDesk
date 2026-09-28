import { useMemo, useRef } from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DisplayDocument } from "@/lib/api";
import { displayKey, unionFieldNames } from "@/lib/display";
import { cn } from "@/lib/utils";
import { ValueView } from "./ValueView";

const ROW_HEIGHT = 28;

export function DocumentTable({
  docs,
  selectedPath,
  onSelect,
}: {
  docs: DisplayDocument[];
  selectedPath: string | null;
  onSelect: (doc: DisplayDocument) => void;
}) {
  // 先頭は ID、以降はトップレベルのフィールド名の和集合（CSV エクスポートと同じ列構成）
  const fieldNames = useMemo(() => unionFieldNames(docs), [docs]);

  const columns = useMemo<ColumnDef<DisplayDocument>[]>(
    () => [
      {
        id: "__id",
        header: "ID",
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
    [fieldNames],
  );

  const table = useReactTable({
    data: docs,
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
        <div className="sticky top-0 z-10 flex border-b bg-muted/80 backdrop-blur">
          {table.getHeaderGroups()[0].headers.map((h) => (
            <div
              key={h.id}
              className="relative flex h-7 shrink-0 items-center truncate border-r px-2 text-xs font-medium"
              style={{ width: h.getSize() }}
              title={typeof h.column.columnDef.header === "string" ? h.column.columnDef.header : undefined}
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
              <div
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
                  "absolute left-0 flex w-full cursor-pointer border-b hover:bg-muted/60",
                  selected && "bg-accent hover:bg-accent",
                )}
                style={{ top: vr.start, height: ROW_HEIGHT }}
                onClick={() => onSelect(row.original)}
                title={row.original.missing ? "実体のないドキュメント（サブコレクションのみ）" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="flex shrink-0 items-center truncate border-r px-2 font-mono text-xs"
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
