/**
 * ドキュメントのサブコレクション一覧（左のツリーと詳細パネルで共有する）。
 * 同じドキュメントを何度も問い合わせないよう、少しの間だけ覚えておく
 */
import { useEffect, useState } from "react";
import { type AppError, type ConnectionConfig, listCollectionIds, toAppError } from "./api";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; ids: string[] }>();
const inflight = new Map<string, Promise<string[]>>();

function key(conn: ConnectionConfig, docPath: string) {
  return `${conn.id}|${docPath}`;
}

export function fetchSubcollections(conn: ConnectionConfig, docPath: string, force = false): Promise<string[]> {
  const k = key(conn, docPath);
  const hit = cache.get(k);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.ids);
  const running = inflight.get(k);
  if (running && !force) return running;
  const p = listCollectionIds(conn, docPath)
    .then((ids) => {
      cache.set(k, { at: Date.now(), ids });
      return ids;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** 再読み込みのときに、覚えている一覧を捨てる */
export function clearSubcollectionCache() {
  cache.clear();
}

export interface SubcollectionState {
  ids: string[] | null;
  loading: boolean;
  error: AppError | null;
}

export function useSubcollections(conn: ConnectionConfig | null, docPath: string | null): SubcollectionState {
  const [state, setState] = useState<SubcollectionState>({ ids: null, loading: false, error: null });
  useEffect(() => {
    if (!conn || !docPath) {
      setState({ ids: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchSubcollections(conn, docPath).then(
      (ids) => !cancelled && setState({ ids, loading: false, error: null }),
      (e) => !cancelled && setState({ ids: null, loading: false, error: toAppError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [conn, docPath]);
  return state;
}

/**
 * 今いる場所までのドキュメントの道筋。開いているコレクション（users/alice/orders）の途中のドキュメントと、
 * そのコレクションで選択中のドキュメントを順に返す（例: ["users/alice", "users/alice/orders/o1"]）
 */
export function documentTrail(collectionPath: string | null, selectedDocPath: string | null): string[] {
  const trail: string[] = [];
  if (collectionPath) {
    const segs = collectionPath.split("/").filter(Boolean);
    for (let i = 2; i <= segs.length; i += 2) trail.push(segs.slice(0, i).join("/"));
  }
  if (selectedDocPath && collectionPath) {
    const segs = selectedDocPath.split("/").filter(Boolean);
    const parent = segs.slice(0, -1).join("/");
    if (segs.length % 2 === 0 && parent === collectionPath) trail.push(selectedDocPath);
  }
  return trail;
}
