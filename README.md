# Irori Desk

English | [日本語](docs/README.ja.md)

A desktop app for browsing and querying Cloud Firestore and Firebase Authentication.
It is **read-only**: it never calls any API that writes to Firestore or Authentication, so it is safe to point at production.

![Browsing a collection with the document details panel](docs/images/browse.png)

<table>
  <tr>
    <td width="33%"><img src="docs/images/query.png" alt="Query with where / orderBy and the JSON view"></td>
    <td width="33%"><img src="docs/images/auth.png" alt="Firebase Authentication users and custom claims"></td>
    <td width="33%"><img src="docs/images/split.png" alt="Split view with two collections side by side"></td>
  </tr>
  <tr>
    <td align="center">Queries (dark theme)</td>
    <td align="center">Authentication users</td>
    <td align="center">Split view</td>
  </tr>
</table>

## Download

Get the latest version from [GitHub Releases](https://github.com/sugumura/IroriDesk/releases/latest). See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

| OS | File | Notes |
|---|---|---|
| macOS 11+ (Apple Silicon / Intel) | `IroriDesk_<version>_universal.dmg` | Signed and notarized |
| Windows 10 / 11 (x64) | `IroriDesk_<version>_x64-setup.exe` or `_x64.msi` | Not code-signed yet — see below |

On macOS you can also install it with [Homebrew](https://brew.sh):

```bash
brew install --cask sugumura/tap/irori-desk
```

The Windows installers are not signed yet (a code signing certificate is being issued, see [CODE_SIGNING.md](CODE_SIGNING.md)). If Windows SmartScreen shows "Windows protected your PC", click **More info → Run anyway**.

To connect to production projects you also need the [Google Cloud SDK (gcloud)](https://cloud.google.com/sdk/docs/install).

## Features

- **Browse**: collection tree that follows the path you are in (with sibling subcollections), document list with paging and virtual scrolling, document details as a tree or JSON, jumps to subcollections and referenced documents
- **Query**: `where` (AND), `orderBy` and `limit` on a collection or collection group, field name suggestions, a link to create a missing composite index, and per-connection history
- **Authentication**: user list, search by UID / email / phone number, and user details (providers, custom claims, …)
- **Indexes**: composite indexes and single-field exemptions per collection
- **Typed values**: timestamps, references, GeoPoints, bytes and large integers are shown with their types, and JSON stored as a string can be expanded as a tree
- **Copy and export**: select cells like a spreadsheet and copy as TSV or JSON, or export to JSON (keeps type information), CSV or TSV
- **AI agents (MCP)**: read-only access for Claude Code and other agents to the connections you allow, with approval for large reads
- **Connections**: production projects (your ADC, or a gcloud account per connection, with a connection status indicator) and the Firebase Emulator, including named databases
- **View**: pinned Doc ID column, column visibility and order, split view, light / dark theme, fonts and zoom, English / Japanese, command palette (⌘K / Ctrl+K)
- **Auto-update**: new versions are installed from inside the app

## Connecting to a production project

Open **Manage connections** (the server icon in the top bar), add a **Production (Google Cloud)** connection, enter the project ID, and choose how to sign in.

### Using ADC

One Google account for the whole machine:

```bash
gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform
```

- Without `--scopes`, gcloud also asks for a Cloud SQL scope, which Irori Desk doesn't need.
- After recreating ADC with a different account, press **Reload ADC** in Manage connections (no restart needed).

### Using a gcloud account

Each connection can use a different Google account. **Add account** in Manage connections opens your browser to sign in (it runs `gcloud auth login --no-activate`, so the active account of your gcloud CLI doesn't change).

If gcloud is installed somewhere Irori Desk doesn't find (for example with asdf, mise or Nix), set its location under **Settings → gcloud CLI** (the output of `which gcloud`, or `where gcloud` on Windows).

On Windows, Irori Desk needs the Windows version of the Google Cloud SDK; gcloud inside WSL can't be run from a Windows app. If you only use ADC, you can copy `~/.config/gcloud/application_default_credentials.json` from WSL to `%APPDATA%\gcloud\` and press **Reload ADC**.

### Connection status and signing in again

For production connections, the top bar shows whether authentication works. Click it to see the account, when the access token renews, and your last sign-in from the app. If your organization requires signing in again from time to time, or a sign-in expires, click **Sign in again** there (or in the error message).

### Notes

- Firebase Authentication needs a quota project when called with your own credentials, so the connection's project is used unless you set one.
- If Authentication isn't enabled for the project, you'll get `CONFIGURATION_NOT_FOUND`. Click **Get started** under Authentication in the Firebase console.
- For queries that need a composite index, the error includes a link to create it.
- Viewing indexes requires permission to list them (for example Owner or Datastore Index Admin). The Emulator doesn't support the index API.

## Using the Firebase Emulator

Add an **Emulator** connection in Manage connections with the project ID your emulator uses and its hosts (Firestore `127.0.0.1:8080` and Authentication `127.0.0.1:9099` by default). On first launch Irori Desk creates an "Emulator (demo)" connection for the project ID `demo-firestore-viewer`.

## Auto-update

A few seconds after it starts, Irori Desk checks GitHub Releases for a new version and offers to install it; the app restarts when the update is installed. You can check any time from **Settings → Update**, the command palette or **Irori Desk → Check for Updates…** on macOS, and turn off the startup check in Settings.

Updates are verified with a signature before they are installed. If you installed with Homebrew, `brew upgrade` leaves Irori Desk alone because it updates itself.

## AI agents (MCP)

AI agents such as Claude Code, Claude Desktop and Cursor can read your data through Irori Desk as an MCP server. It is read-only, like the app.

1. In **Manage connections**, turn on **AI agents** for the connections an agent may use (off by default).
2. Add the server to your agent. **Settings → AI agents** shows the commands with the right path, for example:

```bash
claude mcp add irori-desk -- "/Applications/Irori Desk.app/Contents/MacOS/irori-desk" mcp
```

Tools: `list_connections`, `list_collections`, `describe_collection` (field names, types and examples from a sample), `list_documents`, `get_document`, `run_query`, `count`, `list_indexes`, `list_auth_users` and `lookup_auth_user`.

- **Large reads ask you first.** When a call reads more documents than the thresholds in **Settings → AI agents** (300 per call, 2,000 per session by default), you are asked to approve it, in the agent if it supports MCP elicitation, or in an OS dialog. These are not limits.
- **Authentication data is masked** by default (`a***@example.com`). You can change this per connection. Personal data inside Firestore documents is not masked, so think before allowing a production connection.
- Every tool call is logged locally (`agent-log.jsonl`; open it from **Settings → AI agents**). Argument values are not logged.

More details are in [docs/MCP.md](docs/MCP.md) (in Japanese).

## Privacy

Irori Desk has no telemetry, analytics or crash reporting. It connects only to the Google Cloud APIs (Cloud Firestore, Firebase Authentication) of the projects you configure, or to a local Firebase Emulator, using your own Google credentials, plus GitHub to check for updates. Access tokens are kept in memory only. AI agents can only read the connections you allow.

Settings (connections, appearance, columns, query history) are stored on your computer in `settings.json` (macOS: `~/Library/Application Support/dev.sugumura.iroridesk/`, Windows: `%APPDATA%\dev.sugumura.iroridesk\`).

## Support

Irori Desk is free. If it saves you time, you can support its development:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/sugumura)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/sugumura)

## Contributing

Issues and pull requests are welcome. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) to build and test the app, and follow the [code of conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2026 sugumura

The licenses of the bundled third-party software are included in the app (**Settings → About**, or **Help → Third-Party Licenses** on macOS).

Irori Desk is an independent project and is not affiliated with, endorsed by, or sponsored by Google. Firebase, Cloud Firestore and Google Cloud are trademarks of Google LLC.
