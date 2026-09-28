# Firestore GUIクライアント（Tauri 2）MVP 実装依頼

## 背景と目的

- Firebase Firestore を閲覧・クエリするデスクトップGUIクライアントを自作したい。
- 現在は Firefoo（月額$9）を年に数回だけ使っており、その代替が目的。
- 利用者は自分（＋将来的に社内エンジニア数名）。Mac を主対象とし、Windows/Linux でも動けばよい。
- まずは閲覧・クエリ専用のMVPを作る。書き込み機能は第2段階とする。

## 技術スタック（決定事項）

- Tauri 2（Rust バックエンド）
- フロントエンド: React + TypeScript + Vite（UIライブラリは shadcn/ui か Mantine のどちらか軽い方を選んでよい）
- Firestore へのアクセス: Firestore REST API（v1）を Rust 側から reqwest で呼ぶ
  - Rust 用の公式SDKはないため、gRPC クレート（firestore-rs 等）は使わない
  - Node の firebase-admin をサイドカーにする構成も採らない
- 認証: `gcp_auth` クレートで ADC（`gcloud auth application-default login` で作成された認証情報）を読む
  - サービスアカウントキーのJSONファイルは MVP では扱わない
  - アクセストークンは Rust 側だけで保持する。フロントには渡さず、Tauri の invoke で結果だけを返す
  - ユーザーADCでは `x-goog-user-project` ヘッダーが必要な場合があるため、接続設定で quota project を任意指定できるようにする
- 設定の永続化: tauri-plugin-store

## MVP 機能仕様

### 1. 接続管理

- 接続を複数登録できる。項目は次のとおり。
  - 表示名
  - プロジェクトID
  - データベースID（既定値は `(default)`、名前付きDBも可）
  - quota project（任意）
  - 読み取り専用フラグ（既定値 ON。MVP では常に読み取りのみだが、第2段階の書き込み機能を見据えて今からデータを持たせる）
  - 接続種別: 本番 / Emulator
- Emulator 接続では、ホスト（既定 `localhost:8080`）を指定し、`Authorization: Bearer owner` で接続する。
- 接続テストボタンを用意し、ルートコレクション一覧が取得できるか確認する。
- 認証エラーの場合は、`gcloud auth application-default login` の実行を促すメッセージを出す。

### 2. 閲覧

- 左ペインにコレクションツリーを表示する。
  - ルート: `POST .../documents:listCollectionIds`
  - サブコレクション: ドキュメントパスに対して同じAPIを呼ぶ（遅延読み込み）
- 中央ペインにドキュメント一覧を表示する。
  - `GET .../documents/{collectionPath}` を `pageSize` と `pageToken` でページングする（既定50件、「さらに読み込む」ボタン）
  - テーブル表示では、取得したドキュメントのトップレベルのフィールド名の和集合を列にする。先頭列はドキュメントID
  - JSON 表示との切り替えを用意する
- 右ペイン（またはモーダル）にドキュメント詳細を表示する。
  - JSONツリー表示で、ネストした map/array を折りたためるようにする
  - ドキュメントパスとフィールド値をコピーできるようにする
  - サブコレクションへ移動するリンクを置く

### 3. クエリ

- 最初に対象を選ぶ: コレクション（パス指定）または collectionGroup（ID指定）
- フォームで次を組み立て、`runQuery` の structuredQuery に変換する。
  - where（複数条件は AND）。演算子は `==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any`
  - 値の型は string / integer / double / boolean / null / timestamp（ISO8601入力）から選ぶ
  - orderBy（複数可、asc/desc）
  - limit
- 結果は閲覧と同じテーブル/JSONビューで表示する。
- エラーの扱い
  - 複合インデックス不足のエラーには作成用URLが含まれるので、抽出してクリックできるリンクとして表示する（外部ブラウザで開く）
  - その他のAPIエラーは、ステータスとメッセージをそのまま表示する
- 直近のクエリ履歴を接続ごとに20件保存し、再実行できるようにする。

### 4. エクスポート

- 表示中の結果（閲覧またはクエリ）を JSON / CSV で保存する。
  - JSON: 後述の「表示用JSON」形式の配列（`__id` と `__path` を付ける）
  - CSV: テーブル表示の列構成に合わせる。ネストした値は JSON 文字列化する
- 保存先はネイティブのファイルダイアログで選ぶ（tauri-plugin-dialog）。

## 型変換（重要）

Firestore REST は型付きの Value を返すので、Rust 側で「表示用JSON」に変換するモジュールを独立して作り、ユニットテストを書くこと。

| Firestore Value | 表示用JSON |
|---|---|
| nullValue | null |
| booleanValue | bool |
| integerValue（文字列で返る int64） | 安全な整数範囲内なら number、範囲外なら `{"$int": "..."}` |
| doubleValue | number（NaN/Infinity は `{"$double": "NaN"}` など） |
| timestampValue | `{"$timestamp": "2026-01-01T00:00:00.000000Z"}` |
| stringValue | string |
| bytesValue | `{"$bytes": "<base64>"}` |
| referenceValue | `{"$ref": "projects/.../documents/col/doc"}` |
| geoPointValue | `{"$geo": {"lat": .., "lng": ..}}` |
| arrayValue | array（再帰） |
| mapValue | object（再帰） |

