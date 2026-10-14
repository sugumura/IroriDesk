//! アプリの settings.json を読む（MCP モードは読むだけで書き込まない）

use std::path::PathBuf;

use serde::Deserialize;

use crate::connection::ConnectionConfig;

/// tauri.conf.json の identifier と同じ（アプリのデータ領域のフォルダ名）
const IDENTIFIER: &str = "dev.sugumura.iroridesk";
const SETTINGS_FILE: &str = "settings.json";

/// アプリのデータ領域（Tauri の app_data_dir と同じ場所）。
/// テストや別の設定で動かすときは IRORI_DESK_DATA_DIR で上書きできる
pub fn data_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("IRORI_DESK_DATA_DIR") {
        return Some(PathBuf::from(dir));
    }
    dirs::data_dir().map(|d| d.join(IDENTIFIER))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    /// 1回の呼び出しで、これを超えて読むときは利用者に確認する
    #[serde(default = "default_per_call")]
    pub confirm_docs_per_call: u64,
    /// MCP サーバーの起動からの累計がこれを超えるときは利用者に確認する
    #[serde(default = "default_per_session")]
    pub confirm_docs_per_session: u64,
}

fn default_per_call() -> u64 {
    300
}

fn default_per_session() -> u64 {
    2000
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            confirm_docs_per_call: default_per_call(),
            confirm_docs_per_session: default_per_session(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Appearance {
    #[serde(default)]
    language: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub connections: Vec<ConnectionConfig>,
    #[serde(default)]
    pub gcloud_path: Option<String>,
    #[serde(default)]
    pub agent: AgentSettings,
    #[serde(default)]
    appearance: Appearance,
}

impl Settings {
    /// 呼ばれるたびに読み直す（アプリで許可を変えたら、エージェント側を再起動しなくても反映される）
    pub fn load() -> Self {
        let Some(path) = data_dir().map(|d| d.join(SETTINGS_FILE)) else {
            return Self::default();
        };
        std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    /// AI エージェントからの利用を許可された接続
    pub fn allowed_connections(&self) -> impl Iterator<Item = &ConnectionConfig> {
        self.connections.iter().filter(|c| c.agent_access)
    }

    /// ID か名前で、許可された接続を探す
    pub fn find_connection(&self, key: &str) -> Option<&ConnectionConfig> {
        let key = key.trim();
        self.allowed_connections()
            .find(|c| c.id == key)
            .or_else(|| self.allowed_connections().find(|c| c.name == key))
    }

    /// 利用者向けのダイアログを日本語で出すか（アプリの表示言語に合わせる）
    pub fn japanese_ui(&self) -> bool {
        match self.appearance.language.as_deref() {
            Some("ja") => true,
            Some("en") => false,
            _ => sys_locale_is_japanese(),
        }
    }
}

fn sys_locale_is_japanese() -> bool {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .any(|v| v.starts_with("ja"))
        || cfg!(target_os = "macos") && macos_prefers_japanese()
}

/// GUI から起動された MCP では LANG が無いことが多いため、macOS の言語設定を見る
fn macos_prefers_japanese() -> bool {
    std::process::Command::new("defaults")
        .args(["read", "-g", "AppleLanguages"])
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .nth(1)
                .is_some_and(|l| l.contains("ja"))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_agent_settings_and_filters_connections() {
        let json = r#"{
          "connections": [
            {"id": "a", "name": "Prod", "projectId": "p", "kind": "production", "agentAccess": true},
            {"id": "b", "name": "Emu", "projectId": "demo", "kind": "emulator"}
          ],
          "agent": {"confirmDocsPerCall": 10},
          "appearance": {"language": "en"}
        }"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.allowed_connections().count(), 1);
        assert!(s.find_connection("Prod").is_some());
        assert!(s.find_connection("a").is_some());
        assert!(
            s.find_connection("b").is_none(),
            "許可していない接続は使えない"
        );
        assert_eq!(s.agent.confirm_docs_per_call, 10);
        assert_eq!(s.agent.confirm_docs_per_session, 2000);
        assert!(!s.japanese_ui());
    }
}
