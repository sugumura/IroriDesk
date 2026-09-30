import { create } from "zustand";
import {
  type AppError,
  type ConnectionConfig,
  type DisplayDocument,
  type DisplayUser,
  listAuthUsers,
  listCollectionIds,
  countDocuments,
  listDocuments,
  lookupAuthUsers,
  type UserLookupKind,
  type QuerySpec,
  runQuery,
  setGcloudPath as applyGcloudPath,
  toAppError,
} from "@/lib/api";
import { invoke } from "@tauri-apps/api/core";
import { type Appearance, applyAppearance, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { resolveLang } from "@/i18n";
import type { TFunction } from "@/i18n";
import type { ColumnConfig } from "@/lib/columns";
import { addToHistory, type HistoryEntry, summarizeQuery, whereText } from "@/lib/queryHistory";
import type { SavedSession, SavedTab } from "@/lib/session";
import {
  loadAppearance,
  loadColumnConfigs,
  loadSessions,
  saveSessions,
  loadGcloudPath,
  loadQueryHistory,
  loadSettings,
  saveAppearance,
  saveColumnConfigs,
  saveGcloudPath,
  saveQueryHistory,
  saveSettings,
} from "@/lib/settings";


/** 分割表示のグループ。0 = 左（上）、1 = 右（下） */
export type GroupIndex = 0 | 1;
/** 並べ替える列（"__id" は Doc ID / UID の列）と向き */
export type TableSort = { column: string; desc: boolean };
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
  /** 読み込み済みの結果の絞り込み（手元だけ） */
  filter: string;
  /** テーブルの並べ替え（手元だけ）。null は読み込んだ順 */
  sort: TableSort | null;
  /** 古いレスポンスを捨てるための世代番号 */
  requestSeq: number;
  /** コレクション全体の件数（集計クエリ）。未取得・失敗時は null */
  totalCount: number | null;
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
  /** 読み込み済みの結果の絞り込み（手元だけ） */
  filter: string;
  /** テーブルの並べ替え（手元だけ）。null は読み込んだ順 */
  sort: TableSort | null;
  requestSeq: number;
  /** 条件に一致する件数（limit なし）。未取得・失敗時は null */
  totalCount: number | null;
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
  /** 読み込み済みの結果の絞り込み（手元だけ） */
  filter: string;
  /** テーブルの並べ替え（手元だけ）。null は読み込んだ順 */
  sort: TableSort | null;
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
  settingsOpen: boolean;
  paletteOpen: boolean;
  /** 詳細パネルのドキュメント表示（ドキュメントを選び直しても保つ） */
  detailView: "tree" | "json";
  treeOpen: boolean;
  appearance: Appearance;
  columnConfigs: Record<string, ColumnConfig>;
  /** 接続IDごとのクエリ履歴（新しい順） */
  queryHistory: Record<string, HistoryEntry[]>;
  /** 設定で指定した gcloud CLI の場所（null なら自動で探す） */
  gcloudPath: string | null;

  init(): Promise<void>;
  setAppearance(patch: Partial<Appearance>): void;
  setGcloudPath(path: string | null): Promise<void>;
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
  setTabFilter(tabId: string, filter: string): void;
  setTabSort(tabId: string, sort: TableSort | null): void;

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
  setSettingsOpen(open: boolean): void;
  setPaletteOpen(open: boolean): void;
  /** フォーカス中のグループの選択中のタブを閉じる */
  closeActiveTab(): void;
  /** 選択中のタブを読み込み直す（クエリは実行済みなら再実行） */
  reloadActiveTab(): void;
  /** フォーカス中のグループで前後のタブに切り替える */
  cycleTab(delta: 1 | -1): void;
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

let initStarted = false;

/** 接続ごとの保存済みのタブ。変更は少し待ってまとめて保存する */
let sessions: Record<string, SavedSession> = {};
let sessionSaveTimer: ReturnType<typeof setTimeout> | undefined;
/** 接続の切り替え・復元の途中は保存しない（空の状態で上書きしないため） */
let sessionSaveSuspended = false;

function toSession(s: Pick<State, "tabs" | "activeTabIds" | "split" | "focusedGroup">): SavedSession {
  return {
    split: s.split,
    focusedGroup: s.focusedGroup,
    tabs: s.tabs.map<SavedTab>((t) => ({
      kind: t.kind,
      group: t.group,
      ...(t.kind === "browse" ? { path: t.collectionPath } : {}),
      ...(t.kind === "query" ? { spec: t.spec } : {}),
      view: t.view,
      filter: t.filter,
      sort: t.sort,
      active: s.activeTabIds[t.group] === t.id,
    })),
  };
}

function writeSession(connectionId: string, session: SavedSession) {
  sessions = { ...sessions, [connectionId]: session };
  void saveSessions(sessions);
}

/** 件数の取得は一覧の読み込みとは別に走るため、タブごとに最新の要求だけを反映する */
const countTokens = new Map<string, number>();

const emptyRoot: RootCollections = { ids: null, loading: false, error: null };

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { connections, activeConnectionId } = get();
    void saveSettings({ connections, activeConnectionId });
  };

  const updateTab = <T extends Tab>(id: string, patch: Partial<T>) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? ({ ...t, ...patch } as Tab) : t)) }));

  /** 件数を集計クエリで取得してタブに反映する。失敗しても一覧の表示には影響させない */
  const refreshCount = async (tabId: string, spec: QuerySpec) => {
    const conn = activeConnection(get());
    if (!conn) return;
    const token = (countTokens.get(tabId) ?? 0) + 1;
    countTokens.set(tabId, token);
    try {
      const total = await countDocuments(conn, spec);
      if (countTokens.get(tabId) !== token || !get().tabs.some((t) => t.id === tabId)) return;
      updateTab(tabId, { totalCount: total });
    } catch {
      // 件数の取得に失敗しても（権限・Emulator の制限など）表示しないだけにする
    }
  };

  /** 表示されたタブのデータを初めて読み込む（復元したタブは選ぶまで読み込まない） */
  const ensureLoaded = (tabId: string) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.requestSeq !== 0 || tab.loading) return;
    if (tab.kind === "browse") void get().loadPage(tabId, true);
    else if (tab.kind === "auth") void get().loadUsers(tabId, true);
  };

  /** 今の接続のタブをすぐ保存する（接続の切り替え前など） */
  const flushSession = () => {
    clearTimeout(sessionSaveTimer);
    const id = get().activeConnectionId;
    if (id && get().ready) writeSession(id, toSession(get()));
  };

  /** 接続の保存済みのタブを開き直す。データは表示中のタブだけ読み込む */
  const restoreSession = (connectionId: string) => {
    const saved = sessions[connectionId];
    if (!saved || saved.tabs.length === 0) return;
    const tabs: Tab[] = [];
    const activeTabIds: [string | null, string | null] = [null, null];
    for (const st of saved.tabs) {
      const id = newTabId();
      const common = {
        id,
        group: st.group,
        view: st.view,
        filter: st.filter ?? "",
        sort: st.sort ?? null,
        loading: false,
        error: null,
        requestSeq: 0,
      };
      if (st.kind === "browse" && st.path) {
        tabs.push({ ...common, kind: "browse", collectionPath: st.path, docs: [], nextPageToken: null, totalCount: null });
      } else if (st.kind === "query" && st.spec) {
        tabs.push({
          ...common,
          kind: "query",
          spec: st.spec,
          ranSpec: null,
          totalCount: null,
          docs: [],
          readTime: null,
          structuredQuery: null,
        });
      } else if (st.kind === "auth") {
        tabs.push({ ...common, kind: "auth", users: [], nextPageToken: null, search: null });
      } else {
        continue;
      }
      if (st.active || activeTabIds[st.group] === null) activeTabIds[st.group] = id;
    }
    const hasGroup1 = tabs.some((t) => t.group === 1);
    set({
      tabs,
      activeTabIds,
      split: hasGroup1 ? (saved.split === "none" ? "horizontal" : saved.split) : "none",
      focusedGroup: hasGroup1 ? saved.focusedGroup : 0,
    });
    for (const id of activeTabIds) if (id) ensureLoaded(id);
  };

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
    settingsOpen: false,
    paletteOpen: false,
    detailView: "tree",
    treeOpen: true,
    appearance: DEFAULT_APPEARANCE,
    columnConfigs: {},
    queryHistory: {},
    gcloudPath: null,

    async init() {
      // 開発時は React の StrictMode で2回呼ばれるため、1回だけ実行する
      if (initStarted) return;
      initStarted = true;
      const [settings, appearance, columnConfigs, queryHistory, savedSessions, gcloudPath] = await Promise.all([
        loadSettings(),
        loadAppearance(),
        loadColumnConfigs(),
        loadQueryHistory(),
        loadSessions(),
        loadGcloudPath(),
      ]);
      // タブの復元で gcloud のトークンを使う前に、指定された場所を Rust 側に反映する
      await applyGcloudPath(gcloudPath).catch(() => {});
      sessions = savedSessions;
      applyAppearance(appearance);
      syncLanguage(appearance);
      sessionSaveSuspended = true;
      set({ ...settings, appearance, columnConfigs, queryHistory, gcloudPath, ready: true });
      if (settings.activeConnectionId) restoreSession(settings.activeConnectionId);
      sessionSaveSuspended = false;
      if (activeConnection(get())) void get().loadRootCollections();
    },

    async setGcloudPath(path) {
      const value = path?.trim() || null;
      await applyGcloudPath(value);
      set({ gcloudPath: value });
      await saveGcloudPath(value);
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
      flushSession();
      sessionSaveSuspended = true;
      set({ activeConnectionId: id });
      resetBrowsing();
      if (id) restoreSession(id);
      sessionSaveSuspended = false;
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
        flushSession();
        sessionSaveSuspended = true;
        resetBrowsing();
        restoreSession(conn.id);
        sessionSaveSuspended = false;
        void get().loadRootCollections();
      }
    },

    deleteConnection(id) {
      set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }));
      clearTimeout(sessionSaveTimer);
      const { [id]: _removed, ...rest } = sessions;
      sessions = rest;
      void saveSessions(sessions);
      if (get().activeConnectionId === id) {
        const next = get().connections[0]?.id ?? null;
        sessionSaveSuspended = true;
        set({ activeConnectionId: next });
        resetBrowsing();
        if (next) restoreSession(next);
        sessionSaveSuspended = false;
        if (next) void get().loadRootCollections();
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
        totalCount: null,
        kind: "browse",
        group: get().focusedGroup,
        collectionPath: path,
        docs: [],
        nextPageToken: null,
        loading: false,
        error: null,
        view: current?.view ?? "table",
        filter: "",
        sort: null,
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
        ...(reset ? { docs: [], nextPageToken: null, totalCount: null } : {}),
      });
      if (reset) {
        void refreshCount(tabId, { targetKind: "collection", target: tab.collectionPath, where: [], orderBy: [], limit: null });
      }
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
      ensureLoaded(id);
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

    setTabFilter(tabId, filter) {
      updateTab(tabId, { filter });
    },

    setTabSort(tabId, sort) {
      updateTab(tabId, { sort });
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
        totalCount: null,
        docs: [],
        readTime: null,
        structuredQuery: null,
        loading: false,
        error: null,
        view: "table",
        filter: "",
        sort: null,
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
      updateTab<QueryTab>(tabId, { loading: true, error: null, requestSeq: seq, totalCount: null });
      void refreshCount(tabId, spec);
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
        filter: "",
        sort: null,
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

    setSettingsOpen(open) {
      set({ settingsOpen: open });
    },

    setPaletteOpen(open) {
      set({ paletteOpen: open });
    },

    closeActiveTab() {
      const tab = focusedTab(get());
      if (tab) get().closeTab(tab.id);
    },

    reloadActiveTab() {
      const tab = focusedTab(get());
      if (!tab) {
        void get().loadRootCollections();
      } else if (tab.kind === "browse") {
        void get().loadPage(tab.id, true);
      } else if (tab.kind === "auth") {
        if (tab.search) void get().searchUsers(tab.id, tab.search.kind, tab.search.value);
        else void get().loadUsers(tab.id, true);
      } else if (tab.ranSpec) {
        void get().executeQuery(tab.id);
      }
    },

    cycleTab(delta) {
      const { tabs, focusedGroup, activeTabIds } = get();
      const group = tabs.filter((t) => t.group === focusedGroup);
      if (group.length < 2) return;
      const i = group.findIndex((t) => t.id === activeTabIds[focusedGroup]);
      get().setActiveTab(group[(i + delta + group.length) % group.length].id);
    },

    setDetailView(view) {
      set({ detailView: view });
    },

    setTreeOpen(open) {
      set({ treeOpen: open });
    },
  };
});

// タブ・分割・選択が変わったら、今の接続のタブとして少し待ってから保存する
useStore.subscribe((s, prev) => {
  if (sessionSaveSuspended || !s.ready || !s.activeConnectionId) return;
  if (
    s.tabs === prev.tabs &&
    s.activeTabIds === prev.activeTabIds &&
    s.split === prev.split &&
    s.focusedGroup === prev.focusedGroup
  ) {
    return;
  }
  const connectionId = s.activeConnectionId;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    const now = useStore.getState();
    if (now.activeConnectionId === connectionId) writeSession(connectionId, toSession(now));
  }, 500);
});
