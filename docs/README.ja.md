# Irori Desk

[English](../README.md) | 日本語

Cloud Firestore と Firebase Authentication を閲覧・クエリするためのデスクトップアプリです（Tauri 2 + React）。
現在のバージョンは**読み取り専用**で、Firestore や Authentication に書き込む API は一切呼びません。

## 主な機能

- **閲覧**: コレクションツリー、ドキュメント一覧（ページング・仮想スクロール）、ドキュメント詳細（ツリー / JSON）、サブコレクション・参照先への移動
- **クエリ**: コレクション / collectionGroup を対象に where（AND）・orderBy・limit。フィールド名の候補表示、インデックス不足時の作成リンク、接続ごとの履歴（直近20件）
- **Authentication**: ユーザー一覧、UID / メール / 電話番号での検索、詳細（プロバイダ、カスタムクレームなど）
- **エクスポート**: JSON（型情報を保持）/ CSV / TSV
- **インデックス**: コレクションごとの複合インデックスと単一フィールドの例外設定を表示
- **表示**: Doc ID 列の固定、列の表示・並び替え、画面の分割（左右・上下）、ライト / ダーク / システム、フォント・表示サイズ、日本語 / 英語
- **接続**: 本番（ADC または gcloud のアカウントを接続ごとに選択）と Emulator

仕様と設計上の決定事項は [SPEC.md](SPEC.md) を参照してください。

## 開発の支援

Irori Desk は無料です。役に立ったら、寄付で開発を応援していただけるとうれしいです。

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/sugumura)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/sugumura)

アプリ内では**設定**、コマンドパレット（⌘K）、macOS の**ヘルプ**メニューから同じページを開けます。

## 必要なもの

| ツール | 用途 | 備考 |
|---|---|---|
| Node.js 24 / pnpm 10 | フロントエンド | |
| Rust（stable） | バックエンド | `rustup` で導入 |
| Xcode Command Line Tools（macOS） | ビルド | 初回は `sudo xcodebuild -license accept` が必要な場合あり |
| Google Cloud SDK（gcloud） | 本番接続の認証 | |
| Java 21 以上 | Firebase Emulator | 開発・動作確認時のみ。`.sdkmanrc` あり |

