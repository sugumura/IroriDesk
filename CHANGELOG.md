# Changelog

All notable changes to Irori Desk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/sugumura/IroriDesk/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/sugumura/IroriDesk/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/sugumura/IroriDesk/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/sugumura/IroriDesk/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/sugumura/IroriDesk/releases/tag/v0.2.0
