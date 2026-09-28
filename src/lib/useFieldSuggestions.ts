import { useEffect, useMemo, useState } from "react";
import { type DisplayDocument, runQuery } from "./api";
import { collectFields, type FieldInfo, NAME_FIELD } from "./fields";
import { splitPath } from "./display";
import { activeConnection, type QueryTab, useStore } from "@/store";

const SAMPLE_SIZE = 50;
const DEBOUNCE_MS = 400;

/** 接続・対象ごとのサンプル（タブを開き直しても再取得しない） */
const sampleCache = new Map<string, DisplayDocument[]>();

function isValidTarget(kind: QueryTab["spec"]["targetKind"], target: string): boolean {
  const t = target.trim();
  if (!t) return false;
  return kind === "collection" ? splitPath(t).length % 2 === 1 : !t.includes("/");
}

/**
 * クエリ対象のドキュメントを少数サンプリングし、フィールドパスの候補を返す。
 * Firestore にはスキーマがないため、サンプルと直近の結果に現れたフィールドのみが候補になる
 */
export function useFieldSuggestions(tab: QueryTab): { fields: FieldInfo[]; loading: boolean } {
  const conn = useStore(activeConnection);
  const { targetKind, target } = tab.spec;
  const valid = isValidTarget(targetKind, target);
  const key = conn && valid ? `${conn.id}|${targetKind}|${target.trim()}` : null;
  const [samples, setSamples] = useState<{ key: string; docs: DisplayDocument[] } | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !conn) return;
    const cached = sampleCache.get(key);
    if (cached) {
      setSamples({ key, docs: cached });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoadingKey(key);
      runQuery(conn, { targetKind, target: target.trim(), where: [], orderBy: [], limit: SAMPLE_SIZE })
        .then((r) => {
          sampleCache.set(key, r.documents);
          if (!cancelled) setSamples({ key, docs: r.documents });
        })
        // 候補の取得失敗は無視する（クエリ実行時にエラーを表示する）
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoadingKey(null);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, conn, targetKind, target]);

  const sampleDocs = samples && samples.key === key ? samples.docs : null;
  const fields = useMemo(() => {
    if (!sampleDocs && tab.docs.length === 0) return [];
    return [...collectFields([...(sampleDocs ?? []), ...tab.docs]), NAME_FIELD];
  }, [sampleDocs, tab.docs]);

  return { fields, loading: key !== null && loadingKey === key };
}
