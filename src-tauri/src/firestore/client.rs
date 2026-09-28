use std::sync::Arc;
use std::time::Duration;

use reqwest::{Method, RequestBuilder, Response, Url};
use serde::Deserialize;
use serde_json::json;

use super::document::{DisplayDocument, DocumentPage, QueryResult, RestDocument};
use super::indexes::{
    CollectionIndexes, CompositeIndex, ListFieldsResponse, ListIndexesResponse, RestField,
};
use super::path::{collection_segments, document_segments};
use super::query::{self, QuerySpec};
use crate::auth::{EmulatorTokenSource, TokenSource};
use crate::connection::{ConnectionConfig, ConnectionKind};
use crate::error::{AppError, AppResult, ADC_LOGIN_HINT};

const PRODUCTION_BASE_URL: &str = "https://firestore.googleapis.com";
const LIST_COLLECTION_IDS_PAGE_SIZE: u32 = 300;
const MAX_LIST_DOCUMENTS_PAGE_SIZE: u32 = 300;

/// Firestore への読み取り操作。本番と Emulator は同じ実装（RestClient）で扱う
#[async_trait::async_trait]
pub trait FirestoreApi: Send + Sync {
    /// `parent_document` 直下のコレクションID一覧。空文字ならルートコレクション
    async fn list_collection_ids(&self, parent_document: &str) -> AppResult<Vec<String>>;

    /// ドキュメントを1件取得する。`path` は `users/alice` のような相対パス
    async fn get_document(&self, path: &str) -> AppResult<DisplayDocument>;

    /// コレクション直下のドキュメントを1ページ取得する。実体のない親ドキュメントも含む
    async fn list_documents(
        &self,
        collection_path: &str,
        page_size: u32,
        page_token: Option<&str>,
    ) -> AppResult<DocumentPage>;

    /// structuredQuery を実行する（MVP ではカーソルによるページングなし）
    async fn run_query(&self, spec: &QuerySpec) -> AppResult<QueryResult>;

    /// コレクションID（コレクショングループ）の複合インデックスと単一フィールドの例外設定
    async fn list_indexes(&self, collection_id: &str) -> AppResult<CollectionIndexes>;
}

pub struct RestClient {
    http: reqwest::Client,
    /// Emulator は管理用 API（インデックス）に対応していない
    is_emulator: bool,
    base_url: Url,
    project_id: String,
    database_id: String,
    quota_project: Option<String>,
    tokens: Arc<dyn TokenSource>,
}

pub fn build_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(60))
        .build()
        .expect("reqwest client の初期化に失敗しました")
}

impl RestClient {
    pub fn from_connection(
        conn: &ConnectionConfig,
        http: reqwest::Client,
        // 本番接続で使うトークンの取得元（ADC または gcloud のアカウント）
        production_tokens: Arc<dyn TokenSource>,
    ) -> AppResult<Self> {
        let project_id = conn.project_id.trim();
        if project_id.is_empty() {
            return Err(AppError::InvalidInput("プロジェクトIDが未入力です".into()));
        }
        let (base_url, tokens, quota_project): (String, Arc<dyn TokenSource>, _) = match conn.kind {
            ConnectionKind::Production => (
                PRODUCTION_BASE_URL.to_owned(),
                production_tokens,
                conn.quota_project().map(str::to_owned),
            ),
            ConnectionKind::Emulator => {
                let host = conn.emulator_host();
                let base = if host.contains("://") {
                    host.to_owned()
                } else {
                    format!("http://{host}")
                };
                (base, Arc::new(EmulatorTokenSource), None)
            }
        };
        let base_url = Url::parse(&base_url)
            .map_err(|e| AppError::InvalidInput(format!("接続先URLが不正です: {e}")))?;
        Ok(Self {
            http,
            is_emulator: conn.kind == ConnectionKind::Emulator,
            base_url,
            project_id: project_id.to_owned(),
            database_id: conn.database_id().to_owned(),
            quota_project,
            tokens,
        })
    }

    /// `v1/projects/{p}/databases/{db}/documents/{path...}{suffix}` を組み立てる。
    /// セグメントごとにパーセントエンコードされる
    fn documents_url(&self, segments: &[&str], suffix: &str) -> Url {
        let mut url = self.base_url.clone();
        {
            let mut segs = url.path_segments_mut().expect("base URL は http(s)");
            segs.clear().extend([
                "v1",
                "projects",
                &self.project_id,
                "databases",
                &self.database_id,
            ]);
            match segments.split_last() {
                None => {
                    segs.push(&format!("documents{suffix}"));
                }
                Some((last, rest)) => {
                    segs.push("documents")
                        .extend(rest)
                        .push(&format!("{last}{suffix}"));
                }
            }
        }
        url
    }

