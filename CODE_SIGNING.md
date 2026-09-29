# Code signing policy

This page describes how the Irori Desk binaries published on [GitHub Releases](https://github.com/sugumura/IroriDesk/releases) are built and signed.

All release binaries are built by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) from a tagged commit of this public repository. Nothing is built or signed on a personal machine.

## Windows

The application executable, the installers (`IroriDesk_<version>_x64-setup.exe`, `IroriDesk_<version>_x64.msi`) and the uninstaller are signed with an individual-validated (IV) code signing certificate issued by [SSL.com](https://www.ssl.com/) to the maintainer. The private key is kept in SSL.com's cloud signing service (eSigner) and never leaves it; the workflow signs each file through [`scripts/sign-windows.ps1`](scripts/sign-windows.ps1).

> **Status:** the certificate is being issued. Until then, the Windows installers are **not signed**, and Windows SmartScreen may show "Windows protected your PC" (click **More info → Run anyway**). SmartScreen can still show this warning for a while after signing starts, until the certificate builds up reputation.

To check a downloaded file, open its **Properties → Digital Signatures** tab, or run `Get-AuthenticodeSignature <file>` in PowerShell.

## macOS

The macOS app (`IroriDesk_<version>_universal.dmg`) is signed with the maintainer's Apple Developer ID and notarized by Apple.

## Credentials

The signing credentials are stored only as GitHub Actions secrets of this repository and are used only by the release workflow, which runs when a version tag is pushed. The maintainer's GitHub account uses two-factor authentication.
