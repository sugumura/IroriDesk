import { useMemo } from "react";
import type { DisplayDocument } from "./api";
import { type ColumnConfig, columnConfigKey, EMPTY_COLUMN_CONFIG, visibleFields } from "./columns";
import { unionFieldNames } from "./display";
import { useStore } from "@/store";

export interface ColumnLayout {
  /** データに現れる全フィールド */
  fieldNames: string[];
  /** 表示する列（Doc ID を除く）を順に */
  visible: string[];
  config: ColumnConfig;
  /** 保存先のキー。接続がなければ null */
  key: string | null;
}

/** 表示中のドキュメントと保存済みの列設定から、表示する列を決める */
export function useColumnLayout(docs: DisplayDocument[], scope: string): ColumnLayout {
  const connectionId = useStore((s) => s.activeConnectionId);
  const key = connectionId ? columnConfigKey(connectionId, scope) : null;
  const config = useStore((s) => (key && s.columnConfigs[key]) || EMPTY_COLUMN_CONFIG);
  const fieldNames = useMemo(() => unionFieldNames(docs), [docs]);
  const visible = useMemo(() => visibleFields(fieldNames, config), [fieldNames, config]);
  return { fieldNames, visible, config, key };
}
