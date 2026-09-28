import { create } from "zustand";
import {
  type AppError,
  type ConnectionConfig,
  type DisplayDocument,
  listCollectionIds,
  listDocuments,
  toAppError,
} from "@/lib/api";
import { loadSettings, saveSettings } from "@/lib/settings";

export const PAGE_SIZE = 50;

export interface BrowseTab {
  id: string;
  kind: "browse";
  collectionPath: string;
  docs: DisplayDocument[];
  nextPageToken: string | null;
  loading: boolean;
  error: AppError | null;
  view: "table" | "json";
  /** 古いレスポンスを捨てるための世代番号 */
  requestSeq: number;
}

export type Tab = BrowseTab;

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
  activeTabId: string | null;
  selectedDocPath: string | null;
  detailOpen: boolean;

  init(): Promise<void>;
  setActiveConnection(id: string | null): void;
  upsertConnection(conn: ConnectionConfig): void;
  deleteConnection(id: string): void;
  loadRootCollections(): Promise<void>;

  openCollection(path: string, opts?: { newTab?: boolean }): void;
  loadPage(tabId: string, reset: boolean): Promise<void>;
  setActiveTab(id: string): void;
  closeTab(id: string): void;
  setView(tabId: string, view: BrowseTab["view"]): void;

  selectDocument(path: string | null): void;
  setDetailOpen(open: boolean): void;
}

let tabCounter = 0;
const newTabId = () => `tab-${++tabCounter}`;

export function activeConnection(s: Pick<State, "connections" | "activeConnectionId">) {
  return s.connections.find((c) => c.id === s.activeConnectionId) ?? null;
}

const emptyRoot: RootCollections = { ids: null, loading: false, error: null };

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { connections, activeConnectionId } = get();
    void saveSettings({ connections, activeConnectionId });
  };

  const updateTab = (id: string, patch: Partial<BrowseTab>) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));

  /** 接続を切り替えたら閲覧状態をすべて捨てる */
  const resetBrowsing = () =>
    set({ rootCollections: emptyRoot, tabs: [], activeTabId: null, selectedDocPath: null });

  return {
    ready: false,
    connections: [],
    activeConnectionId: null,
    rootCollections: emptyRoot,
    tabs: [],
    activeTabId: null,
    selectedDocPath: null,
    detailOpen: true,

    async init() {
      const settings = await loadSettings();
      set({ ...settings, ready: true });
      if (activeConnection(get())) void get().loadRootCollections();
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
      const { tabs, activeTabId } = get();
      const current = tabs.find((t) => t.id === activeTabId);
      const base: Omit<BrowseTab, "id"> = {
        kind: "browse",
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
        set({ tabs: [...tabs, { ...base, id }], activeTabId: id });
      }
      set({ activeTabId: id });
      void get().loadPage(id, true);
    },

    async loadPage(tabId, reset) {
      const conn = activeConnection(get());
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!conn || !tab) return;
      const seq = tab.requestSeq + 1;
      updateTab(tabId, {
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
        updateTab(tabId, {
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
      set({ activeTabId: id });
    },

    closeTab(id) {
      const { tabs, activeTabId } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      const rest = tabs.filter((t) => t.id !== id);
      set({
        tabs: rest,
        activeTabId:
          activeTabId === id ? (rest[Math.min(idx, rest.length - 1)]?.id ?? null) : activeTabId,
      });
    },

    setView(tabId, view) {
      updateTab(tabId, { view });
    },

    selectDocument(path) {
      set({ selectedDocPath: path, ...(path ? { detailOpen: true } : {}) });
    },

    setDetailOpen(open) {
      set({ detailOpen: open });
    },
  };
});
