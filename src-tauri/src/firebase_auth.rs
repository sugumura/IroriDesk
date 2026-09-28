//! Firebase Authentication のユーザーを読み取る（Identity Toolkit REST API v1）。
//! 読み取り専用。パスワードのハッシュとソルトはフロントに渡さない

use std::sync::Arc;

use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::{Method, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::auth::{AdcTokenSource, EmulatorTokenSource, TokenSource};
use crate::connection::{ConnectionConfig, ConnectionKind};
use crate::error::{AppError, AppResult};
use crate::firestore::check_status;

const PRODUCTION_BASE_URL: &str = "https://identitytoolkit.googleapis.com";
const MAX_PAGE_SIZE: u32 = 1000;

/// 応答に含まれても画面に渡さないフィールド
const SECRET_FIELDS: &[&str] = &["passwordHash", "salt"];

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LookupKind {
    Uid,
    Email,
    Phone,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayUser {
    pub uid: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub display_name: Option<String>,
    pub phone_number: Option<String>,
    pub photo_url: Option<String>,
    pub disabled: bool,
    /// password, google.com など
    pub providers: Vec<String>,
    /// RFC3339（UTC）
    pub created_at: Option<String>,
    pub last_login_at: Option<String>,
    pub last_refresh_at: Option<String>,
    /// カスタムクレーム（JSON として解釈できたもの）
    pub custom_claims: Option<Value>,
    pub tenant_id: Option<String>,
    /// 秘密情報を除いた元の応答（詳細表示用）
    pub raw: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPage {
    pub users: Vec<DisplayUser>,
    pub next_page_token: Option<String>,
}

fn str_field(m: &Map<String, Value>, key: &str) -> Option<String> {
    m.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// ミリ秒のエポック（文字列または数値）を RFC3339 にする
fn millis_to_rfc3339(v: Option<&Value>) -> Option<String> {
    let ms = match v? {
        Value::String(s) => s.parse::<i64>().ok()?,
        Value::Number(n) => n.as_i64()?,
        _ => return None,
    };
    DateTime::<Utc>::from_timestamp_millis(ms)
        .map(|d| d.to_rfc3339_opts(SecondsFormat::Millis, true))
}

impl DisplayUser {
    pub fn from_raw(mut raw: Value) -> AppResult<Self> {
        let m = raw
            .as_object_mut()
            .ok_or_else(|| AppError::Decode("ユーザー情報が object ではありません".into()))?;
        for key in SECRET_FIELDS {
            m.remove(*key);
        }
        let uid = str_field(m, "localId")
            .ok_or_else(|| AppError::Decode("ユーザー情報に localId がありません".into()))?;
        let providers = m
            .get("providerUserInfo")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|p| {
                        p.get("providerId")
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                    })
                    .collect()
            })
            .unwrap_or_default();
        // customAttributes は JSON 文字列で返る
        let custom_claims = m
            .get("customAttributes")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .map(|s| serde_json::from_str(s).unwrap_or_else(|_| Value::String(s.to_owned())));
        Ok(Self {
            uid,
            email: str_field(m, "email"),
            email_verified: m
                .get("emailVerified")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            display_name: str_field(m, "displayName"),
            phone_number: str_field(m, "phoneNumber"),
            photo_url: str_field(m, "photoUrl"),
            disabled: m.get("disabled").and_then(Value::as_bool).unwrap_or(false),
            providers,
            created_at: millis_to_rfc3339(m.get("createdAt")),
            last_login_at: millis_to_rfc3339(m.get("lastLoginAt")),
            last_refresh_at: str_field(m, "lastRefreshAt"),
            custom_claims,
            tenant_id: str_field(m, "tenantId"),
            raw,
        })
    }
}

pub struct AuthClient {
    http: reqwest::Client,
    base_url: String,
    project_id: String,
    quota_project: Option<String>,
    tokens: Arc<dyn TokenSource>,
}

impl AuthClient {
    pub fn from_connection(
        conn: &ConnectionConfig,
        http: reqwest::Client,
        adc: Arc<AdcTokenSource>,
    ) -> AppResult<Self> {
        let project_id = conn.project_id.trim();
        if project_id.is_empty() {
            return Err(AppError::InvalidInput("プロジェクトIDが未入力です".into()));
        }
        Ok(match conn.kind {
            ConnectionKind::Production => Self {
                http,
                base_url: PRODUCTION_BASE_URL.to_owned(),
                project_id: project_id.to_owned(),
                // Identity Toolkit はユーザー ADC だと quota project が必須。未指定なら接続先を使う
                quota_project: Some(conn.quota_project().unwrap_or(project_id).to_owned()),
                tokens: adc,
            },
            ConnectionKind::Emulator => {
                let host = conn.auth_emulator_host();
                let base = if host.contains("://") {
                    host.trim_end_matches('/').to_owned()
                } else {
                    format!("http://{host}")
                };
                Self {
                    http,
                    base_url: format!("{base}/identitytoolkit.googleapis.com"),
                    project_id: project_id.to_owned(),
                    quota_project: None,
                    tokens: Arc::new(EmulatorTokenSource),
                }
            }
        })
    }

    fn url(&self, action: &str) -> AppResult<Url> {
        let mut url = Url::parse(&self.base_url)
            .map_err(|e| AppError::InvalidInput(format!("接続先URLが不正です: {e}")))?;
        url.path_segments_mut()
            .map_err(|_| AppError::InvalidInput("接続先URLが不正です".into()))?
            .pop_if_empty()
            .extend(["v1", "projects", &self.project_id, action]);
        Ok(url)
    }

    async fn request(&self, method: Method, url: Url) -> AppResult<RequestBuilder> {
        let token = self.tokens.bearer_token().await?;
        let mut req = self.http.request(method, url).bearer_auth(token);
        if let Some(qp) = &self.quota_project {
            req = req.header("x-goog-user-project", qp);
        }
        Ok(req)
    }

    pub async fn list_users(
        &self,
        page_size: u32,
        page_token: Option<&str>,
    ) -> AppResult<UserPage> {
        let mut url = self.url("accounts:batchGet")?;
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("maxResults", &page_size.clamp(1, MAX_PAGE_SIZE).to_string());
            if let Some(t) = page_token.filter(|t| !t.is_empty()) {
                q.append_pair("nextPageToken", t);
            }
        }
        let res = self.request(Method::GET, url).await?.send().await?;
        let body: Value = check_status(res).await?.json().await?;
        Ok(UserPage {
            users: users_from(&body)?,
            next_page_token: body
                .get("nextPageToken")
                .and_then(Value::as_str)
                .filter(|t| !t.is_empty())
                .map(str::to_owned),
        })
    }

    /// UID / メールアドレス / 電話番号の完全一致で検索する
    pub async fn lookup(&self, kind: LookupKind, value: &str) -> AppResult<Vec<DisplayUser>> {
        let value = value.trim();
        if value.is_empty() {
            return Err(AppError::InvalidInput(
                "検索する値を入力してください".into(),
            ));
        }
        let body = match kind {
            LookupKind::Uid => json!({ "localId": [value] }),
            LookupKind::Email => json!({ "email": [value] }),
            LookupKind::Phone => json!({ "phoneNumber": [value] }),
        };
        let url = self.url("accounts:lookup")?;
        let res = self
            .request(Method::POST, url)
            .await?
            .json(&body)
            .send()
            .await?;
        let body: Value = check_status(res).await?.json().await?;
        users_from(&body)
    }
}

