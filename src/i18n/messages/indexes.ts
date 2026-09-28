/** インデックス一覧のダイアログ */
export const ja = {
  mode: {
    asc: "昇順",
    desc: "降順",
    arrayContains: "配列（array-contains）",
    vector: "ベクトル",
  },
  scope: {
    collection: "コレクション",
    collectionGroup: "コレクショングループ",
  },
  state: {
    ready: "作成済み",
    creating: "作成中",
    needsRepair: "要修復",
  },
  title: "インデックス: ",
  description: "インデックスはコレクションID単位です（親のドキュメントに関係なく、同じIDのコレクションで共通）。",
  composite: "複合インデックス（{count}）",
  noComposite:
    "複合インデックスはありません。インデックスが必要なクエリを実行すると、作成用のリンクがエラーに表示されます。",
  fieldOverrides: "単一フィールドの例外（{count}）",
  fieldOverridesHelp:
    "単一フィールドのインデックス（昇順・降順・配列）は、例外を除いてすべてのフィールドに自動で作成されます。",
  autoIndexDisabled: "自動インデックス無効",
  modeScope: "{mode}・{scope}",
  openConsole: "Firebase コンソールで開く",
};

export const en: typeof ja = {
  mode: {
    asc: "Ascending",
    desc: "Descending",
    arrayContains: "Array (array-contains)",
    vector: "Vector",
  },
  scope: {
    collection: "Collection",
    collectionGroup: "Collection group",
  },
  state: {
    ready: "Enabled",
    creating: "Building",
    needsRepair: "Needs repair",
  },
  title: "Indexes: ",
  description:
    "Indexes apply per collection ID (shared by all collections with the same ID, regardless of parent document).",
  composite: "Composite indexes ({count})",
  noComposite:
    "No composite indexes. When you run a query that needs an index, the error shows a link to create it.",
  fieldOverrides: "Single-field exemptions ({count})",
  fieldOverridesHelp:
    "Single-field indexes (ascending, descending, array) are created automatically for every field except exemptions.",
  autoIndexDisabled: "Automatic indexing disabled",
  modeScope: "{mode} · {scope}",
  openConsole: "Open in Firebase console",
};
