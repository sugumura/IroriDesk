import { useState } from "react";
import {
  type AppError,
  type ConnectionConfig,
  listCollectionIds,
  toAppError,
} from "./lib/api";
import "./App.css";

// スパイク用の最小画面。接続管理・ツリー・一覧はステップ3で作り直す
const initialConnection: ConnectionConfig = {
  id: "spike",
  name: "spike",
  projectId: "demo-firestore-viewer",
  databaseId: "(default)",
  quotaProject: "",
  readOnly: true,
  kind: "emulator",
  emulatorHost: "localhost:8080",
};

function App() {
  const [conn, setConn] = useState<ConnectionConfig>(initialConnection);
  const [parentPath, setParentPath] = useState("");
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) =>
    setConn((c) => ({ ...c, [key]: value }));

  async function run(path: string) {
    setLoading(true);
    setError(null);
    setIds(null);
    try {
      setIds(await listCollectionIds(conn, path || undefined));
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Firestore Viewer — spike</h1>

      <fieldset>
        <legend>接続</legend>
        <label>
          種別
          <select
            value={conn.kind}
            onChange={(e) => update("kind", e.target.value as ConnectionConfig["kind"])}
          >
            <option value="emulator">Emulator</option>
            <option value="production">本番 (ADC)</option>
          </select>
        </label>
        <label>
          プロジェクトID
          <input value={conn.projectId} onChange={(e) => update("projectId", e.target.value)} />
        </label>
        <label>
          データベースID
          <input value={conn.databaseId} onChange={(e) => update("databaseId", e.target.value)} />
        </label>
        {conn.kind === "emulator" ? (
          <label>
            Emulator ホスト
            <input
              value={conn.emulatorHost}
              onChange={(e) => update("emulatorHost", e.target.value)}
            />
          </label>
        ) : (
          <label>
            quota project（任意）
            <input
              value={conn.quotaProject}
              onChange={(e) => update("quotaProject", e.target.value)}
            />
          </label>
        )}
        <button disabled={loading} onClick={() => run("")}>
          接続テスト（ルートコレクション取得）
        </button>
      </fieldset>

      <fieldset>
        <legend>サブコレクション</legend>
        <label>
          ドキュメントパス
          <input
            placeholder="users/alice"
            value={parentPath}
            onChange={(e) => setParentPath(e.target.value)}
          />
        </label>
        <button disabled={loading || !parentPath} onClick={() => run(parentPath)}>
          取得
        </button>
      </fieldset>

      {loading && <p>読み込み中…</p>}
      {error && (
        <div className="error">
          <strong>[{error.code}]</strong> {error.message}
          {error.detail && <pre>{error.detail}</pre>}
        </div>
      )}
      {ids && (
        <div>
          <p>{ids.length} 件</p>
          <ul>
            {ids.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

export default App;
