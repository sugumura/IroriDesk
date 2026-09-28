// Firestore にテストデータを投入する（アプリ本体は書き込みを行わない）
//
// Emulator:  pnpm seed                       （Emulator を起動しておくこと）
// 本番:      pnpm seed --project <projectId> [--database <dbId>] [--quota-project <id>]
//            ADC（gcloud auth application-default login）の認証で書き込む。
//            既存のドキュメントは上書きしない（同じパスがあれば全体が失敗する）
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    database: { type: "string", default: "(default)" },
    "quota-project": { type: "string" },
  },
});

const PROD = args.project !== undefined;
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const PROJECT = args.project ?? process.env.PROJECT_ID ?? "demo-firestore-viewer";
const DB = `projects/${PROJECT}/databases/${PROD ? args.database : "(default)"}`;
const DOCS = `${DB}/documents`;

const v = {
  str: (s) => ({ stringValue: s }),
  int: (n) => ({ integerValue: String(n) }),
  dbl: (n) => ({ doubleValue: n }),
  bool: (b) => ({ booleanValue: b }),
  nul: () => ({ nullValue: null }),
  ts: (iso) => ({ timestampValue: iso }),
  bytes: (b64) => ({ bytesValue: b64 }),
  ref: (path) => ({ referenceValue: `${DOCS}/${path}` }),
  geo: (lat, lng) => ({ geoPointValue: { latitude: lat, longitude: lng } }),
  arr: (...values) => ({ arrayValue: { values } }),
  map: (fields) => ({ mapValue: { fields } }),
};

const docs = {
  "users/alice": {
    name: v.str("Alice"),
    age: v.int(30),
    score: v.dbl(92.5),
    ratio: v.dbl(1.0),
    active: v.bool(true),
    nickname: v.nul(),
    createdAt: v.ts("2026-01-01T09:00:00.123456Z"),
    avatar: v.bytes("iVBORw0KGgo="),
    bestFriend: v.ref("users/bob"),
    home: v.geo(35.681236, 139.767125),
    tags: v.arr(v.str("admin"), v.str("beta"), v.int(1)),
    profile: v.map({
      address: v.map({ city: v.str("Tokyo"), zip: v.str("100-0005") }),
      links: v.arr(v.map({ label: v.str("blog"), url: v.str("https://example.com") })),
    }),
    bigId: v.int("9007199254740993"),
    notANumber: v.dbl("NaN"),
    "$ref": v.str("ドルで始まるキー"),
  },
  "users/bob": {
    name: v.str("Bob"),
    age: v.int(25),
    active: v.bool(false),
    createdAt: v.ts("2026-02-15T00:00:00Z"),
    tags: v.arr(v.str("beta")),
  },
  "users/alice/orders/o1": {
    item: v.str("Keyboard"),
    price: v.int(12000),
    orderedAt: v.ts("2026-03-01T12:34:56Z"),
  },
  "users/alice/orders/o2": {
    item: v.str("Mouse"),
    price: v.int(4000),
    orderedAt: v.ts("2026-03-05T08:00:00Z"),
  },
  // 親ドキュメント ghost は作らない（実体のない親ドキュメントの確認用）
  "users/ghost/orders/o9": { item: v.str("Phantom") },
  "products/p1": { title: v.str("Keyboard"), stock: v.int(10) },
  "products/p2": { title: v.str("Mouse"), stock: v.int(0) },
  "products/p1/reviews/r1": { rating: v.int(5), body: v.str("最高") },
};

// ページング確認用に 120 件
for (let i = 0; i < 120; i++) {
  docs[`logs/log${String(i).padStart(3, "0")}`] = {
    seq: v.int(i),
    level: v.str(["info", "warn", "error"][i % 3]),
    at: v.ts(new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString()),
  };
}

const writes = Object.entries(docs).map(([path, fields]) => ({
  update: { name: `${DOCS}/${path}`, fields },
  // 本番では既存データを壊さないよう、存在しない場合のみ作成する
  ...(PROD ? { currentDocument: { exists: false } } : {}),
}));

function adcToken() {
  try {
    return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    console.error("ADC のアクセストークンを取得できません。gcloud auth application-default login を実行してください。");
    process.exit(1);
  }
}

const baseUrl = PROD ? "https://firestore.googleapis.com" : `http://${HOST}`;
const headers = {
  Authorization: `Bearer ${PROD ? adcToken() : "owner"}`,
  "Content-Type": "application/json",
  ...(args["quota-project"] ? { "x-goog-user-project": args["quota-project"] } : {}),
};

const res = await fetch(`${baseUrl}/v1/${DB}/documents:commit`, {
  method: "POST",
  headers,
  body: JSON.stringify({ writes }),
});
if (!res.ok) {
  const text = await res.text();
  console.error(res.status, text);
  if (PROD && text.includes("ALREADY_EXISTS")) {
    console.error("テストデータのパスにドキュメントがすでにあります。上書きはしません（全件未書き込み）。");
  }
  process.exit(1);
}
console.log(`seeded ${writes.length} documents into ${DB} @ ${PROD ? "production" : HOST}`);
