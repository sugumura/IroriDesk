import { load, type Store } from "@tauri-apps/plugin-store";
import type { ConnectionConfig } from "./api";
import { type Appearance, normalizeAppearance } from "./appearance";
import type { ColumnConfig } from "./columns";

const FILE = "settings.json";

let storePromise: Promise<Store> | null = null;
function store(): Promise<Store> {
  storePromise ??= load(FILE, { defaults: {}, autoSave: 200 }).catch((e: unknown) => {
    // 失敗を記憶せず、次回呼び出しで再試行する
    storePromise = null;
    throw e;
  });
  return storePromise;
}

export interface PersistedSettings {
  connections: ConnectionConfig[];
  activeConnectionId: string | null;
}

/** 初回起動時に用意する Emulator 接続（README の手順と対応） */
export const DEFAULT_EMULATOR_CONNECTION: ConnectionConfig = {
  id: "emulator-demo",
  name: "Emulator (demo)",
  projectId: "demo-firestore-viewer",
  databaseId: "(default)",
  readOnly: true,
  kind: "emulator",
  emulatorHost: "127.0.0.1:8080",
};

export async function loadSettings(): Promise<PersistedSettings> {
  const s = await store();
  const connections = await s.get<ConnectionConfig[]>("connections");
  const activeConnectionId = await s.get<string | null>("activeConnectionId");
  if (!connections) {
    return {
      connections: [DEFAULT_EMULATOR_CONNECTION],
      activeConnectionId: DEFAULT_EMULATOR_CONNECTION.id,
    };
  }
  return { connections, activeConnectionId: activeConnectionId ?? null };
}

export async function loadAppearance(): Promise<Appearance> {
  const s = await store();
  return normalizeAppearance(await s.get<Partial<Appearance>>("appearance"));
}

export async function saveAppearance(appearance: Appearance): Promise<void> {
  const s = await store();
  await s.set("appearance", appearance);
}

/** 接続×コレクションごとの列設定 */
export async function loadColumnConfigs(): Promise<Record<string, ColumnConfig>> {
  const s = await store();
  return (await s.get<Record<string, ColumnConfig>>("columns")) ?? {};
}

export async function saveColumnConfigs(configs: Record<string, ColumnConfig>): Promise<void> {
  const s = await store();
  await s.set("columns", configs);
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  const s = await store();
  await s.set("connections", settings.connections);
  await s.set("activeConnectionId", settings.activeConnectionId);
}
