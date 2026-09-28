/** コレクションの閲覧タブ（BrowseView） */
export const ja = {
  openCollection: "コレクションを開く",
  showDocument: "ドキュメントを表示",
  queryThisCollection: "このコレクションを対象にクエリタブを開く",
  query: "クエリ",
  showIndexes: "コレクション {id} のインデックスを表示",
  indexes: "インデックス",
  noDocuments: "ドキュメントはありません",
  /** 件数（common.count）の後ろに続く。狭い幅では隠れる */
  loadedSuffix: "読み込み済み",
  sortHint: "{column}（クリックで並べ替え: 昇順 → 降順 → 元の順）",
  filterPlaceholder: "読み込み済みを絞り込み",
  filtered: "{total} 件中 {shown} 件を表示",
  totalSuffix: " / 全 {count} 件",
  missingSuffix: "（うち実体なし {count} 件）",
  more: "続き",
  loadMore: "さらに読み込む",
};

export const en: typeof ja = {
  openCollection: "Open collection",
  showDocument: "Show document",
  queryThisCollection: "Open a query tab for this collection",
  query: "Query",
  showIndexes: "Show indexes for collection {id}",
  indexes: "Indexes",
  noDocuments: "No documents",
  loadedSuffix: " loaded",
  sortHint: "{column} (click to sort: ascending → descending → original)",
  filterPlaceholder: "Filter loaded rows",
  filtered: "Showing {shown} of {total}",
  totalSuffix: " / {count} total",
  missingSuffix: " ({count} missing)",
  more: "More",
  loadMore: "Load more",
};
