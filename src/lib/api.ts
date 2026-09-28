import { invoke } from "@tauri-apps/api/core";

export type ConnectionKind = "production" | "emulator";

export interface ConnectionConfig {
  id: string;
  name: string;
  projectId: string;
  databaseId?: string;
  quotaProject?: string;
  readOnly: boolean;
  kind: ConnectionKind;
  emulatorHost?: string;
}

/** Rust 側 AppError のシリアライズ形式 */
export interface AppError {
  code: "AUTH" | "API" | "NETWORK" | "INVALID_INPUT" | "INTERNAL";
  message: string;
  detail: string | null;
}

export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return e as AppError;
  }
  return { code: "INTERNAL", message: String(e), detail: null };
}

export function listCollectionIds(
  connection: ConnectionConfig,
  parentPath?: string,
): Promise<string[]> {
  return invoke("list_collection_ids", { connection, parentPath });
}
