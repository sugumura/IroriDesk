import type { QuerySpec } from "./api";

/** 保存するタブ。データ（読み込んだドキュメント）は保存せず、開き直すときに読み込む */
export interface SavedTab {
  kind: "browse" | "query" | "auth";
  group: 0 | 1;
  /** 閲覧タブのコレクションパス */
  path?: string;
  /** クエリタブの条件（復元時は実行しない） */
  spec?: QuerySpec;
  view: "table" | "json";
  filter: string;
  sort: { column: string; desc: boolean } | null;
  /** そのグループで選択中だったか */
  active: boolean;
}

export interface SavedSession {
  tabs: SavedTab[];
  split: "none" | "horizontal" | "vertical";
  focusedGroup: 0 | 1;
}
