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
  code: "AUTH" | "API" | "NETWORK" | "INVALID_INPUT" | "DECODE" | "INTERNAL";
  message: string;
  detail: string | null;
}

export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return e as AppError;
  }
  return { code: "INTERNAL", message: String(e), detail: null };
}

/** 表示用JSON（docs/SPEC.md「型変換」） */
export type DisplayValue =
  | null
  | boolean
  | number
  | string
  | DisplayValue[]
  | { [key: string]: DisplayValue };

export interface DisplayDocument {
  id: string;
  /** `users/alice` のような相対パス */
  path: string;
  /** `projects/.../documents/users/alice` */
  name: string;
  fields: Record<string, DisplayValue>;
  createTime: string | null;
  updateTime: string | null;
  /** 実体がなく、サブコレクションだけを持つドキュメント */
  missing: boolean;
}

export interface DocumentPage {
  documents: DisplayDocument[];
  nextPageToken: string | null;
}

export function listCollectionIds(
  connection: ConnectionConfig,
  parentPath?: string,
): Promise<string[]> {
  return invoke("list_collection_ids", { connection, parentPath });
}

export function getDocument(connection: ConnectionConfig, path: string): Promise<DisplayDocument> {
  return invoke("get_document", { connection, path });
}

export function listDocuments(
  connection: ConnectionConfig,
  collectionPath: string,
  pageSize: number,
  pageToken?: string | null,
): Promise<DocumentPage> {
  return invoke("list_documents", { connection, collectionPath, pageSize, pageToken });
}
