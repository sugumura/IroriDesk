// Firestore Emulator にテストデータを投入する（アプリ本体は書き込みを行わない）
// 使い方: pnpm seed   （Emulator を起動しておくこと）
const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const PROJECT = process.env.PROJECT_ID ?? "demo-firestore-viewer";
const DB = `projects/${PROJECT}/databases/(default)`;
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
}));

const res = await fetch(`http://${HOST}/v1/${DB}/documents:commit`, {
  method: "POST",
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ writes }),
});
if (!res.ok) {
  console.error(res.status, await res.text());
  process.exit(1);
}
console.log(`seeded ${writes.length} documents into ${PROJECT} @ ${HOST}`);