    /// `v1/projects/{p}/databases/{db}/{segments...}`（管理用 API）
    fn database_url(&self, segments: &[&str]) -> Url {
        let mut url = self.base_url.clone();
        url.path_segments_mut()
            .expect("base URL は http(s)")
            .clear()
            .extend([
                "v1",
                "projects",
                &self.project_id,
                "databases",
                &self.database_id,
            ])
            .extend(segments);
        url
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: Url) -> AppResult<T> {
        let res = self.request(Method::GET, url).await?.send().await?;
        Ok(check_status(res).await?.json().await?)
    }

    async fn request(&self, method: Method, url: Url) -> AppResult<RequestBuilder> {
        let token = self.tokens.bearer_token().await?;
        let mut req = self.http.request(method, url).bearer_auth(token);
        if let Some(qp) = &self.quota_project {
            req = req.header("x-goog-user-project", qp);
        }
        Ok(req)
    }
}

#[derive(Deserialize)]
struct GoogleErrorBody {
    error: GoogleError,
}

#[derive(Deserialize)]
struct GoogleError {
    #[serde(default)]
    message: String,
    #[serde(default)]
    status: String,
}

/// エラー本文から (status, message) を取り出す。
/// runQuery などのストリーミング系は `[{"error": {...}}]` の配列で返す
fn parse_error_body(text: String) -> (String, String) {
    // serde の構造体は配列からも位置指定で読めてしまうため、先頭の文字で分岐する
    let parsed = if text.trim_start().starts_with('[') {
        serde_json::from_str::<Vec<GoogleErrorBody>>(&text)
            .ok()
            .and_then(|v| v.into_iter().next())
    } else {
        serde_json::from_str::<GoogleErrorBody>(&text).ok()
    };
    match parsed {
        Some(b) => (b.error.status, b.error.message),
        None => (String::new(), text),
    }
}

/// 非2xxレスポンスを AppError に変換する（Firestore API）
pub(crate) async fn check_status(res: Response) -> AppResult<Response> {
    check_status_for(res, "Firestore").await
}

