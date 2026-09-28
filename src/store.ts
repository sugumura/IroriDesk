import { create } from "zustand";
import {
  type AppError,
  type ConnectionConfig,
  type DisplayDocument,
  type DisplayUser,
  listAuthUsers,
  listCollectionIds,
  listDocuments,
  lookupAuthUsers,
  type UserLookupKind,
  type QuerySpec,
  runQuery,
  toAppError,
} from "@/lib/api";
import { invoke } from "@tauri-apps/api/core";
import { type Appearance, applyAppearance, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { resolveLang } from "@/i18n";
import type { TFunction } from "@/i18n";
import type { ColumnConfig } from "@/lib/columns";
import { addToHistory, type HistoryEntry, summarizeQuery, whereText } from "@/lib/queryHistory";
import {
  loadAppearance,
  loadColumnConfigs,
  loadQueryHistory,
  loadSettings,
  saveAppearance,
  saveColumnConfigs,
  saveQueryHistory,
  saveSettings,
} from "@/lib/settings";


/** 分割表示のグループ。0 = 左（上）、1 = 右（下） */
export type GroupIndex = 0 | 1;
export type SplitMode = "none" | "horizontal" | "vertical";

export interface BrowseTab {
  id: string;
  kind: "browse";
  group: GroupIndex;
  collectionPath: string;
  docs: DisplayDocument[];
  nextPageToken: string | null;
  loading: boolean;
  error: AppError | null;
  view: "table" | "json";
  /** 古いレスポンスを捨てるための世代番号 */
  requestSeq: number;
}

export interface QueryTab {
  id: string;
  kind: "query";
  group: GroupIndex;
  spec: QuerySpec;
  /** 最後に実行したときの spec（結果と対応） */
  ranSpec: QuerySpec | null;
  docs: DisplayDocument[];
  readTime: string | null;
  structuredQuery: unknown;
  loading: boolean;
  error: AppError | null;
  view: "table" | "json";
  requestSeq: number;
}

/** Firebase Authentication のユーザー一覧 */
export interface AuthTab {
  id: string;
  kind: "auth";
  group: GroupIndex;
  users: DisplayUser[];
  nextPageToken: string | null;
  /** 検索中なら条件（結果は users に入り、ページングはしない） */
  search: { kind: UserLookupKind; value: string } | null;
  loading: boolean;
  error: AppError | null;
  view: "table" | "json";
  requestSeq: number;
}

export type Tab = BrowseTab | QueryTab | AuthTab;



export const DEFAULT_QUERY_LIMIT = 100;

export function emptyQuerySpec(collectionPath = ""): QuerySpec {
  return {
    targetKind: "collection",
    target: collectionPath,
    where: [],
    orderBy: [],
    limit: DEFAULT_QUERY_LIMIT,
  };
}

/** タブの見出し。tr は呼び出し側の翻訳関数（useT） */
/**
 * タブの名前。クエリは短く「対象 · 最初の条件 +残り数」にする（アイコンでクエリとわかるため接頭辞は付けない）。
 * 実行済みなら実行した条件、未実行なら入力中の対象を使う
 */
export function tabTitle(t: Tab, tr: TFunction): string {
  if (t.kind === "browse") return t.collectionPath;
  if (t.kind === "auth") return "Authentication";
  const spec = t.ranSpec ?? t.spec;
  const target = spec.target.trim();
  if (!target) return tr("tabs.newQuery");
  const head = spec.targetKind === "collectionGroup" ? `group(${target})` : target;
  const where = t.ranSpec ? t.ranSpec.where.filter((w) => w.field.trim()) : [];
  if (where.length === 0) return head;
  return `${head} · ${whereText(where[0])}${where.length > 1 ? ` +${where.length - 1}` : ""}`;
}

/** タブのツールチップ。クエリは条件をすべて含む要約 */
export function tabTooltip(t: Tab, tr: TFunction): string {
  if (t.kind !== "query" || !t.ranSpec) return tabTitle(t, tr);
  return summarizeQuery(t.ranSpec, tr("query.history.noTarget"));
}

/** 何も入力・実行していないクエリタブ（「+ クエリ」で使い回す） */
function isBlankQuery(t: Tab): boolean {
  return (
    t.kind === "query" &&
    !t.ranSpec &&
    !t.loading &&
    !t.spec.target.trim() &&
    t.spec.where.every((w) => !w.field.trim()) &&
    t.spec.orderBy.every((o) => !o.field.trim())
  );
}

interface RootCollections {
  ids: string[] | null;
  loading: boolean;
  error: AppError | null;
}

interface State {
  ready: boolean;
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
  rootCollections: RootCollections;
  tabs: Tab[];
  /** グループごとの選択中のタブ */
  activeTabIds: [string | null, string | null];
  /** 最後に操作したグループ。新しいタブはここに開く */
  focusedGroup: GroupIndex;
  split: SplitMode;
  selectedDocPath: string | null;
  /** 詳細ペインに表示中のユーザー（ドキュメントの選択とは排他） */
  selectedUser: DisplayUser | null;
  detailOpen: boolean;
  /** 詳細パネルのドキュメント表示（ドキュメントを選び直しても保つ） */
  detailView: "tree" | "json";
  treeOpen: boolean;
  appearance: Appearance;
  columnConfigs: Record<string, ColumnConfig>;
  /** 接続IDごとのクエリ履歴（新しい順） */
  queryHistory: Record<string, HistoryEntry[]>;

  init(): Promise<void>;
  setAppearance(patch: Partial<Appearance>): void;
  /** config が null なら設定を削除（既定に戻す） */
  setColumnConfig(key: string, config: ColumnConfig | null): void;
  setActiveConnection(id: string | null): void;
  upsertConnection(conn: ConnectionConfig): void;
  deleteConnection(id: string): void;
  loadRootCollections(): Promise<void>;

  openCollection(path: string, opts?: { newTab?: boolean }): void;
  loadPage(tabId: string, reset: boolean): Promise<void>;
  setActiveTab(id: string): void;
  closeTab(id: string): void;
  focusGroup(group: GroupIndex): void;
  setSplit(mode: SplitMode): void;
  /** タブをもう一方のグループへ移す（分割していなければ左右に分割する） */
  moveTabToOtherGroup(id: string): void;
  setView(tabId: string, view: Tab["view"]): void;

  openQuery(spec?: QuerySpec): void;
  /** 最新の spec に patch を当てる（連続した更新で古い値に上書きされないように） */
  patchQuerySpec(tabId: string, patch: Partial<QuerySpec> | ((spec: QuerySpec) => Partial<QuerySpec>)): void;
  executeQuery(tabId: string): Promise<void>;
  /** 履歴のクエリをタブに読み込んで実行する */
  runHistoryEntry(tabId: string, entry: HistoryEntry): void;
  removeHistoryEntry(ranAt: string): void;
  clearHistory(): void;

  selectDocument(path: string | null): void;
  selectUser(user: DisplayUser | null): void;

  /** フォーカス中のグループに Authentication タブを開く（既にあれば選択する） */
  openAuth(): void;
  loadUsers(tabId: string, reset: boolean): Promise<void>;
  searchUsers(tabId: string, kind: UserLookupKind, value: string): Promise<void>;
  setDetailOpen(open: boolean): void;
  setDetailView(view: "tree" | "json"): void;
  setTreeOpen(open: boolean): void;
}

let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

export function activeConnection(s: Pick<State, "connections" | "activeConnectionId">) {
  return s.connections.find((c) => c.id === s.activeConnectionId) ?? null;
}

/** フォーカス中のグループで選択されているタブ */
export function focusedTab(s: Pick<State, "tabs" | "activeTabIds" | "focusedGroup">): Tab | null {
  const id = s.activeTabIds[s.focusedGroup];
  return s.tabs.find((t) => t.id === id) ?? null;
}

const otherGroup = (g: GroupIndex): GroupIndex => (g === 0 ? 1 : 0);

function withActive(
  ids: [string | null, string | null],
  group: GroupIndex,
  id: string | null,
): [string | null, string | null] {
  const next: [string | null, string | null] = [ids[0], ids[1]];
  next[group] = id;
  return next;
}

/** 画面の言語を HTML と Rust 側（エラーメッセージ）に伝える */
function syncLanguage(appearance: Appearance) {
  const lang = resolveLang(appearance.language);
  document.documentElement.lang = lang;
  void invoke("set_locale", { lang }).catch(() => undefined);
}

const emptyRoot: RootCollections = { ids: null, loading: false, error: null };

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { connections, activeConnectionId } = get();
    void saveSettings({ connections, activeConnectionId });
  };

  const updateTab = <T extends Tab>(id: string, patch: Partial<T>) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? ({ ...t, ...patch } as Tab) : t)) }));

  /** 接続を切り替えたら閲覧状態をすべて捨てる */
  const resetBrowsing = () =>
    set({
      rootCollections: emptyRoot,
      tabs: [],
      activeTabIds: [null, null],
      focusedGroup: 0,
      selectedDocPath: null,
      selectedUser: null,
    });

  /** フォーカス中のグループにタブを追加して選択する */
  const addTab = (tab: Tab) =>
    set((s) => ({
      tabs: [...s.tabs, { ...tab, group: s.focusedGroup }],
      activeTabIds: withActive(s.activeTabIds, s.focusedGroup, tab.id),
    }));

  return {
    ready: false,
    connections: [],
    activeConnectionId: null,
    rootCollections: emptyRoot,
    tabs: [],
    activeTabIds: [null, null],
    focusedGroup: 0,
    split: "none",
    selectedDocPath: null,
    selectedUser: null,
    detailOpen: true,
    detailView: "tree",
    treeOpen: true,
    appearance: DEFAULT_APPEARANCE,
    columnConfigs: {},
    queryHistory: {},

    async init() {
      const [settings, appearance, columnConfigs, queryHistory] = await Promise.all([
        loadSettings(),
        loadAppearance(),
        loadColumnConfigs(),
        loadQueryHistory(),
      ]);
      applyAppearance(appearance);
      syncLanguage(appearance);
      set({ ...settings, appearance, columnConfigs, queryHistory, ready: true });
      if (activeConnection(get())) void get().loadRootCollections();
    },

    setAppearance(patch) {
      const appearance = { ...get().appearance, ...patch };
      applyAppearance(appearance);
      syncLanguage(appearance);
      set({ appearance });
      void saveAppearance(appearance);
    },

    setColumnConfig(key, config) {
      const next = { ...get().columnConfigs };
      if (config) next[key] = config;
      else delete next[key];
      set({ columnConfigs: next });
      void saveColumnConfigs(next);
    },

    setActiveConnection(id) {
      if (id === get().activeConnectionId) return;
      set({ activeConnectionId: id });
      resetBrowsing();
      persist();
      if (id) void get().loadRootCollections();
    },

    upsertConnection(conn) {
      const exists = get().connections.some((c) => c.id === conn.id);
      set((s) => ({
        connections: exists
          ? s.connections.map((c) => (c.id === conn.id ? conn : c))
          : [...s.connections, conn],
      }));
      persist();
      // 編集中の接続が有効なら、設定変更を反映するため読み直す
      if (conn.id === get().activeConnectionId) {
        resetBrowsing();
        void get().loadRootCollections();
      }
    },

    deleteConnection(id) {
      set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }));
      if (get().activeConnectionId === id) {
        set({ activeConnectionId: get().connections[0]?.id ?? null });
        resetBrowsing();
        if (get().activeConnectionId) void get().loadRootCollections();
      }
      persist();
    },

    async loadRootCollections() {
      const conn = activeConnection(get());
      if (!conn) return;
      set({ rootCollections: { ids: get().rootCollections.ids, loading: true, error: null } });
      try {
        const ids = await listCollectionIds(conn);
        if (get().activeConnectionId !== conn.id) return;
        set({ rootCollections: { ids, loading: false, error: null } });
      } catch (e) {
        if (get().activeConnectionId !== conn.id) return;
        set({ rootCollections: { ids: null, loading: false, error: toAppError(e) } });
      }
    },

    openCollection(path, opts) {
      const { tabs } = get();
      // クエリタブは上書きせず、閲覧タブのときだけ現在のタブを再利用する
      const focused = focusedTab(get());
      const current = focused?.kind === "browse" ? focused : null;
      const base: Omit<BrowseTab, "id"> = {
        kind: "browse",
        group: get().focusedGroup,
        collectionPath: path,
        docs: [],
        nextPageToken: null,
        loading: false,
        error: null,
        view: current?.view ?? "table",
        requestSeq: 0,
      };
      let id: string;
      if (!opts?.newTab && current) {
        id = current.id;
        set({ tabs: tabs.map((t) => (t.id === id ? { ...base, id, requestSeq: t.requestSeq } : t)) });
      } else {
        id = newTabId();
        addTab({ ...base, id });
      }
      void get().loadPage(id, true);
    },

    async loadPage(tabId, reset) {
      const conn = activeConnection(get());
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!conn || tab?.kind !== "browse") return;
      const seq = tab.requestSeq + 1;
      updateTab<BrowseTab>(tabId, {
        loading: true,
        error: null,
        requestSeq: seq,
        ...(reset ? { docs: [], nextPageToken: null } : {}),
      });
      const isCurrent = () => get().tabs.find((t) => t.id === tabId)?.requestSeq === seq;
      try {
        const page = await listDocuments(
          conn,
          tab.collectionPath,
          get().appearance.documentPageSize,
          reset ? null : tab.nextPageToken,
        );
        if (!isCurrent()) return;
        const latest = get().tabs.find((t) => t.id === tabId);
        const prev = reset || latest?.kind !== "browse" ? [] : latest.docs;
        updateTab<BrowseTab>(tabId, {
          docs: [...prev, ...page.documents],
          nextPageToken: page.nextPageToken,
          loading: false,
        });
      } catch (e) {
        if (!isCurrent()) return;
        updateTab(tabId, { loading: false, error: toAppError(e) });
      }
    },

    setActiveTab(id) {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      set((s) => ({ focusedGroup: tab.group, activeTabIds: withActive(s.activeTabIds, tab.group, id) }));
    },

    closeTab(id) {
      const { tabs, activeTabIds } = get();
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      const sameGroup = tabs.filter((t) => t.group === tab.group);
      const idx = sameGroup.findIndex((t) => t.id === id);
      const rest = sameGroup.filter((t) => t.id !== id);
      const nextActive =
        activeTabIds[tab.group] === id
          ? (rest[Math.min(idx, rest.length - 1)]?.id ?? null)
          : activeTabIds[tab.group];
      set({
        tabs: tabs.filter((t) => t.id !== id),
        activeTabIds: withActive(activeTabIds, tab.group, nextActive),
      });
    },

    focusGroup(group) {
      if (get().focusedGroup !== group) set({ focusedGroup: group });
    },

    setSplit(mode) {
      const s = get();
      if (mode === "none") {
        // 右（下）のタブは左（上）へ戻す
        const moved = s.tabs.map((t) => (t.group === 1 ? { ...t, group: 0 as const } : t));
        set({
          split: "none",
          tabs: moved,
          focusedGroup: 0,
          activeTabIds: [s.activeTabIds[s.focusedGroup] ?? s.activeTabIds[0] ?? s.activeTabIds[1], null],
        });
        return;
      }
      set({ split: mode });
      if (s.split !== "none") return;
      // 分割を始めたとき、もう一方が空なら表示中のタブを複製して並べる
      const source = focusedTab(s);
      if (!source || s.tabs.some((t) => t.group === 1)) return;
      const clone: Tab = { ...source, id: newTabId(), group: 1, loading: false, requestSeq: 0 };
      set((st) => ({
        tabs: [...st.tabs, clone],
        activeTabIds: withActive(st.activeTabIds, 1, clone.id),
        focusedGroup: 1,
      }));
      if (source.loading && clone.kind === "browse") void get().loadPage(clone.id, true);
    },

    moveTabToOtherGroup(id) {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab) return;
      if (get().split === "none") set({ split: "horizontal" });
      const to = otherGroup(tab.group);
      const { tabs, activeTabIds } = get();
      const fromRest = tabs.filter((t) => t.group === tab.group && t.id !== id);
      let ids = withActive(activeTabIds, to, id);
      if (activeTabIds[tab.group] === id) ids = withActive(ids, tab.group, fromRest[fromRest.length - 1]?.id ?? null);
      set({
        tabs: tabs.map((t) => (t.id === id ? { ...t, group: to } : t)),
        activeTabIds: ids,
        focusedGroup: to,
      });
    },

    setView(tabId, view) {
      updateTab(tabId, { view });
    },

    openQuery(spec) {
      // 条件の指定がなければ、同じグループの空のクエリタブを使い回す
      if (!spec) {
        const blank = get().tabs.find((t) => t.group === get().focusedGroup && isBlankQuery(t));
        if (blank) {
          get().setActiveTab(blank.id);
          return;
        }
      }
      const id = newTabId();
      const tab: QueryTab = {
        id,
        kind: "query",
        group: get().focusedGroup,
        spec: spec ?? emptyQuerySpec(),
        ranSpec: null,
        docs: [],
        readTime: null,
        structuredQuery: null,
        loading: false,
        error: null,
        view: "table",
        requestSeq: 0,
      };
      addTab(tab);
    },

    patchQuerySpec(tabId, patch) {
      const tab = get().tabs.find((t) => t.id === tabId);
      if (tab?.kind !== "query") return;
      const p = typeof patch === "function" ? patch(tab.spec) : patch;
      updateTab<QueryTab>(tabId, { spec: { ...tab.spec, ...p } });
    },

    async executeQuery(tabId) {
      const conn = activeConnection(get());
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!conn || tab?.kind !== "query") return;
      const seq = tab.requestSeq + 1;
      const spec = tab.spec;
      updateTab<QueryTab>(tabId, { loading: true, error: null, requestSeq: seq });
      // 失敗したクエリも残す（インデックス作成後に再実行しやすいように）
      const history = { ...get().queryHistory, [conn.id]: addToHistory(get().queryHistory[conn.id] ?? [], spec) };
      set({ queryHistory: history });
      void saveQueryHistory(history);
      const isCurrent = () => get().tabs.find((t) => t.id === tabId)?.requestSeq === seq;
      try {
        const result = await runQuery(conn, spec);
        if (!isCurrent()) return;
        updateTab<QueryTab>(tabId, {
          loading: false,
          ranSpec: spec,
          docs: result.documents,
          readTime: result.readTime,
          structuredQuery: result.structuredQuery,
        });
      } catch (e) {
        if (!isCurrent()) return;
        updateTab<QueryTab>(tabId, { loading: false, error: toAppError(e) });
      }
    },

    runHistoryEntry(tabId, entry) {
      updateTab<QueryTab>(tabId, { spec: structuredClone(entry.spec) });
      void get().executeQuery(tabId);
    },

    removeHistoryEntry(ranAt) {
      const id = get().activeConnectionId;
      if (!id) return;
      const history = {
        ...get().queryHistory,
        [id]: (get().queryHistory[id] ?? []).filter((h) => h.ranAt !== ranAt),
      };
      set({ queryHistory: history });
      void saveQueryHistory(history);
    },

    clearHistory() {
      const id = get().activeConnectionId;
      if (!id) return;
      const history = { ...get().queryHistory };
      delete history[id];
      set({ queryHistory: history });
      void saveQueryHistory(history);
    },

    selectDocument(path) {
      set({ selectedDocPath: path, selectedUser: null, ...(path ? { detailOpen: true } : {}) });
    },

    selectUser(user) {
      set({ selectedUser: user, selectedDocPath: null, ...(user ? { detailOpen: true } : {}) });
    },

    openAuth() {
      const { tabs, focusedGroup } = get();
      const existing = tabs.find((t) => t.kind === "auth" && t.group === focusedGroup);
      if (existing) {
        get().setActiveTab(existing.id);
        return;
      }
      const id = newTabId();
      addTab({
        id,
        kind: "auth",
        group: focusedGroup,
        users: [],
        nextPageToken: null,
        search: null,
        loading: false,
        error: null,
        view: "table",
        requestSeq: 0,
      });
      void get().loadUsers(id, true);
    },

    async loadUsers(tabId, reset) {
      const conn = activeConnection(get());
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!conn || tab?.kind !== "auth") return;
      const seq = tab.requestSeq + 1;
      updateTab<AuthTab>(tabId, {
        loading: true,
        error: null,
        requestSeq: seq,
        ...(reset ? { users: [], nextPageToken: null, search: null } : {}),
      });
      const isCurrent = () => get().tabs.find((t) => t.id === tabId)?.requestSeq === seq;
      try {
        const page = await listAuthUsers(conn, get().appearance.userPageSize, reset ? null : tab.nextPageToken);
        if (!isCurrent()) return;
        const latest = get().tabs.find((t) => t.id === tabId);
        const prev = reset || latest?.kind !== "auth" ? [] : latest.users;
        updateTab<AuthTab>(tabId, {
          users: [...prev, ...page.users],
          nextPageToken: page.nextPageToken,
          loading: false,
        });
      } catch (e) {
        if (!isCurrent()) return;
        updateTab<AuthTab>(tabId, { loading: false, error: toAppError(e) });
      }
    },

    async searchUsers(tabId, kind, value) {
      const conn = activeConnection(get());
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!conn || tab?.kind !== "auth") return;
      const seq = tab.requestSeq + 1;
      updateTab<AuthTab>(tabId, {
        loading: true,
        error: null,
        requestSeq: seq,
        search: { kind, value },
        users: [],
        nextPageToken: null,
      });
      const isCurrent = () => get().tabs.find((t) => t.id === tabId)?.requestSeq === seq;
      try {
        const users = await lookupAuthUsers(conn, kind, value);
        if (!isCurrent()) return;
        updateTab<AuthTab>(tabId, { users, loading: false });
      } catch (e) {
        if (!isCurrent()) return;
        updateTab<AuthTab>(tabId, { loading: false, error: toAppError(e) });
      }
    },

    setDetailOpen(open) {
      set({ detailOpen: open });
    },

    setDetailView(view) {
      set({ detailView: view });
    },

    setTreeOpen(open) {
      set({ treeOpen: open });
    },
  };
});
