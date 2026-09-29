# Code signing policy

This page describes how the Irori Desk binaries published on [GitHub Releases](https://github.com/sugumura/IroriDesk/releases) are built and signed.

## Windows

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

> **Status:** Windows code signing through the SignPath Foundation is being set up. Until it is active, the Windows installers (`.exe` / `.msi`) are **not signed**, and Windows SmartScreen may show "Windows protected your PC" (click **More info → Run anyway**).

- Signed files: the application executable and the installers (`IroriDesk_<version>_x64-setup.exe`, `IroriDesk_<version>_x64.msi`).
- The binaries are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) from a tagged commit of this public repository. Nothing is built or signed on a personal machine.
- Every signing request is approved manually by an approver (below) after checking that it comes from a release tag of this repository.

## macOS

The macOS app (`IroriDesk_<version>_universal.dmg`) is signed with the maintainer's Apple Developer ID and notarized by Apple, also by the same GitHub Actions workflow.

## Team roles

| Role | Members |
|---|---|
| Committers and reviewers | [@sugumura](https://github.com/sugumura) |
| Approvers | [@sugumura](https://github.com/sugumura) |

Changes from people who are not committers are merged only after review through a pull request. All team members use multi-factor authentication for GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user.

Irori Desk has no telemetry, analytics, or crash reporting. It connects only to the endpoints the user configures: Google Cloud APIs (Cloud Firestore, Firebase Authentication / Identity Toolkit) for the user's own projects, or a local Firebase Emulator. Access tokens are obtained from the user's own Google credentials (Application Default Credentials or the gcloud CLI) and are kept in memory only. Settings are stored locally on the user's computer.

## Uninstalling

- Windows: uninstall from **Settings → Apps → Installed apps** (or "Add or remove programs").
- macOS: move **Irori Desk.app** to the Trash. Settings are stored in `~/Library/Application Support/dev.sugumura.iroridesk/`.
