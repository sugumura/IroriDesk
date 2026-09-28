import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Play, Plus, X } from "lucide-react";
import type { OrderClause, QuerySpec, QueryValueType, WhereClause, WhereOp } from "@/lib/api";
import { formatTimestamp } from "@/lib/display";
import type { FieldInfo } from "@/lib/fields";
import { useFieldSuggestions } from "@/lib/useFieldSuggestions";
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
import { sharedLayout } from "@/lib/layoutStorage";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type TFunction, useT } from "@/i18n";
import { ErrorBox } from "./ErrorBox";
import { columnScope } from "@/lib/columns";
import { useColumnLayout } from "@/lib/useColumnLayout";
import { ColumnSettings } from "./ColumnSettings";
import { ExportMenu } from "./ExportMenu";
import { FieldInput } from "./FieldInput";
import { JsonCode } from "./JsonCode";
import { HistoryButton, HistoryList } from "./QueryHistory";
import { ResultsView, ViewToggle } from "./ResultsView";
import { filterDocs } from "@/lib/localView";
import { FilterInput } from "./FilterInput";

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

function placeholder(w: WhereClause, t: TFunction): string {
  const list = LIST_OPS.has(w.op);
  if (w.field.trim() === "__name__") return list ? "alice, users/bob" : t("query.namePlaceholder");
  switch (w.valueType) {
    case "timestamp":
      return list ? "2026-01-01T00:00:00Z, ..." : "2026-01-01T00:00:00Z / +09:00";
    case "reference":
      return list ? "users/alice, users/bob" : "users/alice";
    case "double":
      return list ? "1.5, 2.5" : "1.5 / NaN";
    default:
      return list ? t("query.listPlaceholder") : t("query.valuePlaceholder");
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

interface SuggestionProps {
  fields: FieldInfo[];
  loading: boolean;
}

/** 候補を選んだとき、値が未入力なら型と演算子をサンプルに合わせる */
function applyPickedField(clause: WhereClause, f: FieldInfo): WhereClause {
  const next = { ...clause, field: f.path };
  if (clause.value.trim() !== "") return next;
  if (f.valueType && f.valueType !== "null") next.valueType = f.valueType;
  if (f.typeLabel === "array" && clause.op === "==") next.op = "array-contains";
  return next;
}

function WhereRow({
  clause,
  onChange,
  onRemove,
  suggestions,
}: {
  clause: WhereClause;
  onChange: (c: WhereClause) => void;
  onRemove: () => void;
  suggestions: SuggestionProps;
}) {
  const t = useT();
  const set = <K extends keyof WhereClause>(k: K, v: WhereClause[K]) => onChange({ ...clause, [k]: v });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FieldInput
        value={clause.field}
        onChange={(v) => set("field", v)}
        onPick={(f) => onChange(applyPickedField(clause, f))}
        suggestions={suggestions.fields}
        loading={suggestions.loading}
        placeholder={t("query.fieldPlaceholder")}
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
        <span className="flex-1 px-2 text-xs text-muted-foreground">{t("query.nullOnly")}</span>
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
          placeholder={placeholder(clause, t)}
          className="h-7 min-w-48 flex-1 font-mono text-xs"
        />
      )}
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title={t("query.removeWhere")}>
        <X />
      </Button>
    </div>
  );
}

function OrderRow({
  clause,
  onChange,
  onRemove,
  suggestions,
}: {
  clause: OrderClause;
  onChange: (c: OrderClause) => void;
  onRemove: () => void;
  suggestions: SuggestionProps;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FieldInput
        value={clause.field}
        onChange={(v) => onChange({ ...clause, field: v })}
        suggestions={suggestions.fields}
        loading={suggestions.loading}
        placeholder={t("query.fieldPlaceholderShort")}
        className="h-7 w-56 font-mono text-xs"
      />
      <SmallSelect
        value={clause.direction}
        options={[
          { value: "asc", label: t("query.asc") },
          { value: "desc", label: t("query.desc") },
        ]}
        onChange={(v) => onChange({ ...clause, direction: v })}
        className="w-32"
      />
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title={t("query.removeOrder")}>
        <X />
      </Button>
    </div>
  );
}

