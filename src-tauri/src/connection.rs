use serde::{Deserialize, Serialize};

pub const DEFAULT_DATABASE_ID: &str = "(default)";
pub const DEFAULT_EMULATOR_HOST: &str = "localhost:8080";
pub const DEFAULT_AUTH_EMULATOR_HOST: &str = "localhost:9099";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionKind {
    Production,
    Emulator,
}

/// フロントで管理・永続化される接続設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub project_id: String,
    #[serde(default)]
    pub database_id: Option<String>,
    #[serde(default)]
    pub quota_project: Option<String>,
    /// MVP では常に読み取りのみだが、第2段階の書き込み機能のために保持する
    #[serde(default = "default_true")]
    pub read_only: bool,
    pub kind: ConnectionKind,
    #[serde(default)]
    pub emulator_host: Option<String>,
    /// Firebase Auth Emulator のホスト（Emulator 接続のみ）
    #[serde(default)]
    pub auth_emulator_host: Option<String>,
}

fn default_true() -> bool {
    true
}

fn non_empty(s: &Option<String>) -> Option<&str> {
    s.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

impl ConnectionConfig {
    pub fn database_id(&self) -> &str {
        non_empty(&self.database_id).unwrap_or(DEFAULT_DATABASE_ID)
    }

    pub fn quota_project(&self) -> Option<&str> {
        non_empty(&self.quota_project)
    }

    pub fn emulator_host(&self) -> &str {
        non_empty(&self.emulator_host).unwrap_or(DEFAULT_EMULATOR_HOST)
    }

    pub fn auth_emulator_host(&self) -> &str {
        non_empty(&self.auth_emulator_host).unwrap_or(DEFAULT_AUTH_EMULATOR_HOST)
    }
}
