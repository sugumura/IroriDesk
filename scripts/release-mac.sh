#!/usr/bin/env bash
# 署名・公証付きの macOS 版（Apple Silicon + Intel の Universal）をビルドする
# 使い方: ./scripts/release-mac.sh   （事前に .env.signing を用意する。.env.signing.example を参照）
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.signing ]]; then
  echo ".env.signing がありません。.env.signing.example をコピーして値を入れてください。" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.signing
set +a

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "APPLE_SIGNING_IDENTITY が未設定です。" >&2
  exit 1
fi
if ! security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY"; then
  echo "キーチェーンに証明書が見つかりません: $APPLE_SIGNING_IDENTITY" >&2
  echo "security find-identity -v -p codesigning で名前を確認してください。" >&2
  exit 1
fi

# 公証の認証情報（API キーか Apple ID のどちらか）。空の変数は渡さない（Tauri が誤って使わないように）
if [[ -n "${APPLE_API_KEY:-}" ]]; then
  if [[ -z "${APPLE_API_ISSUER:-}" || -z "${APPLE_API_KEY_PATH:-}" ]]; then
    echo "API キーを使う場合は APPLE_API_ISSUER と APPLE_API_KEY_PATH も設定してください。" >&2
    exit 1
  fi
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  unset APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
else
  echo "公証の認証情報がありません（API キー、または APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID）。" >&2
  exit 1
fi

# Intel 向けのターゲットがなければ追加する
for t in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -qx "$t" || rustup target add "$t"
done

# Tauri が署名 → 公証 → チケットの添付まで行う
pnpm tauri build --target universal-apple-darwin --bundles app,dmg

BUNDLE=src-tauri/target/universal-apple-darwin/release/bundle
APP="$BUNDLE/macos/Irori Desk.app"
DMG=$(ls "$BUNDLE"/dmg/*.dmg | head -n 1)

echo "--- 確認"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=2 "$APP"
xcrun stapler validate "$APP"
echo "配布用: $DMG"
