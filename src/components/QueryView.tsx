import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Play, Plus, X } from "lucide-react";
import type { OrderClause, QuerySpec, QueryValueType, WhereClause, WhereOp } from "@/lib/api";
import { formatTimestamp } from "@/lib/display";
import { type QueryTab, useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBox } from "./ErrorBox";
import { ResultsView, ViewToggle } from "./ResultsView";

const OPS: WhereOp[] = [
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "in",
  "not-in",
  "array-contains",
  "array-contains-any",
];
const LIST_OPS = new Set<WhereOp>(["in", "not-in", "array-contains-any"]);
const VALUE_TYPES: QueryValueType[] = [
  "string",
  "integer",
  "double",
  "boolean",
  "null",
  "timestamp",
  "reference",
];

function placeholder(w: WhereClause): string {
  const list = LIST_OPS.has(w.op);
  if (w.field.trim() === "__name__") return list ? "alice, users/bob" : "ドキュメントID またはパス";
  switch (w.valueType) {
    case "timestamp":
      return list ? "2026-01-01T00:00:00Z, ..." : "2026-01-01T00:00:00Z / +09:00";
    case "reference":
      return list ? "users/alice, users/bob" : "users/alice";
    case "double":
      return list ? "1.5, 2.5" : "1.5 / NaN";
    default:
      return list ? "カンマ区切りで複数指定" : "値";
  }
}

function SmallSelect<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T;
  options: readonly T[] | { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  label?: (v: T) => string;
}) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: label?.(o) ?? o } : o));
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function WhereRow({
  clause,
  onChange,
  onRemove,
}: {
  clause: WhereClause;
  onChange: (c: WhereClause) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof WhereClause>(k: K, v: WhereClause[K]) => onChange({ ...clause, [k]: v });
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={clause.field}
        onChange={(e) => set("field", e.target.value)}
        placeholder="フィールド（profile.city / __name__）"
        className="h-7 w-56 font-mono text-xs"
      />
      <SmallSelect value={clause.op} options={OPS} onChange={(v) => set("op", v)} className="w-40 font-mono" />
      <SmallSelect
        value={clause.valueType}
        options={VALUE_TYPES}
        onChange={(v) => set("valueType", v)}
        className="w-28"
      />
      {clause.valueType === "null" ? (
        <span className="flex-1 px-2 text-xs text-muted-foreground">null（== / != のみ）</span>
      ) : clause.valueType === "boolean" && !LIST_OPS.has(clause.op) ? (
        <SmallSelect
          value={clause.value === "false" ? "false" : "true"}
          options={["true", "false"] as const}
          onChange={(v) => set("value", v)}
          className="w-28"
        />
      ) : (
        <Input
          value={clause.value}
          onChange={(e) => set("value", e.target.value)}
          placeholder={placeholder(clause)}
          className="h-7 flex-1 font-mono text-xs"
        />
      )}
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title="条件を削除">
        <X />
      </Button>
    </div>
  );
}

function OrderRow({
  clause,
  onChange,
  onRemove,
}: {
  clause: OrderClause;
  onChange: (c: OrderClause) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={clause.field}
        onChange={(e) => onChange({ ...clause, field: e.target.value })}
        placeholder="フィールド"
        className="h-7 w-56 font-mono text-xs"
      />
      <SmallSelect
        value={clause.direction}
        options={[
          { value: "asc", label: "昇順 (asc)" },
          { value: "desc", label: "降順 (desc)" },
        ]}
        onChange={(v) => onChange({ ...clause, direction: v })}
        className="w-32"
      />
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title="並び順を削除">
        <X />
      </Button>
    </div>
  );
}

function QueryForm({ tab }: { tab: QueryTab }) {
  const patch = useStore((s) => s.patchQuerySpec);
  const execute = useStore((s) => s.executeQuery);
  const spec = tab.spec;
  const set = (p: Partial<QuerySpec> | ((s: QuerySpec) => Partial<QuerySpec>)) => patch(tab.id, p);

  const replaceAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));
  const removeAt = <T,>(arr: T[], i: number) => arr.filter((_, j) => j !== i);

  return (
    <form
      className="space-y-2 border-b p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void execute(tab.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void execute(tab.id);
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <SmallSelect
          value={spec.targetKind}
          options={[
            { value: "collection", label: "コレクション" },
            { value: "collectionGroup", label: "collectionGroup" },
          ]}
          onChange={(v) => set({ targetKind: v })}
          className="w-40"
        />
        <Input
          value={spec.target}
          onChange={(e) => set({ target: e.target.value })}
          placeholder={spec.targetKind === "collection" ? "コレクションパス（users/alice/orders）" : "コレクションID（orders）"}
          className="h-7 flex-1 font-mono text-xs"
        />
        <span className="ml-2 text-xs text-muted-foreground">limit</span>
        <Input
          type="number"
          min={1}
          value={spec.limit ?? ""}
          onChange={(e) => set({ limit: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="なし"
          className="h-7 w-24 text-xs"
        />
        <Button type="submit" size="sm" disabled={tab.loading || !spec.target.trim()} title="実行（⌘/Ctrl+Enter）">
          {tab.loading ? <Loader2 className="animate-spin" /> : <Play />}
          実行
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">where（AND）</div>
        {spec.where.map((w, i) => (
          <WhereRow
            key={i}
            clause={w}
            onChange={(c) => set((s) => ({ where: replaceAt(s.where, i, c) }))}
            onRemove={() => set((s) => ({ where: removeAt(s.where, i) }))}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            set((s) => ({ where: [...s.where, { field: "", op: "==", valueType: "string", value: "" }] }))
          }
        >
          <Plus /> 条件を追加
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">orderBy</div>
        {spec.orderBy.map((o, i) => (
          <OrderRow
            key={i}
            clause={o}
            onChange={(c) => set((s) => ({ orderBy: replaceAt(s.orderBy, i, c) }))}
            onRemove={() => set((s) => ({ orderBy: removeAt(s.orderBy, i) }))}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => set((s) => ({ orderBy: [...s.orderBy, { field: "", direction: "asc" }] }))}
        >
          <Plus /> 並び順を追加
        </Button>
      </div>
    </form>
  );
}

function SentQuery({ query }: { query: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        送信した structuredQuery
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto px-3 pb-2 font-mono text-xs select-text">
          {JSON.stringify(query, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function QueryView({ tab }: { tab: QueryTab }) {
  const ran = tab.ranSpec !== null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="max-h-[45%] shrink-0 overflow-auto">
        <QueryForm tab={tab} />
      </div>
      {tab.error && <ErrorBox error={tab.error} className="m-3" />}
      {ran && tab.structuredQuery !== null && <SentQuery query={tab.structuredQuery} />}
      <div className="min-h-0 flex-1">
        {!ran ? (
          <div className="p-4 text-muted-foreground">条件を入力して実行してください</div>
        ) : tab.docs.length === 0 ? (
          <div className="p-4 text-muted-foreground">該当するドキュメントはありません</div>
        ) : (
          <ResultsView docs={tab.docs} view={tab.view} />
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        {ran && <span>{tab.docs.length} 件</span>}
        {tab.readTime && <span title={tab.readTime}>readTime: {formatTimestamp(tab.readTime)}</span>}
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        <ViewToggle tab={tab} />
      </div>
    </div>
  );
}