- UI では `$timestamp` を人が読める日時で表示し、`$ref` はクリックするとそのドキュメントを開けるようにする。
- 第2段階の書き込み機能のために、逆変換（表示用JSON から Value へ）も今のうちに実装し、ラウンドトリップのテストを書いておく。

## 非機能・品質

- 読み取り専用。MVP では Firestore への書き込み API を一切呼ばない。
- 大量ドキュメントのコレクションでも固まらないこと。テーブルは仮想スクロールにする。
- Rust 側の API クライアントはトレイトで抽象化し、Emulator と本番を同じコードパスで扱う。
- エラーは `thiserror` で型付けし、フロントには `{ code, message, detail }` の形で返す。
- ログ出力にアクセストークンを含めない。

## 画面構成

- 上部: 接続セレクタ、接続テスト、読み取り専用バッジ
- 左: コレクションツリー
- 中央: タブ（閲覧タブ / クエリタブを複数開ける）
- 右: ドキュメント詳細（開閉可）
- ダークモード対応（OS設定に追従）

## 進め方

1. スパイク: Tauri の雛形作成、ADC によるトークン取得、ルートコレクション一覧の表示までを最初に通して、動作を確認させてほしい。
2. 型変換モジュールとテスト
3. 閲覧機能（ツリー、一覧、詳細、ページング）
4. クエリビルダー
5. エクスポートとクエリ履歴
6. README（セットアップ手順、gcloud の前提、Emulator での動作確認手順）

各ステップの終わりで動作確認の方法を示し、次に進む前に報告すること。仕様に曖昧な点があれば、推測で進めずに質問すること。

## 受け入れ基準

- Emulator に投入したテストデータ（ネスト map、配列、Timestamp、Reference、GeoPoint、サブコレクションを含む）を正しく閲覧できる。
- 実プロジェクトに ADC で接続し、ルートコレクションとサブコレクションを辿れる。
- where + orderBy + limit のクエリが実行でき、インデックス不足時にはリンクが表示される。
- JSON / CSV のエクスポートができる。
- 型変換のユニットテストが通る。
- `cargo clippy` と `tsc --noEmit` で警告・エラーがない。

## 第2段階（今回は実装しない。設計上の考慮のみ）

- ドキュメントの作成・編集（JSONエディタ）・削除。読み取り専用フラグが OFF の接続でのみ有効にし、本番接続では確認ダイアログを出す。
- バッチ削除、JSON インポート
- サービスアカウントキーによる接続
- macOS の署名・Notarization（社内配布する場合）

## 決定事項（仕様確認での合意, 2026-09-28）

### 型変換
1. 整数値の double（例 `1.0`）は `{"$double": 1}` で包む。NaN/Infinity/-Infinity は `{"$double": "NaN"}` 等。
2. ユーザーデータ中の `$` で始まるキーは `$` を1つ追加してエスケープする（`$ref` → `$$ref`）。逆変換で1つ外す。ラッパーは「キーが1つだけの object」に限る。
3. `$timestamp` はマイクロ秒6桁の RFC3339 UTC（`...00.000000Z`）に正規化する。
4. エクスポートの `__id` / `__path` は実フィールドより優先し、衝突時は警告を出す。

### クエリ・閲覧
5. `in` / `not-in` / `array-contains-any` の値はカンマ区切りで入力し、要素型を1つ選ぶ。
6. `== null` / `!= null`（および NaN）は unaryFilter（`IS_NULL` / `IS_NOT_NULL` / `IS_NAN` / `IS_NOT_NAN`）に自動変換する。
7. 値の型に reference を追加し、`__name__`（ドキュメントID）での条件も指定できるようにする。
8. runQuery は MVP では limit のみ（カーソルによるページングは後回し）。
9. ドキュメント一覧は `showMissing=true` で取得し、実体のない親ドキュメントはグレー表示する。
10. ツリーはコレクションのみを表示する。サブコレクションはドキュメント詳細から展開・移動する。
11. エクスポートは読み込み済みの分のみ。
12. ツリーのクリックで現在のタブに開き、Cmd/Ctrl+クリックで新しいタブに開く。

### 技術補足
- URL はパスのセグメントごとにパーセントエンコードする。
- 外部URLは `tauri-plugin-opener` で開く。
- ADC はマシン全体で1アカウント（本番接続はすべて同じ gcloud アカウントを使う）。
- UI: shadcn/ui + Tailwind、TanStack Table + TanStack Virtual。JSON ツリーは自作する。
- Emulator には firebase CLI と Java が必要。

### 多言語化（2026-09-28）
- 画面とエラーメッセージを日本語・英語に対応。言語は設定で選ぶ（既定は OS の言語）。
- エラーの Display を言語ごとに切り替えるため、`thiserror` の derive をやめて手書きの実装にした（`{ code, message, detail }` の形は変更なし）。
