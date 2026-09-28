import { create } from "zustand";
import {
  type AppError,
  type ConnectionConfig,
  type DisplayDocument,
  listCollectionIds,
  listDocuments,
  type QuerySpec,
  runQuery,
  toAppError,
} from "@/lib/api";
import { type Appearance, applyAppearance, DEFAULT_APPEARANCE } from "@/lib/appearance";
import type { ColumnConfig } from "@/lib/columns";
import {
  loadAppearance,
  loadColumnConfigs,
  loadSettings,
  saveAppearance,
  saveColumnConfigs,
  saveSettings,
} from "@/lib/settings";

export const PAGE_SIZE = 50;

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

export type Tab = BrowseTab | QueryTab;

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

export function tabTitle(t: Tab): string {
  if (t.kind === "browse") return t.collectionPath;
  const target = t.spec.target || "(未指定)";
  return t.spec.targetKind === "collectionGroup" ? `クエリ: group(${target})` : `クエリ: ${target}`;
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
  detailOpen: boolean;
  appearance: Appearance;
  columnConfigs: Record<string, ColumnConfig>;

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

  selectDocument(path: string | null): void;
  setDetailOpen(open: boolean): void;
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
    detailOpen: true,
    appearance: DEFAULT_APPEARANCE,
    columnConfigs: {},

    async init() {
      const [settings, appearance, columnConfigs] = await Promise.all([
        loadSettings(),
        loadAppearance(),
        loadColumnConfigs(),
      ]);
      applyAppearance(appearance);
      set({ ...settings, appearance, columnConfigs, ready: true });
      if (activeConnection(get())) void get().loadRootCollections();
    },

    setAppearance(patch) {
      const appearance = { ...get().appearance, ...patch };
      applyAppearance(appearance);
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
          PAGE_SIZE,
          reset ? null : tab.nextPageToken,
        );
        if (!isCurrent()) return;
        const prev = reset ? [] : (get().tabs.find((t) => t.id === tabId)?.docs ?? []);
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

    selectDocument(path) {
      set({ selectedDocPath: path, ...(path ? { detailOpen: true } : {}) });
    },

    setDetailOpen(open) {
      set({ detailOpen: open });
    },
  };
});
