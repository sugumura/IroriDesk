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
  /** Firebase Auth Emulator のホスト（Emulator 接続のみ） */
  authEmulatorHost?: string;
  /** 本番接続で使う gcloud のアカウント。未指定なら ADC */
  account?: string;
}

/** Rust 側 AppError のシリアライズ形式 */
export interface AppError {
  code: "AUTH" | "API" | "NETWORK" | "INVALID_INPUT" | "DECODE" | "FILE" | "INTERNAL";
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

export type WhereOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not-in"
  | "array-contains"
  | "array-contains-any";

export type QueryValueType =
  | "string"
  | "integer"
  | "double"
  | "boolean"
  | "null"
  | "timestamp"
  | "reference";

export interface WhereClause {
  field: string;
  op: WhereOp;
  valueType: QueryValueType;
  /** in / not-in / array-contains-any はカンマ区切り */
  value: string;
}

export interface OrderClause {
  field: string;
  direction: "asc" | "desc";
}

export interface QuerySpec {
  targetKind: "collection" | "collectionGroup";
  /** collection ならコレクションパス、collectionGroup ならコレクションID */
  target: string;
  where: WhereClause[];
  orderBy: OrderClause[];
  limit: number | null;
}

export interface QueryResult {
  documents: DisplayDocument[];
  readTime: string | null;
  structuredQuery: unknown;
}

export function runQuery(connection: ConnectionConfig, spec: QuerySpec): Promise<QueryResult> {
  return invoke("run_query", { connection, spec });
}

/** 保存ダイアログで選んだファイルに書き込む。キャンセル時は null */
export function saveTextFile(
  defaultName: string,
  filterName: string,
  extension: string,
  contents: string,
): Promise<string | null> {
  return invoke("save_text_file", { defaultName, filterName, extension, contents });
}

/** Firebase Authentication のユーザー（パスワードのハッシュ等は Rust 側で除去済み） */
export interface DisplayUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
  disabled: boolean;
  providers: string[];
  createdAt: string | null;
  lastLoginAt: string | null;
  lastRefreshAt: string | null;
  customClaims: unknown;
  tenantId: string | null;
  raw: Record<string, unknown>;
}

export interface UserPage {
  users: DisplayUser[];
  nextPageToken: string | null;
}

export type UserLookupKind = "uid" | "email" | "phone";

export function listAuthUsers(
  connection: ConnectionConfig,
  pageSize: number,
  pageToken?: string | null,
): Promise<UserPage> {
  return invoke("list_auth_users", { connection, pageSize, pageToken });
}

export function lookupAuthUsers(
  connection: ConnectionConfig,
  kind: UserLookupKind,
  value: string,
): Promise<DisplayUser[]> {
  return invoke("lookup_auth_users", { connection, kind, value });
}

export interface GcloudAccount {
  account: string;
  /** gcloud CLI で現在有効なアカウント */
  active: boolean;
}

export function listGcloudAccounts(): Promise<GcloudAccount[]> {
  return invoke("list_gcloud_accounts");
}

/** ブラウザで Google にログインして gcloud にアカウントを追加する（account 指定で再ログイン） */
export function gcloudLogin(account?: string): Promise<GcloudAccount[]> {
  return invoke("gcloud_login", { account });
}

/** ADC を読み直し、gcloud のトークンキャッシュを捨てる */
export function reloadCredentials(): Promise<void> {
  return invoke("reload_credentials");
}

export interface IndexField {
  fieldPath: string;
  mode: "asc" | "desc" | "array-contains" | "vector";
}

export interface CompositeIndex {
  id: string;
  collectionGroup: string;
  queryScope: "COLLECTION" | "COLLECTION_GROUP" | string;
  fields: IndexField[];
  state: "READY" | "CREATING" | "NEEDS_REPAIR" | string;
}

export interface FieldOverride {
  fieldPath: string;
  /** 空なら自動インデックスを無効にしている */
  indexes: { queryScope: string; mode: IndexField["mode"]; state: string }[];
  ttl: boolean;
}

export interface CollectionIndexes {
  collectionGroup: string;
  composite: CompositeIndex[];
  fieldOverrides: FieldOverride[];
}

/** コレクションID（コレクショングループ）単位のインデックス情報 */
export function listIndexes(connection: ConnectionConfig, collectionId: string): Promise<CollectionIndexes> {
  return invoke("list_indexes", { connection, collectionId });
}

/** 条件に一致するドキュメント数（集計クエリ。limit は無視） */
export function countDocuments(connection: ConnectionConfig, spec: QuerySpec): Promise<number> {
  return invoke("count_documents", { connection, spec });
}
