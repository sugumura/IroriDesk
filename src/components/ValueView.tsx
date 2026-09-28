import type { DisplayValue } from "@/lib/api";
import { asWrapper, base64ByteLength, compactText, formatTimestamp, refToLocalPath } from "@/lib/display";
import { activeConnection, useStore } from "@/store";

/** $ref のクリックで参照先ドキュメントを詳細ペインに開く */
function RefLink({ refName, label }: { refName: string; label: string }) {
  const conn = useStore(activeConnection);
  const select = useStore((s) => s.selectDocument);
  const local = conn ? refToLocalPath(refName, conn) : null;
  if (!local) {
    return (
      <span className="text-sky-700 dark:text-sky-400" title={`別のプロジェクト/DBへの参照: ${refName}`}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="cursor-pointer text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
      title={refName}
      onClick={(e) => {
        e.stopPropagation();
        select(local);
      }}
    >
      {label}
    </button>
  );
}

/**
 * スカラー値を型に応じた色で1行表示する。map/array は compactText で要約する。
 * テーブルのセルと JSON ツリーの葉で使う
 */
export function ValueView({ value }: { value: DisplayValue }) {
  const w = asWrapper(value);
  if (w) {
    switch (w.kind) {
      case "timestamp":
        return (
          <span className="text-violet-700 dark:text-violet-400" title={w.value}>
            {formatTimestamp(w.value)}
          </span>
        );
      case "ref":
        return <RefLink refName={w.value} label={compactText(value)} />;
      case "int":
      case "double":
        return (
          <span className="text-emerald-700 dark:text-emerald-400" title={`$${w.kind}`}>
            {String(w.value)}
          </span>
        );
      case "geo":
        return (
          <span className="text-amber-700 dark:text-amber-400" title="GeoPoint">
            {w.value.lat}, {w.value.lng}
          </span>
        );
      case "bytes":
        return (
          <span className="text-muted-foreground" title={w.value}>
            bytes({base64ByteLength(w.value)})
          </span>
        );
    }
  }
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === "boolean") return <span className="text-orange-700 dark:text-orange-400">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-emerald-700 dark:text-emerald-400">{value}</span>;
  if (typeof value === "string") return <span>{compactText(value)}</span>;
  return <span className="text-muted-foreground">{compactText(value)}</span>;
}

/** 値の型名（JSON ツリーの補足表示用） */
export function typeLabel(value: DisplayValue): string {
  const w = asWrapper(value);
  if (w) return w.kind === "int" ? "integer" : w.kind;
  if (value === null) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === "object") return `map{${Object.keys(value).length}}`;
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "double";
  return typeof value;
}