fn users_from(body: &Value) -> AppResult<Vec<DisplayUser>> {
    body.get("users")
        .and_then(Value::as_array)
        .map(|a| a.iter().cloned().map(DisplayUser::from_raw).collect())
        .unwrap_or_else(|| Ok(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_user_and_strips_secrets() {
        let raw = json!({
            "localId": "u1",
            "email": "a@example.com",
            "emailVerified": true,
            "displayName": "Alice",
            "passwordHash": "SECRET",
            "salt": "SALT",
            "providerUserInfo": [
                { "providerId": "password", "email": "a@example.com" },
                { "providerId": "google.com", "rawId": "123" }
            ],
            "createdAt": "1767225600000",
            "lastLoginAt": "1767229200123",
            "lastRefreshAt": "2026-01-01T01:00:00.123Z",
            "customAttributes": "{\"admin\":true}",
            "disabled": true
        });
        let u = DisplayUser::from_raw(raw).unwrap();
        assert_eq!(u.uid, "u1");
        assert_eq!(u.providers, vec!["password", "google.com"]);
        assert_eq!(u.created_at.as_deref(), Some("2026-01-01T00:00:00.000Z"));
        assert_eq!(u.last_login_at.as_deref(), Some("2026-01-01T01:00:00.123Z"));
        assert_eq!(u.custom_claims, Some(json!({ "admin": true })));
        assert!(u.disabled && u.email_verified);
        assert!(u.raw.get("passwordHash").is_none());
        assert!(u.raw.get("salt").is_none());
        let serialized = serde_json::to_string(&u).unwrap();
        assert!(!serialized.contains("SECRET") && !serialized.contains("SALT"));
    }

    #[test]
    fn minimal_user_and_invalid_claims() {
        let u = DisplayUser::from_raw(json!({ "localId": "u2", "customAttributes": "not json" }))
            .unwrap();
        assert_eq!(u.email, None);
        assert!(u.providers.is_empty());
        assert_eq!(u.custom_claims, Some(json!("not json")));
        assert!(DisplayUser::from_raw(json!({ "email": "x" })).is_err());
    }

    fn conn(kind: ConnectionKind) -> ConnectionConfig {
        ConnectionConfig {
            id: "c".into(),
            name: "c".into(),
            project_id: "demo-firestore-viewer".into(),
            database_id: None,
            quota_project: None,
            read_only: true,
            kind,
            emulator_host: None,
            auth_emulator_host: Some(
                std::env::var("FIREBASE_AUTH_EMULATOR_HOST").unwrap_or("127.0.0.1:9099".into()),
            ),
        }
    }

    #[test]
    fn builds_urls() {
        let prod = AuthClient::from_connection(
            &conn(ConnectionKind::Production),
            reqwest::Client::new(),
            Arc::default(),
        )
        .unwrap();
        assert_eq!(
            prod.url("accounts:batchGet").unwrap().as_str(),
            "https://identitytoolkit.googleapis.com/v1/projects/demo-firestore-viewer/accounts:batchGet"
        );
        assert_eq!(prod.quota_project.as_deref(), Some("demo-firestore-viewer"));
        let emu = AuthClient::from_connection(
            &conn(ConnectionKind::Emulator),
            reqwest::Client::new(),
            Arc::default(),
        )
        .unwrap();
        assert_eq!(
            emu.url("accounts:lookup").unwrap().as_str(),
            "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-firestore-viewer/accounts:lookup"
        );
    }

    #[tokio::test]
    #[ignore = "Firebase Auth Emulator と pnpm seed が必要"]
    async fn lists_and_looks_up_emulator_users() {
        let c = AuthClient::from_connection(
            &conn(ConnectionKind::Emulator),
            crate::firestore::build_http_client(),
            Arc::default(),
        )
        .unwrap();
        let mut all = Vec::new();
        let mut token: Option<String> = None;
        loop {
            let page = c.list_users(2, token.as_deref()).await.unwrap();
            all.extend(page.users);
            match page.next_page_token {
                Some(t) => token = Some(t),
                None => break,
            }
        }
        assert!(all.len() >= 3, "{}", all.len());
        assert!(all.iter().all(|u| u.raw.get("passwordHash").is_none()));

        let found = c
            .lookup(LookupKind::Email, "alice@example.com")
            .await
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(
            found[0].custom_claims,
            Some(json!({ "admin": true, "plan": "pro" }))
        );
        assert!(found[0].providers.contains(&"password".to_owned()));
        assert_eq!(
            c.lookup(LookupKind::Uid, "no-such-user").await.unwrap(),
            vec![]
        );
    }
}
