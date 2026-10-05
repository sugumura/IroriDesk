import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { notifySuccess } from "@/lib/notify";
import { isMac } from "@/lib/shortcuts";
import {
  bounds,
  type Cell,
  type CellRange,
  clampRange,
  type ColumnKey,
  contains,
  moveTo,
  rangeToJson,
  rangeToTsv,
  selectAll,
  single,
} from "@/lib/tableSelection";
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
  /** 列の位置 → Doc ID 列（null）かフィールド名 */
  const columnKeys = useMemo<ColumnKey[]>(() => [null, ...fieldNames], [fieldNames]);
  const rowCount = sortedDocs.length;
  const colCount = columnKeys.length;

  // セル範囲の選択。focus のセルの行が「選択中のドキュメント」（詳細パネルに表示）になる
  const [range, setRange] = useState<CellRange | null>(null);
  const dragging = useRef(false);

  // 外から選択が変わった（詳細パネルで解除した、並べ替えた、など）ときは範囲を合わせる
  useEffect(() => {
    setRange((prev) => {
      if (!selectedPath) return null;
      if (prev && sortedDocs[prev.focus.row]?.path === selectedPath) return clampRange(prev, rowCount, colCount);
      const row = sortedDocs.findIndex((d) => d.path === selectedPath);
      return row < 0 ? null : single(row, Math.min(prev?.focus.col ?? 0, colCount - 1));
    });
  }, [selectedPath, sortedDocs, rowCount, colCount]);

  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const totalWidth = table.getTotalSize();

  /** 横スクロールで focus の列が見えるようにする（Doc ID 列は固定なのでその幅を除く） */
  const scrollToCell = (cell: Cell) => {
    virtualizer.scrollToIndex(cell.row, { align: "auto" });
    const el = scrollRef.current;
    if (!el || cell.col === 0) return;
    const sizes = table.getVisibleLeafColumns().map((c) => c.getSize());
    const left = sizes.slice(0, cell.col).reduce((a, b) => a + b, 0);
    const right = left + sizes[cell.col];
    if (left < el.scrollLeft + sizes[0]) el.scrollLeft = left - sizes[0];
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  };

  const apply = (next: CellRange | null, scroll = true) => {
    setRange(next);
    if (!next) return;
    const doc = sortedDocs[next.focus.row];
    if (doc && doc.path !== selectedPath) onSelect(doc);
    if (scroll) scrollToCell(next.focus);
  };

  const copy = async (asJson: boolean) => {
    if (!range) return;
    const b = bounds(range);
    const one = b.r0 === b.r1 && b.c0 === b.c1;
    const text = asJson ? rangeToJson(sortedDocs, columnKeys, b) : rangeToTsv(sortedDocs, columnKeys, b, idLabel);
    await navigator.clipboard.writeText(text);
    const rows = b.r1 - b.r0 + 1;
    notifySuccess(
      asJson
        ? one
          ? t("browse.copiedCellJson")
          : t("browse.copiedJson", { rows })
        : one
          ? t("browse.copiedCell")
          : t("browse.copiedRange", { rows, cols: b.c1 - b.c0 + 1 }),
    );
  };

  // 矢印で移動（Shift で範囲を広げる）、Cmd/Ctrl+A で全選択、Cmd/Ctrl+C で TSV、Cmd/Ctrl+Shift+C で JSON
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.code === "KeyA" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      // 詳細パネルは先頭行のままにするため、focus を左上にする
      const all = selectAll(rowCount, colCount);
      if (all) apply({ anchor: all.focus, focus: all.anchor }, false);
      return;
    }
    if (mod && e.code === "KeyC" && !e.altKey) {
      if (!range) return;
      e.preventDefault();
      void copy(e.shiftKey);
      return;
    }
    if (rowCount === 0 || e.altKey) return;
    const cur = range ?? single(0, 0);
    const { row, col } = cur.focus;
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT) - 2);
    let target: Cell | null = null;
    switch (e.key) {
      case "ArrowUp":
        target = { row: mod ? 0 : row - 1, col };
        break;
      case "ArrowDown":
        target = { row: mod ? rowCount - 1 : row + 1, col };
        break;
      case "ArrowLeft":
        target = { row, col: mod ? 0 : col - 1 };
        break;
      case "ArrowRight":
        target = { row, col: mod ? colCount - 1 : col + 1 };
        break;
      case "PageUp":
        target = { row: row - page, col };
        break;
      case "PageDown":
        target = { row: row + page, col };
        break;
      case "Home":
        target = mod ? { row: 0, col: 0 } : { row, col: 0 };
        break;
      case "End":
        target = mod ? { row: rowCount - 1, col: colCount - 1 } : { row, col: colCount - 1 };
        break;
      case "Escape":
        if (range && (range.anchor.row !== row || range.anchor.col !== col)) {
          e.preventDefault();
          apply(single(row, col), false);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    apply(range ? moveTo(cur, target, e.shiftKey, rowCount, colCount) : moveTo(cur, target, false, rowCount, colCount));
  };

  const selection = range ? bounds(range) : null;

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
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
                title={row.original.missing ? t("detail.missingDocument") : undefined}
              >
                {row.getVisibleCells().map((cell, colIndex) => {
                  const inRange = selection !== null && contains(selection, vr.index, colIndex);
                  const isFocus = range?.focus.row === vr.index && range.focus.col === colIndex;
                  const target = { row: vr.index, col: colIndex };
                  return (
                    <div
                      key={cell.id}
                      className={cn(
                        "flex shrink-0 select-none items-center truncate border-r px-2 font-mono text-xs",
                        // 固定列は下の列が透けないよう行と同じ不透明な背景にする
                        cell.column.id === ID_COLUMN &&
                          cn(
                            "sticky left-0 z-[1] bg-background shadow-[1px_0_0_var(--border)] group-hover/row:bg-muted",
                            selected && "bg-accent group-hover/row:bg-accent",
                          ),
                        // 選択範囲の色は、行の選択・ホバー・固定列の背景より優先する
                        inRange && "bg-(--cell-selected)!",
                        isFocus && "outline-2 -outline-offset-2 outline-(--cell-focus)",
                      )}
                      style={{ width: cell.column.getSize() }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        if (e.shiftKey && range) {
                          apply(moveTo(range, target, true, rowCount, colCount), false);
                        } else {
                          dragging.current = true;
                          apply(single(target.row, target.col), false);
                        }
                      }}
                      onMouseEnter={() => {
                        if (dragging.current && range) apply(moveTo(range, target, true, rowCount, colCount), false);
                      }}
                    >
                      <span className="truncate">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