function QueryForm({ tab }: { tab: QueryTab }) {
  const t = useT();
  const patch = useStore((s) => s.patchQuerySpec);
  const execute = useStore((s) => s.executeQuery);
  const spec = tab.spec;
  const set = (p: Partial<QuerySpec> | ((s: QuerySpec) => Partial<QuerySpec>)) => patch(tab.id, p);

  const replaceAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (j === i ? v : x));
  const removeAt = <T,>(arr: T[], i: number) => arr.filter((_, j) => j !== i);
  const suggestions = useFieldSuggestions(tab);

  return (
    <form
      className="@container space-y-2 p-3"
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
      <div className="flex flex-wrap items-center gap-1.5">
        <SmallSelect
          value={spec.targetKind}
          options={[
            { value: "collection", label: t("query.targetCollection") },
            { value: "collectionGroup", label: "collectionGroup" },
          ]}
          onChange={(v) => set({ targetKind: v })}
          className="w-40"
        />
        <Input
          value={spec.target}
          onChange={(e) => set({ target: e.target.value })}
          placeholder={spec.targetKind === "collection" ? t("query.targetPathPlaceholder") : t("query.targetIdPlaceholder")}
          className="h-7 min-w-48 flex-1 font-mono text-xs"
        />
        <span className="ml-2 text-xs text-muted-foreground">limit</span>
        <Input
          type="number"
          min={1}
          value={spec.limit ?? ""}
          onChange={(e) => set({ limit: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder={t("query.limitNone")}
          className="h-7 w-24 text-xs"
        />
        <HistoryButton tab={tab} />
        <Button type="submit" size="sm" disabled={tab.loading || !spec.target.trim()} title={t("query.runTitle")}>
          {tab.loading ? <Loader2 className="animate-spin" /> : <Play />}
          {t("query.run")}
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{t("query.whereLabel")}</div>
        {spec.where.map((w, i) => (
          <WhereRow
            key={i}
            clause={w}
            onChange={(c) => set((s) => ({ where: replaceAt(s.where, i, c) }))}
            onRemove={() => set((s) => ({ where: removeAt(s.where, i) }))}
            suggestions={suggestions}
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
          <Plus /> {t("query.addWhere")}
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
            suggestions={suggestions}
          />
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => set((s) => ({ orderBy: [...s.orderBy, { field: "", direction: "asc" }] }))}
        >
          <Plus /> {t("query.addOrder")}
        </Button>
      </div>
    </form>
  );
}

function SentQuery({ query }: { query: unknown }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {t("query.sentQuery")}
      </button>
      {open && (
        <JsonCode text={JSON.stringify(query, null, 2)} className="max-h-48 overflow-auto px-3 pb-2" />
      )}
    </div>
  );
}

export function QueryView({ tab }: { tab: QueryTab }) {
  const ran = tab.ranSpec !== null;
  // 分割表示で複数のクエリタブが同時に出るため、パネル ID はタブごとに一意にする
  const formId = `form-${tab.id}`;
  const resultsId = `results-${tab.id}`;
  const { defaultLayout, onLayoutChanged } = useMemo(
    () => sharedLayout("query", { form: formId, results: resultsId }),
    [formId, resultsId],
  );
  return (
    <ResizablePanelGroup
      id={`query-${tab.id}`}
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id={formId} defaultSize="35" minSize={60}>
        <QueryForm tab={tab} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id={resultsId} minSize={120}>
        <QueryResults tab={tab} ran={ran} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function QueryResults({ tab, ran }: { tab: QueryTab; ran: boolean }) {
  const t = useT();
  // 列設定は実行したクエリの対象ごと（コレクションは閲覧タブと共通）
  const target = tab.ranSpec ?? tab.spec;
  const setTabFilter = useStore((s) => s.setTabFilter);
  const setTabSort = useStore((s) => s.setTabSort);
  const shown = useMemo(() => filterDocs(tab.docs, tab.filter), [tab.docs, tab.filter]);
  const layout = useColumnLayout(
    tab.docs,
    columnScope(
      target.targetKind === "collectionGroup"
        ? { kind: "collectionGroup", id: target.target.trim() }
        : { kind: "collection", path: target.target },
    ),
  );
  return (
    <div className="@container flex h-full min-h-0 flex-col">
      {tab.error && <ErrorBox error={tab.error} className="m-3" />}
      {ran && tab.structuredQuery !== null && <SentQuery query={tab.structuredQuery} />}
      <div className="min-h-0 flex-1">
        {!ran ? (
          <div className="h-full overflow-auto p-3">
            <div className="mb-1 text-muted-foreground">{t("query.emptyPrompt")}</div>
            <HistoryList tab={tab} className="max-w-2xl" />
          </div>
        ) : tab.docs.length === 0 ? (
          <div className="p-4 text-muted-foreground">{t("query.noResults")}</div>
        ) : (
          <ResultsView
            docs={shown}
            fields={layout.visible}
            view={tab.view}
            sort={tab.sort}
            onSortChange={(sort) => setTabSort(tab.id, sort)}
          />
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-3 border-t px-3 text-xs text-muted-foreground">
        {ran && (
          <span title={t("query.totalTitle")}>
            {t("common.count", { count: tab.docs.length })}
            {tab.totalCount !== null && t("query.totalSuffix", { count: tab.totalCount })}
          </span>
        )}
        {tab.readTime && <span className="hidden @xl:inline" title={tab.readTime}>readTime: {formatTimestamp(tab.readTime)}</span>}
        {tab.loading && <Loader2 className="size-3.5 animate-spin" />}
        <div className="flex-1" />
        {ran && tab.filter && (
          <span className="shrink-0 text-primary">{t("browse.filtered", { shown: shown.length, total: tab.docs.length })}</span>
        )}
        {ran && <FilterInput className="w-40" value={tab.filter} onChange={(v) => setTabFilter(tab.id, v)} />}
        {ran && (
          <ExportMenu
            docs={tab.docs}
            fields={layout.visible}
            baseName={`query_${tab.ranSpec?.targetKind === "collectionGroup" ? "group_" : ""}${tab.ranSpec?.target ?? ""}`}
          />
        )}
        {ran && tab.view === "table" && <ColumnSettings layout={layout} />}
        <ViewToggle tab={tab} />
      </div>
    </div>
  );
}
