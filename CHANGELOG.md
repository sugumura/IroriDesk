# Changelog

All notable changes to Irori Desk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-10-15

### Added

- The collections panel shows the path you are in: the document you came through and its subcollections, so you can switch between sibling subcollections in one click (like the Firebase console).
- Subcollections in the document details are a vertical list with a count, a filter when there are many, and a button to query the same subcollection across all documents (collection group).
- **Connection status** in the top bar for production connections: whether authentication works, the account, when the access token renews, your last sign-in from this app and the last successful request, with **Sign in again** right there. Authentication errors also show a **Sign in again** button.

## [0.6.1] - 2026-10-15

### Fixed

- Connections that use a gcloud account no longer fail with authentication errors after a while. An access token from gcloud could be close to expiring but was reused for up to 45 minutes; now it is reused for at most 5 minutes, and when Google rejects a token the app gets a fresh one and retries once.

## [0.6.0] - 2026-10-14

### Added

- **Auto-update**: Irori Desk checks for a new version on startup and can download, install and restart in the app. Check manually from Settings, the command palette or **Irori Desk → Check for Updates…** on macOS, and turn off the startup check in **Settings → Update**. Versions before this one need to be updated by hand once.

## [0.5.0] - 2026-10-14

### Added

- Values that hold JSON stored as a string (for example `{"id":"…","rate":4}`) get a **JSON** badge in the document tree and can be expanded into a nested tree. The value itself stays a string, and the JSON view is unchanged. In tables, hovering over such a value shows the formatted JSON.

## [0.4.0] - 2026-10-14

### Added

- **AI agents (MCP)**: run `irori-desk mcp` to let Claude Code, Claude Desktop, Cursor and other agents read Firestore and Firebase Authentication through Irori Desk. Read-only, only for connections where you turn on **AI agents** (off by default), with approval when an agent reads many documents, masked Authentication data by default, and a local log. Setup commands are under **Settings → AI agents**. See [docs/MCP.md](docs/MCP.md).

- Select cells in tables like a spreadsheet: click, Shift+click or drag to select a range, move with the arrow keys (Shift to extend, Cmd/Ctrl + arrows to jump to the edge, Page Up / Page Down, Home / End), and press Esc to go back to a single cell.
- Cmd/Ctrl+A selects every loaded row (only the visible rows while filtering).
- Cmd/Ctrl+C copies the selection as TSV, which pastes straight into Excel or Google Sheets (a header row is added when more than one cell is selected). Cmd/Ctrl+Shift+C copies it as JSON with type information.

## [0.3.0] - 2026-09-30

### Added

- **Settings → gcloud CLI**: shows which gcloud is used and its version, and lets you set its location (type a path or browse). Leave it empty to find gcloud automatically.
- gcloud is now also found through your login shell, so installations managed by asdf, mise, Nix and similar tools work without extra setup.
- Windows release builds can be code-signed (SSL.com eSigner). Signing starts once the certificate is issued; see [CODE_SIGNING.md](CODE_SIGNING.md).

### Changed

- The Ko-fi / Buy Me a Coffee links were removed from the app (Settings, command palette and the Help menu). They remain in the README.
- The settings dialog scrolls when it is taller than the window.

### Fixed

- Windows: running gcloud no longer flashes a console window.
- Windows: choosing a gcloud inside WSL now shows a clear error (a Windows app can't run it).

## [0.2.2] - 2026-09-29

### Added

- Windows builds (x64 `.exe` installer and `.msi`) are published again. They are not code-signed yet, so Windows SmartScreen may show a warning.
- README: screenshots, download table, privacy notes, and the code signing policy ([CODE_SIGNING.md](CODE_SIGNING.md)) and code of conduct.

### Fixed

- The footer of query results no longer overlaps the Export and Columns buttons at the default window width.

## [0.2.1] - 2026-09-29

### Added

- Released under the MIT License.
- Third-party licenses are bundled with the app (Settings → About, or Help → Third-Party Licenses on macOS).
- Links to support the project (Ko-fi / Buy Me a Coffee).

### Changed

- Release file names no longer contain a space or dot (for example `IroriDesk_0.2.1_universal.dmg`).
- Releases are published for macOS only for now.

## [0.2.0] - 2026-09-29

First public release.

### Added

- Browse Cloud Firestore: collection tree, document list with paging and virtual scrolling, document details (tree / JSON), and jumps to subcollections and referenced documents.
- Queries: `where` (AND), `orderBy` and `limit` on a collection or collection group, with field name suggestions, a link to create a missing composite index, and per-connection history.
- Firebase Authentication: user list, search by UID / email / phone number, and user details.
- Composite indexes and single-field exemptions per collection.
- Export to JSON (keeps type information), CSV and TSV.
- Pinned Doc ID column, column visibility and order, split view, light / dark theme, fonts and zoom, English / Japanese.
- Connections to production projects (ADC or a gcloud account per connection) and the Firebase Emulator. Read-only: no API that writes data is ever called.
- Signed and notarized macOS build (Apple Silicon / Intel).

[Unreleased]: https://github.com/sugumura/IroriDesk/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/sugumura/IroriDesk/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/sugumura/IroriDesk/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/sugumura/IroriDesk/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/sugumura/IroriDesk/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/sugumura/IroriDesk/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sugumura/IroriDesk/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/sugumura/IroriDesk/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/sugumura/IroriDesk/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sugumura/IroriDesk/releases/tag/v0.2.0