/// 非2xxレスポンスを AppError に変換する。service はエラーの見出しに使う
pub(crate) async fn check_status_for(res: Response, service: &'static str) -> AppResult<Response> {
    let http_status = res.status();
    if http_status.is_success() {
        return Ok(res);
    }
    let text = res.text().await.unwrap_or_default();
    let (status, message) = parse_error_body(text);
    if http_status.as_u16() == 401 || status == "UNAUTHENTICATED" {
        return Err(AppError::Auth {
            message: format!("認証に失敗しました。{ADC_LOGIN_HINT}"),
            detail: Some(message),
        });
    }
    Err(AppError::Api {
        service,
        http_status: http_status.as_u16(),
        status: if status.is_empty() {
            http_status.canonical_reason().unwrap_or("").to_owned()
        } else {
            status
        },
        message,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCollectionIdsResponse {
    #[serde(default)]
    collection_ids: Vec<String>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListDocumentsResponse {
    #[serde(default)]
    documents: Vec<RestDocument>,
    #[serde(default)]
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunQueryItem {
    document: Option<RestDocument>,
    read_time: Option<String>,
}

impl RestClient {
    fn documents_root(&self) -> String {
        format!(
            "projects/{}/databases/{}/documents",
            self.project_id, self.database_id
        )
    }
}

#[async_trait::async_trait]
impl FirestoreApi for RestClient {
    async fn list_collection_ids(&self, parent_document: &str) -> AppResult<Vec<String>> {
        let segments = document_segments(parent_document)?;
        let url = self.documents_url(&segments, ":listCollectionIds");
        let mut ids = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let mut body = json!({ "pageSize": LIST_COLLECTION_IDS_PAGE_SIZE });
            if let Some(t) = &page_token {
                body["pageToken"] = json!(t);
            }
            let res = self
                .request(Method::POST, url.clone())
                .await?
                .json(&body)
                .send()
                .await?;
            let page: ListCollectionIdsResponse = check_status(res).await?.json().await?;
            ids.extend(page.collection_ids);
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(t) => page_token = Some(t),
                None => break,
            }
        }
        ids.sort();
        Ok(ids)
    }

    async fn get_document(&self, path: &str) -> AppResult<DisplayDocument> {
        let segments = document_segments(path)?;
        if segments.is_empty() {
            return Err(AppError::InvalidInput("ドキュメントパスが空です".into()));
        }
        let url = self.documents_url(&segments, "");
        let res = self.request(Method::GET, url).await?.send().await?;
        let doc: RestDocument = check_status(res).await?.json().await?;
        DisplayDocument::from_rest(doc)
    }

    async fn list_documents(
        &self,
        collection_path: &str,
        page_size: u32,
        page_token: Option<&str>,
    ) -> AppResult<DocumentPage> {
        let segments = collection_segments(collection_path)?;
        let mut url = self.documents_url(&segments, "");
        {
            let mut q = url.query_pairs_mut();
            q.append_pair(
                "pageSize",
                &page_size.clamp(1, MAX_LIST_DOCUMENTS_PAGE_SIZE).to_string(),
            )
            .append_pair("showMissing", "true");
            if let Some(t) = page_token.filter(|t| !t.is_empty()) {
                q.append_pair("pageToken", t);
            }
        }
        let res = self.request(Method::GET, url).await?.send().await?;
        let page: ListDocumentsResponse = check_status(res).await?.json().await?;
        Ok(DocumentPage {
            documents: page
                .documents
                .into_iter()
                .map(DisplayDocument::from_rest)
                .collect::<AppResult<_>>()?,
            next_page_token: page.next_page_token.filter(|t| !t.is_empty()),
        })
    }

    async fn run_query(&self, spec: &QuerySpec) -> AppResult<QueryResult> {
        let built = query::build(spec, &self.documents_root())?;
        let parent: Vec<&str> = built.parent_segments.iter().map(String::as_str).collect();
        let url = self.documents_url(&parent, ":runQuery");
        let res = self
            .request(Method::POST, url)
            .await?
            .json(&built.body)
            .send()
            .await?;
        let items: Vec<RunQueryItem> = check_status(res).await?.json().await?;
        let mut documents = Vec::new();
        let mut read_time = None;
        for item in items {
            if let Some(doc) = item.document {
                documents.push(DisplayDocument::from_rest(doc)?);
            }
            if item.read_time.is_some() {
                read_time = item.read_time;
            }
        }
        Ok(QueryResult {
            documents,
            read_time,
            structured_query: built.body,
        })
    }

    async fn list_indexes(&self, collection_id: &str) -> AppResult<CollectionIndexes> {
        if self.is_emulator {
            return Err(AppError::InvalidInput(
                "Firestore Emulator はインデックスの API に対応していません".into(),
            ));
        }
        let cg = collection_id.trim();
        if cg.is_empty() || cg.contains('/') {
            return Err(AppError::InvalidInput(format!(
                "コレクションIDが不正です: {collection_id}"
            )));
        }

        let mut composite = Vec::new();
        let mut token: Option<String> = None;
        loop {
            let mut url = self.database_url(&["collectionGroups", cg, "indexes"]);
            if let Some(t) = &token {
                url.query_pairs_mut().append_pair("pageToken", t);
            }
            let page: ListIndexesResponse = self.get_json(url).await?;
            composite.extend(page.indexes.into_iter().map(CompositeIndex::from));
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(t) => token = Some(t),
                None => break,
            }
        }

        let mut field_overrides = Vec::new();
        let mut token: Option<String> = None;
        loop {
            let mut url = self.database_url(&["collectionGroups", cg, "fields"]);
            {
                let mut q = url.query_pairs_mut();
                // 例外設定（既定から変更したフィールド）だけを取得する
                q.append_pair("filter", "indexConfig.usesAncestorConfig:false");
                if let Some(t) = &token {
                    q.append_pair("pageToken", t);
                }
            }
            let page: ListFieldsResponse = self.get_json(url).await?;
            field_overrides.extend(page.fields.into_iter().filter_map(RestField::into_override));
            match page.next_page_token.filter(|t| !t.is_empty()) {
                Some(t) => token = Some(t),
                None => break,
            }
        }

        Ok(CollectionIndexes {
            collection_group: cg.to_owned(),
            composite,
            field_overrides,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(kind: ConnectionKind) -> RestClient {
        let conn = ConnectionConfig {
            id: "c".into(),
            name: "n".into(),
            project_id: "demo-proj".into(),
            database_id: None,
            quota_project: None,
            read_only: true,
            kind,
            emulator_host: None,
            auth_emulator_host: None,
            account: None,
        };
        RestClient::from_connection(
            &conn,
            reqwest::Client::new(),
            Arc::new(crate::auth::AdcTokenSource::default()),
        )
        .unwrap()
    }

    #[test]
    fn parses_object_and_array_error_bodies() {
        let index_msg = "The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/p/firestore/indexes?create_composite=abc";
        let array = json!([{ "error": { "code": 400, "message": index_msg, "status": "FAILED_PRECONDITION" } }]);
        assert_eq!(
            parse_error_body(array.to_string()),
            ("FAILED_PRECONDITION".to_owned(), index_msg.to_owned())
        );
        let object =
            json!({ "error": { "code": 403, "message": "denied", "status": "PERMISSION_DENIED" } });
        assert_eq!(
            parse_error_body(object.to_string()),
            ("PERMISSION_DENIED".to_owned(), "denied".to_owned())
        );
        assert_eq!(
            parse_error_body("oops".into()),
            (String::new(), "oops".to_owned())
        );
    }

    #[test]
    fn root_url() {
        let c = client(ConnectionKind::Production);
        assert_eq!(
            c.documents_url(&[], ":listCollectionIds").as_str(),
            "https://firestore.googleapis.com/v1/projects/demo-proj/databases/(default)/documents:listCollectionIds"
        );
    }

    #[test]
    fn nested_url_is_percent_encoded() {
        let c = client(ConnectionKind::Emulator);
        assert_eq!(
            c.documents_url(&["users", "山田 太郎%"], ":listCollectionIds").as_str(),
            "http://localhost:8080/v1/projects/demo-proj/databases/(default)/documents/users/%E5%B1%B1%E7%94%B0%20%E5%A4%AA%E9%83%8E%25:listCollectionIds"
        );
    }
}

/// Emulator を起動し `pnpm seed` 済みの状態で `cargo test -- --ignored` で実行する
#[cfg(test)]
mod emulator_tests {
    use super::*;

    fn emulator_client() -> RestClient {
        let conn = ConnectionConfig {
            id: "e".into(),
            name: "emulator".into(),
            project_id: "demo-firestore-viewer".into(),
            database_id: None,
            quota_project: None,
            read_only: true,
            kind: ConnectionKind::Emulator,
            emulator_host: Some(
                std::env::var("FIRESTORE_EMULATOR_HOST").unwrap_or("127.0.0.1:8080".into()),
            ),
            auth_emulator_host: None,
            account: None,
        };
        RestClient::from_connection(
            &conn,
            build_http_client(),
            Arc::new(crate::auth::AdcTokenSource::default()),
        )
        .unwrap()
    }

    #[tokio::test]
    #[ignore = "Firestore Emulator が必要"]
    async fn lists_root_and_sub_collections() {
        let c = emulator_client();
        assert_eq!(
            c.list_collection_ids("").await.unwrap(),
            vec!["logs", "products", "users"]
        );
        assert_eq!(
            c.list_collection_ids("users/alice").await.unwrap(),
            vec!["orders"]
        );
        // 実体のない親ドキュメントでもサブコレクションは取れる
        assert_eq!(
            c.list_collection_ids("users/ghost").await.unwrap(),
            vec!["orders"]
        );
        assert!(c.list_collection_ids("users").await.is_err());
    }

    #[tokio::test]
    #[ignore = "Firestore Emulator が必要"]
    async fn converts_seeded_document() {
        let doc = emulator_client().get_document("users/alice").await.unwrap();
        assert_eq!(doc.id, "alice");
        assert_eq!(doc.path, "users/alice");
        let expected = json!({
            "name": "Alice",
            "age": 30,
            "score": 92.5,
            "ratio": { "$double": 1.0 },
            "active": true,
            "nickname": null,
            "createdAt": { "$timestamp": "2026-01-01T09:00:00.123456Z" },
            "avatar": { "$bytes": "iVBORw0KGgo=" },
            "bestFriend": { "$ref": "projects/demo-firestore-viewer/databases/(default)/documents/users/bob" },
            "home": { "$geo": { "lat": 35.681236, "lng": 139.767125 } },
            "tags": ["admin", "beta", 1],
            "profile": {
                "address": { "city": "Tokyo", "zip": "100-0005" },
                "links": [{ "label": "blog", "url": "https://example.com" }]
            },
            "bigId": { "$int": "9007199254740993" },
            "notANumber": { "$double": "NaN" },
            "$$ref": "ドルで始まるキー"
        });
        assert_eq!(serde_json::Value::Object(doc.fields), expected);

        let err = emulator_client()
            .get_document("users/nobody")
            .await
            .unwrap_err();
        assert!(
            matches!(
                err,
                AppError::Api {
                    http_status: 404,
                    ..
                }
            ),
            "{err:?}"
        );
    }

    #[tokio::test]
    #[ignore = "Firestore Emulator が必要"]
    async fn pages_through_documents() {
        let c = emulator_client();
        let mut ids = Vec::new();
        let mut token: Option<String> = None;
        let mut pages = 0;
        loop {
            let page = c
                .list_documents("logs", 50, token.as_deref())
                .await
                .unwrap();
            pages += 1;
            ids.extend(page.documents.into_iter().map(|d| d.id));
            match page.next_page_token {
                Some(t) => token = Some(t),
                None => break,
            }
        }
        assert_eq!(ids.len(), 120);
        assert!(pages >= 3);

        let users = c.list_documents("users", 50, None).await.unwrap();
        let ghost = users.documents.iter().find(|d| d.id == "ghost").unwrap();
        assert!(ghost.missing);
        assert!(
            !users
                .documents
                .iter()
                .find(|d| d.id == "alice")
                .unwrap()
                .missing
        );

        assert!(c.list_documents("users/alice", 50, None).await.is_err());
    }

    fn spec(v: serde_json::Value) -> QuerySpec {
        serde_json::from_value(v).unwrap()
    }

    #[tokio::test]
    #[ignore = "Firestore Emulator が必要"]
    async fn runs_queries() {
        let c = emulator_client();

        // where + orderBy + limit
        let r = c
            .run_query(&spec(json!({
                "targetKind": "collection", "target": "logs",
                "where": [{ "field": "level", "op": "==", "valueType": "string", "value": "error" }],
                "orderBy": [{ "field": "seq", "direction": "desc" }],
                "limit": 3
            })))
            .await
            .unwrap();
        let seqs: Vec<_> = r
            .documents
            .iter()
            .map(|d| d.fields["seq"].clone())
            .collect();
        assert_eq!(seqs, vec![json!(119), json!(116), json!(113)]);
        assert!(r.read_time.is_some());

        // collectionGroup（実体のない親 ghost 配下も含む）
        let r = c
            .run_query(&spec(
                json!({ "targetKind": "collectionGroup", "target": "orders", "limit": 100 }),
            ))
            .await
            .unwrap();
        let mut paths: Vec<_> = r.documents.iter().map(|d| d.path.as_str()).collect();
        paths.sort();
        assert_eq!(
            paths,
            vec![
                "users/alice/orders/o1",
                "users/alice/orders/o2",
                "users/ghost/orders/o9"
            ]
        );

        // サブコレクション + timestamp 比較
        let r = c
            .run_query(&spec(json!({
                "targetKind": "collection", "target": "users/alice/orders",
                "where": [{ "field": "orderedAt", "op": ">", "valueType": "timestamp", "value": "2026-03-02T00:00:00Z" }]
            })))
            .await
            .unwrap();
        assert_eq!(
            r.documents
                .iter()
                .map(|d| d.id.as_str())
                .collect::<Vec<_>>(),
            vec!["o2"]
        );

        // null（unaryFilter）、__name__、array-contains-any、ネストしたフィールド
        let ids = |r: QueryResult| r.documents.into_iter().map(|d| d.id).collect::<Vec<_>>();
        let q = |w: serde_json::Value| {
            spec(json!({ "targetKind": "collection", "target": "users", "where": [w] }))
        };
        assert_eq!(
            ids(c
                .run_query(&q(
                    json!({ "field": "nickname", "op": "==", "valueType": "null" })
                ))
                .await
                .unwrap()),
            vec!["alice"]
        );
        assert_eq!(
            ids(c.run_query(&q(json!({ "field": "__name__", "op": "==", "valueType": "string", "value": "bob" }))).await.unwrap()),
            vec!["bob"]
        );
        let mut any = ids(c.run_query(&q(json!({ "field": "tags", "op": "array-contains-any", "valueType": "string", "value": "admin,beta" }))).await.unwrap());
        any.sort();
        assert_eq!(any, vec!["alice", "bob"]);
        assert_eq!(
            ids(c.run_query(&q(json!({ "field": "profile.address.city", "op": "==", "valueType": "string", "value": "Tokyo" }))).await.unwrap()),
            vec!["alice"]
        );
        assert_eq!(
            ids(c.run_query(&q(json!({ "field": "bestFriend", "op": "==", "valueType": "reference", "value": "users/bob" }))).await.unwrap()),
            vec!["alice"]
        );
    }
}
