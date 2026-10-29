# Irori Desk の開発

[English](DEVELOPMENT.md) | 日本語

Irori Desk（Tauri 2 + React + Rust）のビルド・テスト・リリースの方法です。アプリの使い方は [README](README.ja.md) を参照してください。

## 必要なもの

| ツール | 用途 | 備考 |
|---|---|---|
| Node.js 24 / pnpm 10 | フロントエンド | |
| Rust（stable） | バックエンド | `rustup` で導入 |
| Xcode Command Line Tools（macOS） | ビルド | 初回は `sudo xcodebuild -license accept` が必要な場合あり |
| Google Cloud SDK（gcloud） | 本番接続 | |
| Java 21 以上 | Firebase Emulator | `.sdkmanrc` あり |

Windows / Linux の前提は [Tauri の Prerequisites](https://tauri.app/start/prerequisites/) を参照してください。

## セットアップと起動

```bash
pnpm install
pnpm tauri dev
```

## Emulator とテストデータ

```bash
sdk env            # Java 21 に切り替え（sdkman を使う場合）
pnpm emulator      # Firestore（8080）と Authentication（9099）
pnpm seed          # テストデータ（ドキュメント128件、ユーザー33人）を投入
```

アプリの初回起動時に作られる「Emulator (demo)」接続は、プロジェクト ID `demo-firestore-viewer` を使います（`pnpm seed` の投入先）。テストデータには、ネストした map・配列・Timestamp・Reference・GeoPoint・bytes・安全範囲外の整数・NaN・`$` で始まるキー・実体のない親ドキュメント・サブコレクション・ページング用の120件が含まれます。

本番プロジェクトにも同じ Firestore のテストデータを入れられます（既存のドキュメントは上書きしません。Authentication のユーザーは投入しません）。

```bash
pnpm seed --project <projectId>
```

## テスト

```bash
pnpm test                                         # フロントエンド（vitest）
pnpm typecheck
cd src-tauri && cargo test                        # Rust
cd src-tauri && cargo test -- --include-ignored   # Emulator を使う結合テストも含める（pnpm emulator と pnpm seed が必要）
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

CI（`.github/workflows/ci.yml`）は、`main` への push と Pull Request のたびに同じチェックを行います。

## 表示用 JSON

Firestore の値は、Rust 側（`src-tauri/src/firestore/value.rs`）で「表示用 JSON」に変換します。JSON で表せない型はキーが1つのオブジェクト（`$int`、`$double`、`$timestamp`、`$bytes`、`$ref`、`$geo`）で包み、`$` で始まる map のキーには `$` を1つ足し、Timestamp はマイクロ秒までの RFC 3339（UTC）にそろえます。エクスポート、コピー、MCP サーバーも同じ形式を使います。

## リリース

1. [CHANGELOG.md](../CHANGELOG.md) の **Unreleased** にある項目を、新しい `## [x.y.z] - YYYY-MM-DD` の節に移し、末尾のリンクも更新する。リリースノートとアプリ内の更新内容はこの節から作られ、節が無いとビルドは失敗します
2. `src-tauri/tauri.conf.json`・`package.json`・`src-tauri/Cargo.toml` の `version` を上げてコミットする
3. タグを push する

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions（`.github/workflows/release.yml`）が次のことを行います。

- タグと `tauri.conf.json` の `version` が一致するか、CHANGELOG の節と自動アップデートの鍵があるかを確かめる
- macOS（Universal、署名・公証付き）と Windows（x64）をビルドし、下書きのリリースにアップロードする
- `publish` ジョブで、`latest.json` の更新内容を CHANGELOG の節だけにし、macOS と Windows の署名付きの更新情報がそろっているかを確かめてから、リリースを公開する

`v0.8.0-rc.1` のように `-` を含むタグは下書きのまま残るので、確認してから手動で公開します。Linux 版はまだ配布していません（ビルド対象ではコメントにしています）。手元ではビルドできます。

### リポジトリの Secrets

Settings → Secrets and variables → Actions に登録します。

**macOS の署名・公証**

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

**Windows の署名**（任意。登録しなければ Windows 版は署名なしでビルドされます）

SSL.com のコード署名証明書とクラウド署名（eSigner）を使います。Tauri が署名するファイルごとに [`scripts/sign-windows.ps1`](../scripts/sign-windows.ps1) を呼び出します（1回のリリースで eSigner の署名を7回使います。アプリ本体、インストーラー、NSIS のプラグインの DLL に署名するためです。署名の回数を抑えるため、Windows は NSIS のインストーラーだけを作ります）。方針は [CODE_SIGNING.md](../CODE_SIGNING.md) を参照してください。

| Secret | 値 |
|---|---|
| `ES_USERNAME` | SSL.com のユーザー名 |
| `ES_PASSWORD` | SSL.com のパスワード |
| `ES_CREDENTIAL_ID` | コード署名証明書の eSigner の Credential ID |
| `ES_TOTP_SECRET` | eSigner の TOTP シークレット（証明書の注文ページで QR コードの下に表示される「secret code」。QR コードの中の `secret=` の値ではない。そちらを使うと CodeSignTool は "The OTP is invalid" で失敗する） |

**自動アップデート**

更新ファイルは専用の鍵で署名し、アプリはその鍵で署名されたファイルだけをインストールします。鍵の作り方:

```bash
pnpm tauri signer generate -w ~/.tauri/irori-desk.key
```

1. 表示された公開鍵を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に入れる
2. Secrets に `TAURI_SIGNING_PRIVATE_KEY`（`~/.tauri/irori-desk.key` の中身）と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を登録する
3. **秘密鍵は必ずバックアップする。** 失くすと、インストール済みのアプリにアップデートを届けられなくなります

### 手元でのリリースビルド

署名なし（自分の Mac で使う場合）:

```bash
pnpm tauri build
```

`src-tauri/target/release/bundle/` に `.app` と `.dmg` ができます。`.dmg` の作成時に Finder を操作するため、「オートメーション」の許可を求められたら許可してください。リリースビルドでは更新ファイルにも署名するので、`TAURI_SIGNING_PRIVATE_KEY_PATH` と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を設定してください。

署名・公証付き:

1. [Apple Developer Program](https://developer.apple.com/programs/) に登録する（年額 99 米ドル）
2. 「Developer ID Application」証明書を作成し、キーチェーンに入れる。名前は `security find-identity -v -p codesigning` で確認できます
3. 公証の認証情報を用意する（App Store Connect の API キー、または Apple ID と App 用パスワード）
4. `.env.signing.example` を `.env.signing` にコピーして値を入れる（`.env.signing` と `*.p8` は git 管理外）
5. 実行する

```bash
./scripts/release-mac.sh
```

Universal バイナリを作り、署名・公証・チケットの添付まで行ったうえで、`codesign` / `spctl` / `stapler` で確認します。成果物は `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` にできます。

### Homebrew の tap

cask は [sugumura/homebrew-tap](https://github.com/sugumura/homebrew-tap) の `Casks/irori-desk.rb` にあります。アプリが自分で更新するため（`auto_updates true`）、ときどき更新すれば十分です。`version` と `sha256`（`shasum -a 256 IroriDesk_<version>_universal.dmg`）を書き換え、`brew style sugumura/tap` と `brew audit --cask --online sugumura/tap/irori-desk` で確認します。

## サードパーティのライセンス

`src-tauri/THIRD_PARTY_LICENSES.txt` に、アプリに含まれる npm パッケージと Rust クレートのライセンスをまとめています。アプリに同梱し、リリースビルドの前に自動で作り直します。手動で更新する場合:

```bash
pnpm notices
```

## アイコン

元データは `assets/icon.svg` です。編集したら次のコマンドで全サイズを作り直します（モバイル向けの画像は自動で削除されます）。

```bash
pnpm icons
```

## 構成

```
src/                    React（画面）
  components/           画面の部品
  lib/                  API 呼び出し、表示用の変換、エクスポート、列設定、アップデートなど
  i18n/                 日本語・英語の辞書（messages/ に機能ごと）
  store.ts              アプリの状態（zustand）
src-tauri/src/          Rust
  firestore/            Firestore REST クライアント、型変換（value.rs）、クエリ組み立て、インデックス
  firebase_auth.rs      Firebase Authentication（Identity Toolkit）
  auth.rs / gcloud.rs   ADC / gcloud アカウントのトークン
  mcp/                  AI エージェント向けの MCP サーバー（irori-desk mcp）
  export.rs             保存ダイアログとファイル書き込み
scripts/                テストデータ、リリースノート、ライセンス一覧、macOS のリリースビルド、Windows の署名
docs/                   日本語の README、開発ガイド、MCP の設計、スクリーンショット
```
