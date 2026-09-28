use std::sync::Arc;
use std::time::Duration;

use reqwest::{Method, RequestBuilder, Response, Url};
use serde::Deserialize;
use serde_json::json;

use super::document::{DisplayDocument, RestDocument};
use super::path::document_segments;
use crate::auth::{AdcTokenSource, EmulatorTokenSource, TokenSource};
use crate::connection::{ConnectionConfig, ConnectionKind};
use crate::error::{AppError, AppResult, ADC_LOGIN_HINT};

const PRODUCTION_BASE_URL: &str = "https://firestore.googleapis.com";
const LIST_COLLECTION_IDS_PAGE_SIZE: u32 = 300;

/// Firestore への読み取り操作。本番と Emulator は同じ実装（RestClient）で扱う
#[async_trait::async_trait]
pub trait FirestoreApi: Send + Sync {
    /// `parent_document` 直下のコレクションID一覧。空文字ならルートコレクション
    async fn list_collection_ids(&self, parent_document: &str) -> AppResult<Vec<String>>;

    /// ドキュメントを1件取得する。`path` は `users/alice` のような相対パス
    async fn get_document(&self, path: &str) -> AppResult<DisplayDocument>;
}

pub struct RestClient {
    http: reqwest::Client,
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
        adc: Arc<AdcTokenSource>,
    ) -> AppResult<Self> {
        let project_id = conn.project_id.trim();
        if project_id.is_empty() {
            return Err(AppError::InvalidInput("プロジェクトIDが未入力です".into()));
        }
        let (base_url, tokens, quota_project): (String, Arc<dyn TokenSource>, _) = match conn.kind {
            ConnectionKind::Production => (
                PRODUCTION_BASE_URL.to_owned(),
                adc,
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
            base_url,
            project_id: project_id.to_owned(),
            database_id: conn.database_id().to_owned(),
            quota_project,
            tokens,
        })
    }

    /// `v1/projects/{p}/databases/{db}/documents/{docPath...}{suffix}` を組み立てる。
    /// セグメントごとにパーセントエンコードされる
    fn documents_url(&self, doc_segments: &[&str], suffix: &str) -> Url {
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
            match doc_segments.split_last() {
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

/// 非2xxレスポンスを AppError に変換する
async fn check_status(res: Response) -> AppResult<Response> {
    let http_status = res.status();
    if http_status.is_success() {
        return Ok(res);
    }
    let text = res.text().await.unwrap_or_default();
    let (status, message) = match serde_json::from_str::<GoogleErrorBody>(&text) {
        Ok(b) => (b.error.status, b.error.message),
        Err(_) => (String::new(), text),
    };
    if http_status.as_u16() == 401 || status == "UNAUTHENTICATED" {
        return Err(AppError::Auth {
            message: format!("認証に失敗しました。{ADC_LOGIN_HINT}"),
            detail: Some(message),
        });
    }
    Err(AppError::Api {
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
        };
        RestClient::from_connection(&conn, reqwest::Client::new(), Arc::default()).unwrap()
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
        };
        RestClient::from_connection(&conn, build_http_client(), Arc::default()).unwrap()
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
}
