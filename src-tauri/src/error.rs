use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// ADC の作成・更新を促すヒント（現在の言語）
pub fn adc_login_hint() -> String {
    tr!(
        "`gcloud auth application-default login` を実行して ADC を作成・更新してください。",
        "Run `gcloud auth application-default login` to create or refresh ADC."
    )
}

#[derive(Debug)]
pub enum AppError {
    /// ADC の読み込み・トークン取得失敗、または API が 401/403 を返した
    Auth {
        message: String,
        detail: Option<String>,
    },

    /// Google の API（Firestore / Authentication）がエラーレスポンスを返した
    Api {
        /// 呼び出した API の表示名（Firestore / Authentication）
        service: &'static str,
        http_status: u16,
        status: String,
        message: String,
    },

    /// 接続できない・タイムアウトなど
    Network(String),
    InvalidInput(String),
    File(String),

    /// Firestore のレスポンスが想定外の形式だった
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
            AppError::File(_) => "FILE",
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

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let text = match self {
            AppError::Auth { message, .. } => {
                tr!("認証エラー: {message}", "Authentication error: {message}")
            }
            AppError::Api {
                service,
                status,
                message,
                ..
            } => tr!(
                "{service} API エラー ({status}): {message}",
                "{service} API error ({status}): {message}"
            ),
            AppError::Network(m) => tr!("ネットワークエラー: {m}", "Network error: {m}"),
            AppError::InvalidInput(m) => tr!("入力が不正です: {m}", "Invalid input: {m}"),
            AppError::File(m) => tr!(
                "ファイルを保存できませんでした: {m}",
                "Could not save the file: {m}"
            ),
            AppError::Decode(m) => tr!(
                "レスポンスを解析できませんでした: {m}",
                "Could not parse the response: {m}"
            ),
        };
        f.write_str(&text)
    }
}

impl std::error::Error for AppError {}

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

#[cfg(test)]
mod tests {
    use super::AppError;
    use crate::i18n;

    #[test]
    fn display_follows_language() {
        let _guard = i18n::test_lock();
        let e = AppError::Network("timeout".into());
        i18n::set_english(true);
        let en = e.to_string();
        i18n::set_english(false);
        assert_eq!(en, "Network error: timeout");
        assert_eq!(e.to_string(), "ネットワークエラー: timeout");
    }
}
