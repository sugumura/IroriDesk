use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub const ADC_LOGIN_HINT: &str =
    "`gcloud auth application-default login` を実行して ADC を作成・更新してください。";

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// ADC の読み込み・トークン取得失敗、または API が 401/403 を返した
    #[error("認証エラー: {message}")]
    Auth {
        message: String,
        detail: Option<String>,
    },

    /// Firestore API がエラーレスポンスを返した
    #[error("Firestore API エラー ({status}): {message}")]
    Api {
        http_status: u16,
        status: String,
        message: String,
    },

    /// 接続できない・タイムアウトなど
    #[error("ネットワークエラー: {0}")]
    Network(String),

    #[error("入力が不正です: {0}")]
    InvalidInput(String),

    /// Firestore のレスポンスが想定外の形式だった
    #[error("レスポンスを解析できませんでした: {0}")]
    Decode(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Auth { .. } => "AUTH",
            AppError::Api { .. } => "API",
            AppError::Network(_) => "NETWORK",
            AppError::InvalidInput(_) => "INVALID_INPUT",
            AppError::Decode(_) => "DECODE",
        }
    }

    fn detail(&self) -> Option<String> {
        match self {
            AppError::Auth { detail, .. } => detail.clone(),
            AppError::Api {
                http_status,
                status,
                ..
            } => Some(format!("HTTP {http_status} {status}")),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        // reqwest のエラー表示にヘッダーは含まれないため、トークンは漏れない
        AppError::Network(e.without_url().to_string())
    }
}

/// フロントには `{ code, message, detail }` の形で返す
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 3)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.serialize_field("detail", &self.detail())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
