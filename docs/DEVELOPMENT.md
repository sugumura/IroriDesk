# Developing Irori Desk

English | [日本語](DEVELOPMENT.ja.md)

How to build, test and release Irori Desk (Tauri 2 + React + Rust). For using the app, see the [README](../README.md).

## Requirements

| Tool | Used for | Notes |
|---|---|---|
| Node.js 24 / pnpm 10 | Frontend | |
| Rust (stable) | Backend | Install with `rustup` |
| Xcode Command Line Tools (macOS) | Build | You may need `sudo xcodebuild -license accept` once |
| Google Cloud SDK (gcloud) | Production connections | |
| Java 21+ | Firebase Emulator | See `.sdkmanrc` |

For Windows / Linux, see the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

## Getting started

```bash
pnpm install
pnpm tauri dev
```

## Emulator and test data

```bash
sdk env            # switch to Java 21 (if you use sdkman)
pnpm emulator      # Firestore (8080) and Authentication (9099)
pnpm seed          # load test data (128 documents, 33 users)
```

The "Emulator (demo)" connection that the app creates on first launch uses the project ID `demo-firestore-viewer`, which is where `pnpm seed` writes. The test data includes nested maps, arrays, Timestamps, References, GeoPoints, bytes, integers outside the safe range, NaN, keys starting with `$`, missing parent documents, subcollections, and 120 documents for paging.

You can load the same Firestore test data into a production project as well (existing documents are never overwritten; Authentication users are not created):

```bash
pnpm seed --project <projectId>
```

## Tests

```bash
pnpm test                                         # frontend (vitest)
pnpm typecheck
cd src-tauri && cargo test                        # Rust
cd src-tauri && cargo test -- --include-ignored   # also run Emulator integration tests (needs pnpm emulator and pnpm seed)
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push to `main` and on pull requests.

## Display JSON

Firestore values are converted to "display JSON" in Rust (`src-tauri/src/firestore/value.rs`): types that JSON can't express are wrapped in single-key objects (`$int`, `$double`, `$timestamp`, `$bytes`, `$ref`, `$geo`), map keys that start with `$` get one more `$`, and timestamps are normalized to RFC 3339 UTC with microseconds. Export, copy and the MCP server use the same format.

## Releasing

1. Move the entries under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md) to a new `## [x.y.z] - YYYY-MM-DD` section, and update the links at the bottom. The release notes and the update notes in the app come from this section; the build fails if it is missing.
2. Bump `version` in `src-tauri/tauri.conf.json`, `package.json` and `src-tauri/Cargo.toml`, and commit.
3. Push a tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions (`.github/workflows/release.yml`) then:

- checks that the tag matches `version` in `tauri.conf.json`, and that the CHANGELOG section and the updater keys exist;
- builds macOS (universal, signed and notarized) and Windows (x64) and uploads them to a draft release;
- in the `publish` job, trims the update notes in `latest.json` to the CHANGELOG section, checks that macOS and Windows are present with signatures, and publishes the release.

Tags with a hyphen (for example `v0.8.0-rc.1`) stay as drafts so you can check them and publish by hand. Linux builds are not distributed yet (commented out in the build matrix); you can still build them locally.

### Repository secrets

Settings → Secrets and variables → Actions.

**macOS signing and notarization**

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | The Developer ID Application certificate and private key exported as `.p12`, base64-encoded |
| `APPLE_CERTIFICATE_PASSWORD` | The password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_API_ISSUER` | App Store Connect API Issuer ID |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_PRIVATE_KEY` | Contents of `AuthKey_<KEYID>.p8` |
| `KEYCHAIN_PASSWORD` | Password for the temporary keychain created in CI (any string) |

Export the `.p12` from Keychain Access (right-click the certificate under **My Certificates** → **Export**), then copy it with `base64 -i certificate.p12 | pbcopy`.

**Windows signing** (optional; without these, the Windows build is not signed)

Signing uses an SSL.com code signing certificate with eSigner cloud signing. Tauri calls [`scripts/sign-windows.ps1`](../scripts/sign-windows.ps1) for every file it signs (7 eSigner signings per release, for the app, the installer and the NSIS plugin DLLs; to keep this low, the Windows build makes only the NSIS installer). See [CODE_SIGNING.md](../CODE_SIGNING.md) for the policy.

| Secret | Value |
|---|---|
| `ES_USERNAME` | SSL.com account username |
| `ES_PASSWORD` | SSL.com account password |
| `ES_CREDENTIAL_ID` | eSigner credential ID of the code signing certificate |
| `ES_TOTP_SECRET` | eSigner TOTP secret (the "secret code" shown below the QR code on the certificate order page. Not the `secret=` value inside the QR code, which CodeSignTool rejects with "The OTP is invalid") |

**Auto-update**

Update files are signed with a separate updater key, and the app only installs files signed with it. To create one:

```bash
pnpm tauri signer generate -w ~/.tauri/irori-desk.key
```

1. Put the printed public key in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
2. Add the secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of `~/.tauri/irori-desk.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. **Back up the private key.** Without it, installed apps can no longer receive updates.

### Local release builds

Unsigned, for your own Mac:

```bash
pnpm tauri build
```

The `.app` and `.dmg` are created under `src-tauri/target/release/bundle/`. Building the `.dmg` controls Finder, so allow the **Automation** permission if macOS asks. Release builds also sign the update files, so set `TAURI_SIGNING_PRIVATE_KEY_PATH` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Signed and notarized:

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) (US$99/year).
2. Create a **Developer ID Application** certificate and add it to your keychain. Check its name with `security find-identity -v -p codesigning`.
3. Prepare notarization credentials (an App Store Connect API key, or an Apple ID with an app-specific password).
4. Copy `.env.signing.example` to `.env.signing` and fill it in (`.env.signing` and `*.p8` are git-ignored).
5. Run:

```bash
./scripts/release-mac.sh
```

It builds a universal binary, signs, notarizes and staples it, then verifies it with `codesign` / `spctl` / `stapler`. Output goes to `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`.

### Homebrew tap

The cask lives in [sugumura/homebrew-tap](https://github.com/sugumura/homebrew-tap) (`Casks/irori-desk.rb`). The app updates itself (`auto_updates true`), so the cask only needs to be bumped now and then: update `version` and `sha256` (`shasum -a 256 IroriDesk_<version>_universal.dmg`), then check it with `brew style sugumura/tap` and `brew audit --cask --online sugumura/tap/irori-desk`.

## Third-party licenses

`src-tauri/THIRD_PARTY_LICENSES.txt` lists the licenses of the npm packages and Rust crates that end up in the app. It is bundled with the app and regenerated before every release build. To update it by hand:

```bash
pnpm notices
```

## Icon

The source is `assets/icon.svg`. After editing it, regenerate every size (mobile icons are removed automatically):

```bash
pnpm icons
```

## Project layout

```
src/                    React (UI)
  components/           UI components
  lib/                  API calls, display conversion, export, columns, updates, …
  i18n/                 English / Japanese messages (per feature under messages/)
  store.ts              App state (zustand)
src-tauri/src/          Rust
  firestore/            Firestore REST client, value conversion (value.rs), query building, indexes
  firebase_auth.rs      Firebase Authentication (Identity Toolkit)
  auth.rs / gcloud.rs   Tokens from ADC / gcloud accounts
  mcp/                  MCP server for AI agents (irori-desk mcp)
  export.rs             Save dialog and file writing
scripts/                Test data, release notes, license notices, macOS release build, Windows signing
docs/                   Japanese README, development guide, MCP design, screenshots
```
