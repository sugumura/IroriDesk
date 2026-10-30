# Roadmap

English | [日本語](docs/ROADMAP.ja.md)

What is planned for Irori Desk, roughly in order. Plans change with feedback: open an [issue](https://github.com/sugumura/IroriDesk/issues) if you need something that is not here, or want something sooner.

Irori Desk stays **read-only** for Firestore and Firebase Authentication. Features that write (for example, to the Emulator) will only be added as a separate, clearly marked step.

## Next

- **winget**: install on Windows with `winget install sugumura.IroriDesk`.
- **Better queries**
  - `OR` conditions.
  - Load more results (cursor paging).
  - Sum and average aggregations.
  - Query Explain: show the index used and the number of reads (cost) for a query.

## Later

- **Compare environments**: show the differences between the same documents or collections in two connections (for example, production and staging).
- **Copy to the Emulator**: copy selected documents from a project into the local Firebase Emulator for debugging. Only the Emulator is written to.
- **Field statistics**: types, value frequencies and missing fields across a collection, in the app (the MCP server already has `describe_collection`).
- **Security rules**: view the rules, and check whether a user (UID) can read a document.
- **Saved queries**: name and save queries, and export them to share with your team.

## Ideas

Not decided yet; feedback welcome.

- Scripting: process query results with JavaScript (read-only).
- Cloud Storage browsing.
- More for AI agents: MCP resources and prompts.
- Linux builds.
- Export and import settings (connections and saved queries).
- Editing data. This conflicts with being read-only, so it would start with the Emulator only, if at all.
