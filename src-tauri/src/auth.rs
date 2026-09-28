use std::sync::Arc;

use gcp_auth::{ConfigDefaultCredentials, TokenProvider};
use tokio::sync::OnceCell;

use crate::error::{adc_login_hint, AppError, AppResult};

const SCOPES: &[&str] = &["https://www.googleapis.com/auth/datastore"];

/// Authorization ヘッダーに載せるトークンを供給する
#[async_trait::async_trait]
pub trait TokenSource: Send + Sync {
    async fn bearer_token(&self) -> AppResult<String>;
}

/// `gcloud auth application-default login` で作られた ADC ファイルを使う。
/// トークンは Rust 側だけで保持し、gcp_auth がキャッシュと更新を行う。
#[derive(Default)]
pub struct AdcTokenSource {
    // 初期化に失敗した場合は未初期化のまま残るので、ログイン後の再試行で読み直される
    provider: OnceCell<Arc<ConfigDefaultCredentials>>,
}

impl AdcTokenSource {
    async fn provider(&self) -> AppResult<&Arc<ConfigDefaultCredentials>> {
        self.provider
            .get_or_try_init(|| async {
                ConfigDefaultCredentials::new()
                    .await
                    .map(Arc::new)
                    .map_err(|e| AppError::Auth {
                        message: tr!(
                            "ADC を読み込めませんでした。{}",
                            "Could not load ADC. {}",
                            adc_login_hint()
                        ),
                        detail: Some(e.to_string()),
                    })
            })
            .await
    }
}

#[async_trait::async_trait]
impl TokenSource for AdcTokenSource {
    async fn bearer_token(&self) -> AppResult<String> {
        let token = self
            .provider()
            .await?
            .token(SCOPES)
            .await
            .map_err(|e| AppError::Auth {
                message: tr!(
                    "アクセストークンを取得できませんでした。{}",
                    "Could not get an access token. {}",
                    adc_login_hint()
                ),
                detail: Some(e.to_string()),
            })?;
        Ok(token.as_str().to_owned())
    }
}

/// Emulator はセキュリティルールを迂回する固定トークン `owner` を受け付ける
pub struct EmulatorTokenSource;

#[async_trait::async_trait]
impl TokenSource for EmulatorTokenSource {
    async fn bearer_token(&self) -> AppResult<String> {
        Ok("owner".to_owned())
    }
}