Windows / Linux の前提は [Tauri の Prerequisites](https://tauri.app/start/prerequisites/) を参照してください。

## セットアップと起動

```bash
pnpm install
pnpm tauri dev
```

## 本番プロジェクトへの接続

接続の管理（上部バーのサーバーアイコン）で「本番（Google Cloud）」の接続を追加し、アカウントを選びます。

### ADC を使う場合

マシン全体で1つのアカウントを使います。

```bash
gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform
```

- `--scopes` を省略すると Cloud SQL のスコープも要求されます（このアプリには不要）。
- ADC を別のアカウントで作り直したら、接続の管理の「ADC を再読み込み」を押します（再起動は不要）。

### gcloud のアカウントを使う場合

接続ごとに別のアカウントを使えます。接続の管理の「アカウントを追加」でブラウザが開き、Google にログインします（`gcloud auth login --no-activate` を実行。ターミナル側の gcloud の現在のアカウントは変わりません）。トークンの期限切れや組織の再認証ポリシーでエラーになったら「再ログイン」を押します。

### 注意

- アクセストークンは Rust 側のメモリにのみ保持し、画面や設定ファイルには渡しません。
- Firebase Authentication の API はユーザーの認証情報だと quota project が必要なため、未指定なら接続先のプロジェクトを使います（`x-goog-user-project`）。
- Authentication が未有効のプロジェクトでは `CONFIGURATION_NOT_FOUND` になります。Firebase コンソールの Authentication で「始める」を押してください。
- 複合インデックスが必要なクエリは、エラー内のリンクから作成できます。
- インデックス情報の表示には、インデックスを閲覧する権限（オーナー、Datastore インデックス管理者など）が必要です。Emulator はインデックスの API に対応していません。

## Emulator での動作確認

```bash
sdk env            # Java 21 に切り替え（sdkman を使う場合）
pnpm emulator      # Firestore（8080）と Authentication（9099）
pnpm seed          # テストデータ（ドキュメント128件、ユーザー33人）を投入
```

アプリの初回起動時に「Emulator (demo)」接続（プロジェクト ID `demo-firestore-viewer`）が作られます。
テストデータにはネストした map・配列・Timestamp・Reference・GeoPoint・bytes・安全範囲外の整数・NaN・`$` で始まるキー・実体のない親ドキュメント・サブコレクション・ページング用の120件が含まれます。

本番プロジェクトにも同じ Firestore のテストデータを入れられます（既存のドキュメントは上書きしません。Authentication のユーザーは投入しません）。

```bash
pnpm seed --project <projectId>
```

## テスト

```bash
pnpm test                                     # フロントエンド（vitest）
pnpm typecheck
cd src-tauri && cargo test                    # Rust
cd src-tauri && cargo test -- --include-ignored   # Emulator を使う結合テストも含める（pnpm emulator と pnpm seed が必要）
cd src-tauri && cargo clippy --all-targets
```

## リリースビルド

### 署名なし（自分の Mac で使う場合）

```bash
pnpm tauri build
```

`src-tauri/target/release/bundle/` に `.app` と `.dmg` ができます。
`.dmg` の作成時に Finder を操作するため、初回に「オートメーション」の許可を求められたら許可してください。

### 署名・公証付き（配布する場合）

配布したアプリがそのまま起動できるよう、Apple の Developer ID で署名し、公証（Notarization）します。

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録する（年額 99 米ドル）。
2. 「Developer ID Application」証明書を作成し、キーチェーンに入れる。名前は `security find-identity -v -p codesigning` で確認できます。
3. 公証の認証情報を用意する（App Store Connect の API キー、または Apple ID と App 用パスワード）。
4. `.env.signing.example` を `.env.signing` にコピーして値を入れる（`.env.signing` と `*.p8` は git 管理外）。
5. 実行する。

```bash
./scripts/release-mac.sh
```

Apple Silicon と Intel の Universal バイナリを作り、署名・公証・チケットの添付まで行ったうえで、`codesign` / `spctl` / `stapler` で確認します。成果物は `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` にできます。

Windows は署名しないと SmartScreen の警告が出ます（「詳細情報 → 実行」で起動可能）。

### GitHub Releases で配布する

`v0.2.0` のようなタグを push すると、GitHub Actions（`.github/workflows/release.yml`）が macOS（Universal、署名・公証付き）向けにビルドし、Releases に**下書き**として登録します。内容を確認して「Publish release」を押すと公開されます。

Windows / Linux 版はまだ配布していません（ワークフローのビルド対象ではコメントにしています）。手元では `pnpm tauri build` でビルドできます。

```bash
# src-tauri/tauri.conf.json の version を上げてコミットしてから
git tag v0.2.0
git push origin v0.2.0
```

タグと `tauri.conf.json` の `version` が一致しないとビルドは失敗します。

macOS の署名・公証には、リポジトリの Secrets（Settings → Secrets and variables → Actions）が必要です。

| Secret | 内容 |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application 証明書と秘密鍵を書き出した `.p12` を base64 にしたもの |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` を書き出したときのパスワード |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: 名前 (チームID)` |
| `APPLE_API_ISSUER` | App Store Connect API の Issuer ID |
| `APPLE_API_KEY` | App Store Connect API のキー ID |
| `APPLE_API_PRIVATE_KEY` | `AuthKey_キーID.p8` の中身 |
| `KEYCHAIN_PASSWORD` | CI で作る一時キーチェーンのパスワード（任意の文字列） |

`.p12` はキーチェーンアクセスで証明書を右クリック →「書き出す」で作成し、`base64 -i 証明書.p12 | pbcopy` でコピーできます。

## アイコン

元データは `assets/icon.svg` です。編集したら次のコマンドで全サイズを作り直します（モバイル向けの画像は自動で削除されます）。

```bash
pnpm icons
```

## 構成

```
src/                    React（画面）
  components/           画面の部品
  lib/                  API 呼び出し、表示用の変換、エクスポート、列設定、履歴など
  i18n/                 日本語・英語の辞書（messages/ に機能ごと）
  store.ts              アプリの状態（zustand）
src-tauri/src/          Rust
  firestore/            Firestore REST クライアント、型変換（value.rs）、クエリ組み立て、インデックス
  firebase_auth.rs      Firebase Authentication（Identity Toolkit）
  auth.rs / gcloud.rs   ADC / gcloud アカウントのトークン
  export.rs             保存ダイアログとファイル書き込み
scripts/                テストデータ投入、macOS のリリースビルド
docs/                   仕様と決定事項（SPEC.md）、日本語の README
```

設定（接続、表示、列、クエリ履歴）は OS のアプリデータ領域の `settings.json` に保存されます（macOS: `~/Library/Application Support/dev.sugumura.iroridesk/`）。

## ライセンス

[MIT](../LICENSE) © 2026 sugumura

同梱しているサードパーティ製ソフトウェアのライセンスは `src-tauri/THIRD_PARTY_LICENSES.txt` にまとめています。このファイルはアプリにも含まれ（設定 → 情報、macOS ではヘルプ → サードパーティのライセンス）、リリースビルドの前に自動で作り直されます。手動で更新する場合:

```bash
pnpm notices
```

Irori Desk は個人の独立したプロジェクトであり、Google による提携・承認・後援を受けたものではありません。Firebase、Cloud Firestore、Google Cloud は Google LLC の商標です。
